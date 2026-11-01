import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { app, sessionStore } from '../artifacts/interviewprep/server/app.mjs';
import { pool } from '../artifacts/interviewprep/server/db.mjs';
import { seedQuestionTypes } from '../artifacts/interviewprep/server/question-types.mjs';

const userIds: number[] = [];
const csrfTokens: string[] = [];

async function signUp() {
  // Each agent owns an independent cookie jar, just like separate browsers.
  const agent = request.agent(app);
  const status = await agent.get('/api/auth/status').expect(200);
  csrfTokens.push(status.body.csrfToken);
  const password = 'isolation-test-only-password!';
  const result = await agent.post('/api/auth/signup')
    .set('X-CSRF-Token', status.body.csrfToken)
    .send({
      email: `isolation-${randomUUID()}@example.test`,
      password,
      confirmPassword: password,
    }).expect(201);
  userIds.push(result.body.user.id);
  csrfTokens.push(result.body.csrfToken);
  return { agent, id: result.body.user.id as number, csrfToken: result.body.csrfToken as string };
}

beforeAll(async () => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Data-isolation tests must run against development, never production.');
  }
  // App import doesn't start its listener or startup seeder.
  await seedQuestionTypes();
});

afterAll(async () => {
  try {
    if (process.env.NODE_ENV !== 'production') {
      await pool.query(
        "DELETE FROM login_sessions WHERE sess->>'csrfToken'=ANY($1::text[]) OR (sess->>'userId')::int=ANY($2::int[])",
        [csrfTokens, userIds],
      );
      // The FK's ON DELETE CASCADE removes only these users' practice rows.
      await pool.query('DELETE FROM users WHERE id=ANY($1::int[])', [userIds]);
      const remaining = await pool.query('SELECT id FROM practice_sessions WHERE user_id=ANY($1::int[])', [userIds]);
      expect(remaining.rows).toEqual([]);
    }
  } finally {
    sessionStore.close();
    await pool.end();
  }
});

