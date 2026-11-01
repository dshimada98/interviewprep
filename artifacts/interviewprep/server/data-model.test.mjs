import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { app, sessionStore } from './app.mjs';
import { pool } from './db.mjs';
import { seedQuestionTypes, questionTypeSeeds } from './question-types.mjs';

test('Feature 2 reference data, database constraints, and protected API', async t => {
  assert.notEqual(process.env.NODE_ENV, 'production', 'Run tests against development only.');
  const ids = [];
  const tokens = [];
  const client = await pool.connect();
  try {
    await seedQuestionTypes();
    await t.test('seeding is idempotent and safe for concurrent starts', async () => {
      const before = (await pool.query('SELECT id, name, kind FROM question_types ORDER BY id')).rows;
      await Promise.all([seedQuestionTypes(), seedQuestionTypes(), seedQuestionTypes()]);
      assert.deepEqual((await pool.query('SELECT id, name, kind FROM question_types ORDER BY id')).rows, before);
      for (const [name, kind] of questionTypeSeeds) {
        assert.equal(before.filter(row => row.name === name && row.kind === kind).length, 1);
      }
    });
    await t.test('seeding restores a missing row without modifying existing rows', async () => {
      await client.query('BEGIN');
      try {
        const before = (await client.query('SELECT id, name, kind FROM question_types ORDER BY id')).rows;
        const missing = before.find(row => row.name === 'Why Consulting');
        await client.query('DELETE FROM question_types WHERE id=$1', [missing.id]);
        await seedQuestionTypes(client);
        const after = (await client.query('SELECT id, name, kind FROM question_types ORDER BY id')).rows;
        assert.equal(after.length, before.length);
        assert.equal(after.filter(row => row.name === 'Why Consulting' && row.kind === 'behavioral').length, 1);
        assert.deepEqual(after.filter(row => row.name !== 'Why Consulting'), before.filter(row => row.name !== 'Why Consulting'));
      } finally { await client.query('ROLLBACK'); }
    });
    await t.test('database enforces types, required fields, ranges, foreign keys, and cascade', async () => {
      await client.query('BEGIN');
      try {
        const user = (await client.query(
          'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
          [`model-${randomUUID()}@example.test`, 'test-only-not-a-login-account'],
        )).rows[0];
        const type = (await client.query('SELECT id FROM question_types ORDER BY id LIMIT 1')).rows[0];
        const insert = `INSERT INTO practice_sessions
          (user_id, question_type_id, session_date, prompt, overall_score)
          VALUES ($1, $2, $3, $4, $5) RETURNING *`;
        const values = [user.id, type.id, '2026-11-01', 'Test-only case', 3];
        const saved = (await client.query(insert, values)).rows[0];
        assert.equal(saved.format, 'solo');
        assert.equal(saved.duration_minutes, null);
        assert.ok(saved.created_at);
        async function rejects(sql, params, code) {
          await client.query('SAVEPOINT invalid_input');
          try { await assert.rejects(client.query(sql, params), error => error.code === code); }
          finally { await client.query('ROLLBACK TO SAVEPOINT invalid_input'); }
        }
        for (const index of [0, 1, 2, 3, 4]) {
          const invalid = [...values]; invalid[index] = null;
          await rejects(insert, invalid, '23502');
        }
        for (const score of [0, 6]) {
          await rejects(insert, [...values.slice(0, 4), score], '23514');
        }
        await rejects(insert, [...values.slice(0, 4), '3.5'], '22P02');
        await rejects(insert, [-1, ...values.slice(1)], '23503');
        await rejects(insert, [user.id, -1, ...values.slice(2)], '23503');
        await rejects('UPDATE practice_sessions SET format=$1 WHERE id=$2', ['invalid', saved.id], '23514');
        await rejects('UPDATE practice_sessions SET format=NULL WHERE id=$1', [saved.id], '23502');
        await rejects('UPDATE practice_sessions SET duration_minutes=$1 WHERE id=$2', ['1.5', saved.id], '22P02');
        for (const format of ['partner', 'mock']) {
          await client.query('UPDATE practice_sessions SET format=$1 WHERE id=$2', [format, saved.id]);
        }
        await rejects('INSERT INTO question_types (name, kind) VALUES ($1,$2)', ['Invalid test kind', 'other'], '23514');
        await rejects('INSERT INTO question_types (name, kind) VALUES ($1,$2)', ['Profitability', 'case'], '23505');
        await rejects('INSERT INTO question_types (name, kind) VALUES ($1,$2)', [null, 'case'], '23502');
        await rejects('INSERT INTO question_types (name, kind) VALUES ($1,$2)', ['Missing kind', null], '23502');
        const columns = (await client.query(
          "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='practice_sessions'",
        )).rows;
        assert.ok(!columns.some(row => row.column_name === 'story_id'));
        await client.query('DELETE FROM users WHERE id=$1', [user.id]);
        assert.equal((await client.query('SELECT id FROM practice_sessions WHERE id=$1', [saved.id])).rowCount, 0);
      } finally { await client.query('ROLLBACK'); }
    });
    await t.test('API requires login and shares the same groups with different users', async () => {
      await request(app).get('/api/question-types').expect(401);
      let first;
      for (let i = 0; i < 2; i++) {
        const agent = request.agent(app);
        const status = await agent.get('/api/auth/status').expect(200);
        tokens.push(status.body.csrfToken);
        const password = 'model-test-only-password!';
        const result = await agent.post('/api/auth/signup').set('X-CSRF-Token', status.body.csrfToken)
          .send({ email: `model-api-${randomUUID()}@example.test`, password, confirmPassword: password }).expect(201);
        ids.push(result.body.user.id);
        tokens.push(result.body.csrfToken);
        const { body } = await agent.get('/api/question-types').expect(200);
        assert.deepEqual(Object.keys(body).sort(), ['behavioral', 'case']);
        for (const kind of ['case', 'behavioral']) {
          assert.deepEqual(body[kind].map(row => row.name).sort(),
            questionTypeSeeds.filter(([, k]) => k === kind).map(([name]) => name).sort());
          assert.ok(body[kind].every(row => row.kind === kind && Number.isInteger(row.id) && !('user_id' in row)));
        }
        if (first) assert.deepEqual(body, first);
        first = body;
      }
    });
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.query("DELETE FROM login_sessions WHERE sess->>'csrfToken'=ANY($1::text[]) OR (sess->>'userId')::int=ANY($2::int[])", [tokens, ids]);
    await pool.query('DELETE FROM users WHERE id=ANY($1::int[])', [ids]);
    sessionStore.close();
    await pool.end();
  }
});
