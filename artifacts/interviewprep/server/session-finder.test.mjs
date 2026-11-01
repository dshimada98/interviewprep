import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { app, sessionStore } from './app.mjs';
import { pool } from './db.mjs';
import { seedQuestionTypes } from './question-types.mjs';
import { seedCaseSections } from './case-sections.mjs';

test('database search, combined filters, sorting and private total counts', async t => {
  assert.notEqual(process.env.NODE_ENV, 'production', 'Development tests only.');
  const users = [], tokens = [];
  try {
    await seedQuestionTypes();
    await seedCaseSections();
    async function account() {
      const agent = request.agent(app);
      const status = await agent.get('/api/auth/status').expect(200);
      tokens.push(status.body.csrfToken);
      const password = 'finder-test-only-password!';
      const signed = await agent.post('/api/auth/signup').set('X-CSRF-Token', status.body.csrfToken)
        .send({ email: `finder-${randomUUID()}@example.test`, password, confirmPassword: password }).expect(201);
      users.push(signed.body.user.id);
      tokens.push(signed.body.csrfToken);
      return { agent, token: signed.body.csrfToken };
    }
    const a = await account(), b = await account();
    const types = (await a.agent.get('/api/question-types').expect(200)).body;
    const profit = types.case.find(x => x.name === 'Profitability').id;
    const entry = types.case.find(x => x.name === 'Market Entry').id;
    const leadership = types.behavioral.find(x => x.name === 'Leadership').id;
    const sections = (await a.agent.get('/api/case-sections').expect(200)).body;
    const fixture = [
      [profit, '2025-01-01', 1, 'Coffee chain profitability', 'Clear estimation', null],
      [entry, '2025-03-01', 5, 'Retail expansion', 'Coffee chain synthesis', 'Better structure'],
      [leadership, '2025-02-01', 3, 'Team conflict', null, 'Coffee chain reflection'],
      [profit, '2025-04-01', 2, 'Insurance pricing', null, null],
      [profit, '2025-05-01', 4, 'Wholesale margins', null, null],
      [entry, '2025-06-01', 5, "Literal 50% margin_increase\\check O'Reilly", null, null],
      [profit, '2025-03-01', 5, 'Other example', null, null],
    ];
    const ids = [];
    for (const [index, [question_type_id, session_date, overall_score, prompt, went_well, to_improve]] of fixture.entries()) {
      const section_scores = index === 3 ? [
        { section_id: sections[0].id, score: 3, went_well: 'Coffee chain framework' },
        { section_id: sections[1].id, score: 4, went_well: 'Coffee chain framework again', to_improve: 'Coffee chain clarity' },
      ] : index === 4 ? [{ section_id: sections[0].id, score: 2, to_improve: 'Coffee chain units' }] : [];
      const saved = await a.agent.post('/api/sessions').set('X-CSRF-Token', a.token).send({
        question_type_id, session_date, overall_score, prompt, went_well, to_improve, format: 'solo', section_scores,
      }).expect(201);
      ids.push(saved.body.id);
    }
    const list = async (query = {}, user = a) =>
      (await user.agent.get('/api/sessions').query(query).expect(200)).body;
    const find = async query => (await list(query)).sessions.map(s => ids.indexOf(s.id) + 1);
    await t.test('default order, total count and empty-user totals stay private', async () => {
      await request(app).get('/api/sessions?q=Coffee').expect(401);
      assert.deepEqual(await find({}), [6, 5, 4, 7, 2, 3, 1]);
      assert.equal((await list()).total, 7);
      assert.deepEqual(await list({}, b), { sessions: [], total: 0 });
      assert.deepEqual(await list({ q: 'Coffee chain' }, b), { sessions: [], total: 0 });
    });
    await t.test('case-insensitive search covers all five note/prompt fields and never duplicates parents', async () => {
      const matched = await list({ q: '  cOfFeE CHAIN  ' });
      assert.deepEqual(matched.sessions.map(s => ids.indexOf(s.id) + 1), [5, 4, 2, 3, 1]);
      assert.equal(matched.total, 7);
      assert.equal(new Set(matched.sessions.map(s => s.id)).size, 5);
      assert.deepEqual(await find({ q: 'framework' }), [4]);
      assert.deepEqual(await find({ q: 'units' }), [5]);
      assert.deepEqual(await list({ q: 'no matching text' }), { sessions: [], total: 7 });
    });
    await t.test('quotes, SQL-looking strings, percent, underscore and backslash are literal safe text', async () => {
      for (const q of ['%', '_', '\\', "O'Reilly", '50%']) assert.deepEqual(await find({ q }), [6], q);
      assert.deepEqual(await find({ q: "' OR 1=1 --" }), []);
      assert.equal((await list()).total, 7);
    });
    await t.test('kind, type and overall-score bands combine with search', async () => {
      assert.deepEqual(await find({ kind: 'behavioral' }), [3]);
      assert.deepEqual(await find({ type: profit }), [5, 4, 7, 1]);
      assert.deepEqual(await find({ score: 'low' }), [4, 1]);
      assert.deepEqual(await find({ score: 'mid' }), [3]);
      assert.deepEqual(await find({ score: 'high' }), [6, 5, 7, 2]);
      assert.deepEqual(await find({ q: 'coffee', kind: 'case', type: profit, score: 'low' }), [4, 1]);
      assert.deepEqual(await find({ kind: 'case', type: leadership }), []);
    });
    await t.test('four allowlisted sort modes use newest session date for score ties', async () => {
      assert.deepEqual(await find({ sort: 'oldest' }), [1, 3, 7, 2, 4, 5, 6]);
      assert.deepEqual(await find({ sort: 'highest' }), [6, 7, 2, 5, 3, 4, 1]);
      assert.deepEqual(await find({ sort: 'lowest' }), [1, 4, 3, 5, 6, 7, 2]);
      assert.deepEqual(await find({ sort: 'newest' }), [6, 5, 4, 7, 2, 3, 1]);
    });
    await t.test('invalid scalar and repeated parameters are ignored, never interpolated into SQL', async () => {
      const baseline = await find({});
      for (const query of [
        { kind: 'invalid', type: '-1', score: '9', sort: 'wrong', starred: 'yes' },
        { type: '1.5' }, { type: '2147483648' }, { type: '2147483647' },
        { sort: 'newest; DROP TABLE users' }, { q: ['Coffee', 'Retail'] },
        { kind: ['case', 'behavioral'], type: ['1', '2'], score: ['low', 'high'], sort: ['oldest', 'lowest'] },
      ]) assert.deepEqual(await find(query), baseline);
    });
    await t.test('starred remains private and combines with every finder parameter', async () => {
      for (const id of [ids[0], ids[3], ids[5]]) {
        await a.agent.post(`/api/sessions/${id}/star`).set('X-CSRF-Token', a.token).expect(204);
      }
      assert.deepEqual(await find({ starred: true }), [6, 4, 1]);
      assert.deepEqual(await find({ starred: true, q: 'coffee', kind: 'case', type: profit, score: 'low', sort: 'oldest' }), [1, 4]);
      assert.equal((await list({ starred: true })).total, 7);
      assert.deepEqual(await list({ starred: true }, b), { sessions: [], total: 0 });
    });
  } finally {
    await pool.query("DELETE FROM login_sessions WHERE sess->>'csrfToken'=ANY($1::text[]) OR (sess->>'userId')::int=ANY($2::int[])",
      [tokens, users]);
    await pool.query('DELETE FROM users WHERE id=ANY($1::int[])', [users]);
    sessionStore.close();
    await pool.end();
  }
});