describe('practice-session data isolation', () => {
  it('keeps custom behavioral categories private and rejects foreign IDs in writes and filters', async () => {
    const a = await signUp(), b = await signUp();
    const name = `Coaching ${randomUUID().slice(0, 8)}`;
    const created = await a.agent.post('/api/question-types').set('X-CSRF-Token', a.csrfToken)
      .send({ name: `  ${name}  `, user_id: b.id }).expect(201);
    const id = created.body.id;
    expect(created.body).toMatchObject({ name, kind: 'behavioral', user_id: a.id });
    const aTypes = (await a.agent.get('/api/question-types').expect(200)).body;
    const bTypes = (await b.agent.get('/api/question-types').expect(200)).body;
    expect(aTypes.behavioral.some((q: { id: number }) => q.id === id)).toBe(true);
    expect(bTypes.behavioral.some((q: { id: number }) => q.id === id)).toBe(false);
    expect(aTypes.behavioral.at(-1).name).toBe('Other');
    const shared = aTypes.behavioral.filter((q: { user_id: number | null; name: string }) => q.user_id === null && q.name !== 'Other');
    expect(shared.map((q: { name: string }) => q.name)).toEqual(shared.map((q: { name: string }) => q.name).sort((x: string, y: string) => x.toLowerCase().localeCompare(y.toLowerCase())));
    const payload = { session_date: '2025-01-01', question_type_id: id, prompt: 'Category privacy',
      format: 'solo', overall_score: 4 };
    const denied = await b.agent.post('/api/sessions').set('X-CSRF-Token', b.csrfToken)
      .send(payload).expect(400);
    expect(denied.body.errors.question_type_id).toBe('Please choose a question type.');
    await b.agent.post('/api/stories').set('X-CSRF-Token', b.csrfToken)
      .send({ title: 'Foreign category', competency_id: id }).expect(400);
    await b.agent.get('/api/sessions').query({ type: id }).expect(400);
    await b.agent.get('/api/stories').query({ competency: id }).expect(400);
    const owned = await a.agent.post('/api/sessions').set('X-CSRF-Token', a.csrfToken)
      .send(payload).expect(201);
    const ownStory = await a.agent.post('/api/stories').set('X-CSRF-Token', a.csrfToken)
      .send({ title: 'Custom competency', competency_id: id }).expect(201);
    expect(ownStory.body.competency_name).toBe(name);
    const bSession = await b.agent.post('/api/sessions').set('X-CSRF-Token', b.csrfToken)
      .send({ ...payload, question_type_id: bTypes.behavioral[0].id }).expect(201);
    await b.agent.put(`/api/sessions/${bSession.body.id}`).set('X-CSRF-Token', b.csrfToken)
      .send(payload).expect(400);
    const bStory = await b.agent.post('/api/stories').set('X-CSRF-Token', b.csrfToken)
      .send({ title: 'Own story', competency_id: bTypes.behavioral[0].id }).expect(201);
    await b.agent.put(`/api/stories/${bStory.body.id}`).set('X-CSRF-Token', b.csrfToken)
      .send({ title: 'Own story', competency_id: id }).expect(400);
    expect((await a.agent.get(`/api/sessions/${owned.body.id}`).expect(200)).body.question_type_id).toBe(id);
    // The same private name is allowed for another user.
    await b.agent.post('/api/question-types').set('X-CSRF-Token', b.csrfToken).send({ name }).expect(201);
  });

  it('validates custom category names and enforces normalized uniqueness in PostgreSQL', async () => {
    const a = await signUp();
    const post = (name: string) => a.agent.post('/api/question-types')
      .set('X-CSRF-Token', a.csrfToken).send({ name });
    expect((await post('   ').expect(400)).body.errors.name).toBe('Please enter a category name.');
    expect((await post('x'.repeat(41)).expect(400)).body.errors.name).toBe('Please keep it under 40 characters.');
    expect((await post('  WHY   consulting ').expect(400)).body.errors.name)
      .toBe('You already have a category called WHY consulting.');
    const name = `Test ${randomUUID().slice(0, 8)}`;
    await post(name).expect(201);
    await post(name.toUpperCase().replace(' ', '   ')).expect(400);
    await a.agent.post('/api/question-types').set('X-CSRF-Token', a.csrfToken)
      .send({ name: 'Custom case', kind: 'case' }).expect(400);
    await a.agent.post('/api/question-types').send({ name: 'Missing CSRF' }).expect(403);
    await expect(pool.query("INSERT INTO question_types(name,kind,user_id) VALUES ($1,'behavioral',$2)",
      [name.toUpperCase(), a.id])).rejects.toMatchObject({ code: '23505' });
    await expect(pool.query("INSERT INTO question_types(name,kind,user_id) VALUES ('  LEADERSHIP  ','behavioral',$1)",
      [a.id])).rejects.toMatchObject({ code: '23505' });
    await expect(pool.query("INSERT INTO question_types(name,kind,user_id) VALUES ($1,'case',$2)",
      [`Case ${randomUUID().slice(0, 8)}`, a.id])).rejects.toMatchObject({ code: '23514' });
    const raceName = `Race ${randomUUID().slice(0, 8)}`;
    const results = await Promise.all([post(raceName), post(raceName.toUpperCase())]);
    expect(results.map(r => r.status).sort()).toEqual([201, 400]);
    await seedQuestionTypes();
    expect((await a.agent.get('/api/question-types').expect(200)).body.behavioral
      .filter((q: { name: string }) => q.name === name)).toHaveLength(1);
  });

  it("keeps User A's Coffee chain profitability session out of User B's list and returns 404 for direct access", async () => {
    const userA = await signUp();
    const userB = await signUp();
    const types = await userA.agent.get('/api/question-types').expect(200);
    const profitability = types.body.case.find((type: { name: string }) => type.name === 'Profitability');
    expect(profitability).toBeDefined();

    const created = await userA.agent.post('/api/sessions')
      .set('X-CSRF-Token', userA.csrfToken)
      // Forged ownership must be ignored; identity comes from A's cookie.
      .send({
        user_id: userB.id,
        session_date: '2026-11-01',
        question_type_id: profitability.id,
        prompt: 'Coffee chain profitability',
        format: 'solo',
        overall_score: 3,
      }).expect(201);
    const id = created.body.id as number;
    expect(created.body.prompt).toBe('Coffee chain profitability');
    const owned = await pool.query('SELECT user_id FROM practice_sessions WHERE id=$1', [id]);
    expect(owned.rows[0].user_id).toBe(userA.id);

    const aList = await userA.agent.get('/api/sessions').expect(200);
    expect(aList.body.sessions.map((session: { id: number }) => session.id)).toContain(id);
    const bList = await userB.agent.get('/api/sessions').expect(200);
    expect(bList.body).toEqual({ sessions: [], total: 0 });
    const bSearch = await userB.agent.get('/api/sessions').query({ q: 'Coffee chain' }).expect(200);
    expect(bSearch.body.sessions).toEqual([]);

    const story = await userA.agent.post('/api/stories')
      .set('X-CSRF-Token', userA.csrfToken)
      .send({ title: 'A private leadership story', competency_id: types.body.behavioral[0].id })
      .expect(201);
    const hiddenStory = await userB.agent.get(`/api/stories/${story.body.id}`).expect(404);
    expect(hiddenStory.body).toEqual({ message: 'Story not found' });
    const rejectedLink = await userB.agent.post('/api/sessions')
      .set('X-CSRF-Token', userB.csrfToken)
      .send({
        session_date: '2025-01-01', question_type_id: types.body.behavioral[0].id,
        prompt: 'Attempt to use another user’s story', format: 'solo', overall_score: 3,
        story_id: story.body.id,
      }).expect(400);
    expect(rejectedLink.body.errors.story_id).toBe('Please choose one of your stories.');
    expect((await userB.agent.get('/api/sessions').expect(200)).body.sessions).toEqual([]);

    const hidden = await userB.agent.get(`/api/sessions/${id}`).expect(404);
    expect(hidden.body).toEqual({ message: 'Session not found' });
    const missing = await userB.agent.get('/api/sessions/2147483647').expect(404);
    expect(hidden.body).toEqual(missing.body);
    const forbiddenStar = await userB.agent.post(`/api/sessions/${id}/star`)
      .set('X-CSRF-Token', userB.csrfToken).expect(404);
    expect(forbiddenStar.body).toEqual({ message: 'Session not found' });

    for (const method of ['put', 'delete'] as const) {
      const rejected = await userB.agent[method](`/api/sessions/${id}`)
        .set('X-CSRF-Token', userB.csrfToken)
        .send(method === 'put' ? { prompt: 'Not my session' } : undefined)
        .expect(404);
      expect(rejected.body).toEqual(hidden.body);
    }
    const stillOwned = await userA.agent.get(`/api/sessions/${id}`).expect(200);
    expect(stillOwned.body.prompt).toBe('Coffee chain profitability');
  });
});
