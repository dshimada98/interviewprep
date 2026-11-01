import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { app, sessionStore } from './app.mjs';
import { pool } from './db.mjs';
import { seedQuestionTypes } from './question-types.mjs';

test('private practice-session CRUD and validation', async t => {
  assert.notEqual(process.env.NODE_ENV, 'production', 'Development database only.');
  const users = [];
  const tokens = [];
  try {
    await seedQuestionTypes();
    async function account() {
      const agent = request.agent(app);
      const status = await agent.get('/api/auth/status').expect(200);
      tokens.push(status.body.csrfToken);
      const password = 'session-test-password!';
      const result = await agent.post('/api/auth/signup').set('X-CSRF-Token', status.body.csrfToken)
        .send({ email: `crud-${randomUUID()}@example.test`, password, confirmPassword: password }).expect(201);
      users.push(result.body.user.id);
      tokens.push(result.body.csrfToken);
      return { agent, token: result.body.csrfToken, id: result.body.user.id };
    }
    const a = await account();
    const b = await account();
    const types = (await a.agent.get('/api/question-types').expect(200)).body;
    const valid = {
      question_type_id: types.case[0].id, session_date: '2026-11-01',
      prompt: 'Coffee chain profitability', format: 'partner', overall_score: 3,
      duration_minutes: 35, went_well: 'Clear framework', to_improve: 'Check units',
    };
    let saved;
    const write = (method, actor, path, data) => actor.agent[method](path)
      .set('X-CSRF-Token', actor.token).send(data);
    await t.test('every session route requires login', async () => {
      for (const [method, path] of [
        ['get', '/api/sessions'], ['post', '/api/sessions'],
        ['get', '/api/sessions/1'], ['put', '/api/sessions/1'], ['delete', '/api/sessions/1'],
      ]) await request(app)[method](path).send(valid).expect(401);
    });
    await t.test('creates from authenticated ownership, trims text, and returns calendar date', async () => {
      const result = await write('post', a, '/api/sessions', {
        ...valid, prompt: `  ${valid.prompt}  `, user_id: b.id, id: 999999,
      }).expect(201);
      saved = result.body;
      assert.equal(saved.prompt, valid.prompt);
      assert.equal(saved.session_date, valid.session_date);
      assert.equal(saved.kind, 'case');
      assert.equal(saved.question_type_name, types.case[0].name);
      assert.equal(saved.duration_minutes, 35);
      assert.ok(!('user_id' in saved));
      const row = (await pool.query('SELECT user_id FROM practice_sessions WHERE id=$1', [saved.id])).rows[0];
      assert.equal(row.user_id, a.id);
      assert.equal((await a.agent.get('/api/sessions').expect(200)).body[0].id, saved.id);
      assert.deepEqual((await a.agent.get(`/api/sessions/${saved.id}`).expect(200)).body, saved);
      assert.equal((await a.agent.get(`/api/sessions/${saved.id}`).expect(200)).headers['cache-control'], 'no-store');
    });
    await t.test('foreign list is empty and direct read/update/delete return not found without mutation', async () => {
      assert.deepEqual((await b.agent.get('/api/sessions').expect(200)).body, []);
      const missing = (await b.agent.get('/api/sessions/2147483647').expect(404)).body;
      assert.deepEqual((await b.agent.get(`/api/sessions/${saved.id}`).expect(404)).body, missing);
      assert.deepEqual((await write('put', b, `/api/sessions/${saved.id}`, {}).expect(404)).body, missing);
      assert.deepEqual((await write('delete', b, `/api/sessions/${saved.id}`).expect(404)).body, missing);
      assert.deepEqual((await a.agent.get(`/api/sessions/${saved.id}`).expect(200)).body, saved);
    });
    await t.test('mutations require a valid CSRF token', async () => {
      await a.agent.post('/api/sessions').send(valid).expect(403);
      await a.agent.put(`/api/sessions/${saved.id}`).send(valid).expect(403);
      await a.agent.delete(`/api/sessions/${saved.id}`).expect(403);
      await a.agent.delete(`/api/sessions/${saved.id}`).set('X-CSRF-Token', b.token).expect(403);
    });
    await t.test('validates every field on create and update without changing existing data', async () => {
      const cases = {
        session_date: [null, '', '2026-02-29', '2026-04-31', '0000-01-01', 'not-a-date', '2026-1-1'],
        question_type_id: [null, '', 0, -1, 1.2, 2147483648, 2147483647],
        prompt: [null, '', '  \n ', 123, 'a'.repeat(4001)],
        format: [null, '', 'phone'],
        overall_score: [null, '', '3', 0, 6, 1.5],
        duration_minutes: [-1, 1.5, '30', 2147483648],
        went_well: [123, 'a'.repeat(4001)],
        to_improve: [[], 'a'.repeat(4001)],
      };
      for (const [field, values] of Object.entries(cases)) {
        for (const value of values) {
          for (const [method, path] of [['post', '/api/sessions'], ['put', `/api/sessions/${saved.id}`]]) {
            const result = await write(method, a, path, { ...valid, [field]: value }).expect(400);
            assert.equal(typeof result.body.errors[field], 'string', `${method} ${field}=${JSON.stringify(value)}`);
          }
        }
      }
      for (const field of ['session_date', 'question_type_id', 'prompt', 'format', 'overall_score']) {
        const body = { ...valid }; delete body[field];
        assert.ok((await write('post', a, '/api/sessions', body).expect(400)).body.errors[field]);
      }
      assert.equal((await a.agent.get('/api/sessions').expect(200)).body.length, 1);
      assert.deepEqual((await a.agent.get(`/api/sessions/${saved.id}`).expect(200)).body, saved);
    });
    await t.test('updates existing row, changes kind, and clears optional values persistently', async () => {
      const edited = {
        ...valid, question_type_id: types.behavioral[0].id, prompt: 'Leading a difficult project',
        session_date: '2024-02-29', format: 'mock', overall_score: 5,
        duration_minutes: null, went_well: '', to_improve: null, user_id: b.id,
      };
      const result = await write('put', a, `/api/sessions/${saved.id}`, edited).expect(200);
      assert.equal(result.body.id, saved.id);
      assert.equal(result.body.kind, 'behavioral');
      assert.equal(result.body.prompt, edited.prompt);
      assert.equal(result.body.session_date, '2024-02-29');
      assert.equal(result.body.duration_minutes, null);
      assert.equal(result.body.went_well, null);
      assert.equal(result.body.to_improve, null);
      assert.equal(result.body.overall_score, 5);
      assert.equal((await a.agent.get('/api/sessions').expect(200)).body.length, 1);
      assert.deepEqual((await a.agent.get(`/api/sessions/${saved.id}`).expect(200)).body, result.body);
    });
    await t.test('supports omitted optional fields, zero minutes, score bounds and newest-first list', async () => {
      for (const [date, score, minutes] of [['2025-01-01', 1, 0], ['2026-01-01', 5, undefined]]) {
        const { duration_minutes: _m, went_well: _w, to_improve: _t, ...required } = valid;
        const result = await write('post', a, '/api/sessions', {
          ...required, session_date: date, overall_score: score, duration_minutes: minutes,
        }).expect(201);
        assert.equal(result.body.duration_minutes, minutes ?? null);
      }
      const list = (await a.agent.get('/api/sessions').expect(200)).body;
      assert.deepEqual(list.map(s => s.session_date), ['2026-01-01', '2025-01-01', '2024-02-29']);
    });
    await t.test('invalid IDs and missing rows consistently return not found', async () => {
      for (const id of ['0', '-1', '1.1', 'abc', '2147483648', '2147483647']) {
        await a.agent.get(`/api/sessions/${id}`).expect(404);
        await write('put', a, `/api/sessions/${id}`, valid).expect(404);
        await write('delete', a, `/api/sessions/${id}`).expect(404);
      }
    });
    await t.test('owner deletes persistently; repeated delete and reads return not found', async () => {
      await write('delete', a, `/api/sessions/${saved.id}`).expect(204);
      await a.agent.get(`/api/sessions/${saved.id}`).expect(404);
      await write('delete', a, `/api/sessions/${saved.id}`).expect(404);
      assert.ok(!(await a.agent.get('/api/sessions').expect(200)).body.some(row => row.id === saved.id));
      assert.equal((await pool.query('SELECT id FROM practice_sessions WHERE id=$1', [saved.id])).rowCount, 0);
    });
  } finally {
    await pool.query("DELETE FROM login_sessions WHERE sess->>'csrfToken'=ANY($1::text[]) OR (sess->>'userId')::int=ANY($2::int[])", [tokens, users]);
    await pool.query('DELETE FROM users WHERE id=ANY($1::int[])', [users]);
    sessionStore.close();
    await pool.end();
  }
});
