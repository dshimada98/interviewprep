import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { app, sessionStore } from './app.mjs';
import { pool } from './db.mjs';
import { seedQuestionTypes } from './question-types.mjs';

test('private, idempotent session stars and shared junction table', async t => {
  assert.notEqual(process.env.NODE_ENV, 'production', 'Development tests only.');
  const users = [], tokens = [];
  try {
    await seedQuestionTypes();
    async function account() {
      const agent = request.agent(app);
      const status = await agent.get('/api/auth/status').expect(200);
      tokens.push(status.body.csrfToken);
      const password = 'stars-test-only-password!';
      const result = await agent.post('/api/auth/signup').set('X-CSRF-Token', status.body.csrfToken)
        .send({ email: `stars-${randomUUID()}@example.test`, password, confirmPassword: password }).expect(201);
      users.push(result.body.user.id);
      tokens.push(result.body.csrfToken);
      return { agent, id: result.body.user.id, token: result.body.csrfToken };
    }
    const a = await account(), b = await account();
    const types = (await a.agent.get('/api/question-types').expect(200)).body;
    const input = {
      question_type_id: types.case[0].id, session_date: '2025-01-01', prompt: 'Private redo practice',
      format: 'solo', overall_score: 3,
    };
    const write = (user, method, path, body) => user.agent[method](path).set('X-CSRF-Token', user.token).send(body);
    const aOld = (await write(a, 'post', '/api/sessions', input).expect(201)).body;
    const aNew = (await write(a, 'post', '/api/sessions', { ...input, session_date: '2025-02-01' }).expect(201)).body;
    const bSession = (await write(b, 'post', '/api/sessions', input).expect(201)).body;
    const starPath = id => `/api/sessions/${id}/star`;
    const rows = async (userId, sessionId) => (await pool.query(
      'SELECT * FROM stars WHERE user_id=$1 AND session_id=$2', [userId, sessionId],
    )).rows;

    await t.test('new sessions have boolean false and starred-only starts empty', async () => {
      assert.equal(aOld.starred, false);
      assert.equal(aNew.starred, false);
      assert.equal((await a.agent.get(`/api/sessions/${aOld.id}`).expect(200)).body.starred, false);
      assert.deepEqual((await a.agent.get('/api/sessions?starred=true').expect(200)).body, []);
      assert.ok((await a.agent.get('/api/sessions').expect(200)).body.every(row => row.starred === false));
    });
    await t.test('login and CSRF are required for both mutations', async () => {
      for (const method of ['post', 'delete']) {
        await request(app)[method](starPath(aOld.id)).expect(401);
        await a.agent[method](starPath(aOld.id)).expect(403);
        await a.agent[method](starPath(aOld.id)).set('X-CSRF-Token', b.token).expect(403);
      }
      await request(app).get('/api/sessions?starred=true').expect(401);
      assert.equal((await rows(a.id, aOld.id)).length, 0);
    });
    await t.test('foreign, missing, and malformed IDs are hidden without mutation', async () => {
      for (const method of ['post', 'delete']) {
        for (const id of [aOld.id, 2147483647, 'bad', '0', '-1', '1.5', '2147483648']) {
          const rejected = await write(b, method, starPath(id), { user_id: a.id }).expect(404);
          assert.deepEqual(rejected.body, { message: 'Session not found' });
        }
      }
      assert.equal((await rows(a.id, aOld.id)).length, 0);
      assert.equal((await rows(b.id, aOld.id)).length, 0);
    });
    await t.test('unstar is harmless when absent; star ignores forged identity and is idempotent under retries', async () => {
      await write(a, 'delete', starPath(aOld.id)).expect(204);
      await write(a, 'delete', starPath(aOld.id)).expect(204);
      await write(a, 'post', starPath(aOld.id), { user_id: b.id }).expect(204);
      const first = await rows(a.id, aOld.id);
      assert.equal(first.length, 1);
      assert.ok(first[0].created_at instanceof Date);
      await Promise.all(Array.from({ length: 4 }, () => write(a, 'post', starPath(aOld.id)).expect(204)));
      assert.deepEqual(await rows(a.id, aOld.id), first);
      assert.equal((await rows(b.id, aOld.id)).length, 0);
      assert.equal((await a.agent.get(`/api/sessions/${aOld.id}`).expect(200)).body.starred, true);
    });
    await t.test('starred-only lists are private and ordered by session date, not star time', async () => {
      await write(a, 'post', starPath(aNew.id)).expect(204);
      await write(b, 'post', starPath(bSession.id)).expect(204);
      const aStars = (await a.agent.get('/api/sessions?starred=true').expect(200)).body;
      assert.deepEqual(aStars.map(row => row.id), [aNew.id, aOld.id]);
      assert.ok(aStars.every(row => row.starred === true));
      assert.deepEqual((await b.agent.get('/api/sessions?starred=true').expect(200)).body.map(row => row.id), [bSession.id]);
      const updated = await write(a, 'put', `/api/sessions/${aOld.id}`, { ...input, prompt: 'Still starred after editing' }).expect(200);
      assert.equal(updated.body.starred, true);
      const foreignDelete = await write(b, 'delete', starPath(aOld.id)).expect(404);
      assert.deepEqual(foreignDelete.body, { message: 'Session not found' });
      assert.equal((await a.agent.get(`/api/sessions/${aOld.id}`).expect(200)).body.starred, true);
    });
    await t.test('unstar twice is harmless and reflected in list and detail responses', async () => {
      await write(a, 'delete', starPath(aOld.id)).expect(204);
      await write(a, 'delete', starPath(aOld.id)).expect(204);
      assert.equal((await rows(a.id, aOld.id)).length, 0);
      assert.equal((await a.agent.get(`/api/sessions/${aOld.id}`).expect(200)).body.starred, false);
      assert.equal((await a.agent.get('/api/sessions').expect(200)).body.find(row => row.id === aOld.id).starred, false);
      assert.deepEqual((await a.agent.get('/api/sessions?starred=true').expect(200)).body.map(row => row.id), [aNew.id]);
    });
    await t.test('composite primary key enforces uniqueness and both foreign keys enforce valid references', async () => {
      await assert.rejects(pool.query('INSERT INTO stars (user_id,session_id) VALUES ($1,$2)', [a.id, aNew.id]),
        error => error.code === '23505');
      await assert.rejects(pool.query('INSERT INTO stars (user_id,session_id) VALUES ($1,$2)', [2147483647, aNew.id]),
        error => error.code === '23503');
      await assert.rejects(pool.query('INSERT INTO stars (user_id,session_id) VALUES ($1,$2)', [a.id, 2147483647]),
        error => error.code === '23503');
      await assert.rejects(pool.query('INSERT INTO stars (user_id,session_id) VALUES (NULL,$1)', [aNew.id]),
        error => error.code === '23502');
    });
    await t.test('deleting a practice session cascades its stars, without removing other sessions stars', async () => {
      await write(a, 'delete', `/api/sessions/${aNew.id}`).expect(204);
      assert.equal((await rows(a.id, aNew.id)).length, 0);
      assert.equal((await rows(b.id, bSession.id)).length, 1);
      assert.deepEqual((await a.agent.get('/api/sessions?starred=true').expect(200)).body, []);
    });
    await t.test('deleting a user cascades their junction rows even when the practice session remains', async () => {
      const c = await account();
      // Deliberate SQL-only fixture isolates the user FK from the session FK.
      // The API forbids cross-owner stars, as the privacy tests above prove.
      await pool.query('INSERT INTO stars (user_id,session_id) VALUES ($1,$2)', [c.id, aOld.id]);
      await pool.query('DELETE FROM users WHERE id=$1', [c.id]);
      assert.equal((await rows(c.id, aOld.id)).length, 0);
      assert.equal((await a.agent.get(`/api/sessions/${aOld.id}`).expect(200)).body.id, aOld.id);
    });
  } finally {
    await pool.query("DELETE FROM login_sessions WHERE sess->>'csrfToken'=ANY($1::text[]) OR (sess->>'userId')::int=ANY($2::int[])",
      [tokens, users]);
    await pool.query('DELETE FROM users WHERE id=ANY($1::int[])', [users]);
    sessionStore.close();
    await pool.end();
  }
});
