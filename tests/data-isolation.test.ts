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
