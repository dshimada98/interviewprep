import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { app, sessionStore } from './app.mjs';
import { pool } from './db.mjs';
import { seedQuestionTypes } from './question-types.mjs';
import { caseSectionSeeds, seedCaseSections, replaceSectionScores } from './case-sections.mjs';
import { sessionTransaction } from './practice-sessions.mjs';

test('case scorecard seeding, privacy, atomic replacement and database constraints', async t => {
  assert.notEqual(process.env.NODE_ENV, 'production', 'Development tests only.');
  const ids = [], tokens = [];
  try {
    await seedQuestionTypes();
    await seedCaseSections();
    async function account() {
      const agent = request.agent(app);
      const status = await agent.get('/api/auth/status').expect(200);
      tokens.push(status.body.csrfToken);
      const password = 'scorecard-test-only-password!';
      const result = await agent.post('/api/auth/signup').set('X-CSRF-Token', status.body.csrfToken)
        .send({ email: `scorecard-${randomUUID()}@example.test`, password, confirmPassword: password }).expect(201);
      ids.push(result.body.user.id);
      tokens.push(result.body.csrfToken);
      return { agent, token: result.body.csrfToken, id: result.body.user.id };
    }
    const a = await account(), b = await account();
    const write = (actor, method, path, data) => actor.agent[method](path)
      .set('X-CSRF-Token', actor.token).send(data);
    const sections = (await a.agent.get('/api/case-sections').expect(200)).body;
    const types = (await a.agent.get('/api/question-types').expect(200)).body;
    const base = {
      question_type_id: types.case[0].id, session_date: '2026-11-01',
      prompt: 'Scorecard test case', format: 'solo', overall_score: 3,
    };
    let session;
    await t.test('reference API requires login and startup seeds are ordered and idempotent', async () => {
      await request(app).get('/api/case-sections').expect(401);
      assert.deepEqual(sections.map(row => row.name), caseSectionSeeds);
      assert.deepEqual(sections.map(row => row.display_order), [1, 2, 3, 4, 5, 6, 7]);
      await Promise.all([seedCaseSections(), seedCaseSections()]);
      assert.deepEqual((await b.agent.get('/api/case-sections').expect(200)).body, sections);
    });
    await t.test('create saves scored sections only, ordered, with trimmed notes', async () => {
      const result = await write(a, 'post', '/api/sessions', {
        ...base, section_scores: [
          { section_id: sections[3].id, score: 2, to_improve: '  Check units  ' },
          { section_id: sections[0].id, score: 4, went_well: ' Clear opening ' },
        ],
      }).expect(201);
      session = result.body;
      assert.equal(session.section_scores.length, 2);
      assert.deepEqual(session.section_scores.map(row => row.section_name), ['Introduction', 'Math']);
      assert.equal(session.section_scores[0].went_well, 'Clear opening');
      assert.equal(session.section_scores[1].to_improve, 'Check units');
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM section_scores WHERE session_id=$1', [session.id])).rows[0].n, 2);
      assert.deepEqual((await a.agent.get(`/api/sessions/${session.id}`).expect(200)).body, session);
    });
    await t.test('foreign and missing sessions return identical 404 without exposing or changing notes', async () => {
      const missing = (await b.agent.get('/api/sessions/2147483647').expect(404)).body;
      assert.deepEqual((await b.agent.get(`/api/sessions/${session.id}`).expect(404)).body, missing);
      assert.deepEqual((await write(b, 'put', `/api/sessions/${session.id}`, {
        ...base, section_scores: [{ section_id: sections[0].id, score: 1, went_well: 'Not mine' }],
      }).expect(404)).body, missing);
      await write(b, 'delete', `/api/sessions/${session.id}`).expect(404);
      assert.deepEqual((await a.agent.get(`/api/sessions/${session.id}`).expect(200)).body, session);
    });
    await t.test('invalid scorecards do not change the parent or existing child rows', async () => {
      for (const section_scores of [
        [{ section_id: sections[0].id, score: 0 }],
        [{ section_id: sections[0].id, score: 6 }],
        [{ section_id: sections[0].id, score: 3.5 }],
        [{ section_id: sections[0].id, score: null }],
        [{ section_id: -1, score: 3 }],
        [{ section_id: 2147483647, score: 3 }],
        [{ section_id: sections[0].id, score: 3 }, { section_id: sections[0].id, score: 4 }],
      ]) {
        const count = (await a.agent.get('/api/sessions').expect(200)).body.length;
        for (const [method, path] of [['post', '/api/sessions'], ['put', `/api/sessions/${session.id}`]]) {
          const rejected = await write(a, method, path, {
            ...base, prompt: 'Must not overwrite', section_scores,
          }).expect(400);
          assert.equal(rejected.body.errors.section_scores, 'Section scores must be between 1 and 5.');
        }
        assert.equal((await a.agent.get('/api/sessions').expect(200)).body.length, count);
        assert.deepEqual((await a.agent.get(`/api/sessions/${session.id}`).expect(200)).body, session);
      }
    });
    await t.test('database rejects duplicate pairs, invalid scores, and missing foreign keys', async () => {
      const database = await pool.connect();
      await database.query('BEGIN');
      try {
        async function reject(sql, params, code) {
          await database.query('SAVEPOINT invalid');
          await assert.rejects(database.query(sql, params), error => error.code === code);
          await database.query('ROLLBACK TO SAVEPOINT invalid');
        }
        const sql = 'INSERT INTO section_scores (session_id, section_id, score) VALUES ($1,$2,$3)';
        await reject(sql, [session.id, sections[0].id, 3], '23505');
        for (const score of [0, 6]) await reject(sql, [session.id, sections[1].id, score], '23514');
        await reject(sql, [session.id, sections[1].id, '2.5'], '22P02');
        await reject(sql, [session.id, sections[1].id, null], '23502');
        await reject(sql, [null, sections[1].id, 3], '23502');
        await reject(sql, [session.id, null, 3], '23502');
        await reject(sql, [-1, sections[1].id, 3], '23503');
        await reject(sql, [session.id, -1, 3], '23503');
      } finally {
        await database.query('ROLLBACK');
        database.release();
      }
    });
    await t.test('a real insertion failure rolls back parent update, deletion and partial replacement', async () => {
      await assert.rejects(sessionTransaction(async database => {
        await database.query('SELECT id FROM practice_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE', [session.id, a.id]);
        await database.query('UPDATE practice_sessions SET prompt=$1 WHERE id=$2 AND user_id=$3', ['Must roll back', session.id, a.id]);
        await replaceSectionScores(database, session.id, [
          { section_id: sections[1].id, score: 5 },
          { section_id: sections[2].id, score: 6 },
        ]);
      }), error => error.code === '23514');
      assert.deepEqual((await a.agent.get(`/api/sessions/${session.id}`).expect(200)).body, session);
    });
    await t.test('repeated and concurrent edits replace rather than duplicate or interleave scores', async () => {
      const scores = sections.map(row => ({ section_id: row.id, score: 4, went_well: 'Updated' }));
      for (let i = 0; i < 3; i++) {
        const result = await write(a, 'put', `/api/sessions/${session.id}`, { ...base, section_scores: scores }).expect(200);
        assert.equal(result.body.section_scores.length, 7);
      }
      await Promise.all([4, 5].map(score => write(a, 'put', `/api/sessions/${session.id}`, {
        ...base, section_scores: sections.map(row => ({ section_id: row.id, score })),
      }).expect(200)));
      const saved = (await a.agent.get(`/api/sessions/${session.id}`).expect(200)).body;
      assert.equal(saved.section_scores.length, 7);
      assert.equal(new Set(saved.section_scores.map(row => row.section_id)).size, 7);
      assert.equal(new Set(saved.section_scores.map(row => row.score)).size, 1);
    });
    await t.test('N/A removes rows; behavioral sessions reject scores without saving', async () => {
      const cleared = await write(a, 'put', `/api/sessions/${session.id}`, { ...base, section_scores: [] }).expect(200);
      assert.deepEqual(cleared.body.section_scores, []);
      const restored = await write(a, 'put', `/api/sessions/${session.id}`, {
        ...base, section_scores: [{ section_id: sections[0].id, score: 3 }],
      }).expect(200);
      assert.equal(restored.body.section_scores.length, 1);
      const before = (await a.agent.get(`/api/sessions/${session.id}`).expect(200)).body;
      for (const [method, path] of [['post', '/api/sessions'], ['put', `/api/sessions/${session.id}`]]) {
        const rejected = await write(a, method, path, {
          ...base, question_type_id: types.behavioral[0].id,
          section_scores: [{ section_id: sections[0].id, score: 5 }],
        }).expect(400);
        assert.deepEqual(rejected.body.errors, { section_scores: 'Section scores must be between 1 and 5.' });
      }
      assert.deepEqual((await a.agent.get(`/api/sessions/${session.id}`).expect(200)).body, before);
      const behavioral = await write(a, 'put', `/api/sessions/${session.id}`, {
        ...base, question_type_id: types.behavioral[0].id, section_scores: [],
      }).expect(200);
      assert.deepEqual(behavioral.body.section_scores, []);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM section_scores WHERE session_id=$1', [session.id])).rows[0].n, 0);
      // Old clients that omit the array also mean an all-N/A replacement.
      const omitted = await write(a, 'put', `/api/sessions/${session.id}`, base).expect(200);
      assert.deepEqual(omitted.body.section_scores, []);
    });
    await t.test('deleting the owned parent cascades to all of its section scores', async () => {
      await write(a, 'put', `/api/sessions/${session.id}`, {
        ...base, section_scores: sections.map(row => ({ section_id: row.id, score: 3 })),
      }).expect(200);
      await write(a, 'delete', `/api/sessions/${session.id}`).expect(204);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM section_scores WHERE session_id=$1', [session.id])).rows[0].n, 0);
    });
  } finally {
    await pool.query("DELETE FROM login_sessions WHERE sess->>'csrfToken'=ANY($1::text[]) OR (sess->>'userId')::int=ANY($2::int[])", [tokens, ids]);
    await pool.query('DELETE FROM users WHERE id=ANY($1::int[])', [ids]);
    sessionStore.close();
    await pool.end();
  }
});
