import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { app, sessionStore } from '../artifacts/interviewprep/server/app.mjs';
import { pool } from '../artifacts/interviewprep/server/db.mjs';
import { seedQuestionTypes } from '../artifacts/interviewprep/server/question-types.mjs';

type Actor = { agent: ReturnType<typeof request.agent>; id: number; token: string };
const ids: number[] = [], tokens: string[] = [];
let a: Actor, b: Actor, competency: number, otherCompetency: number, caseType: number;
let storyId: number, otherStoryId: number;
const linkedIds: number[] = [];
async function account(): Promise<Actor> {
  const agent = request.agent(app);
  const status = await agent.get('/api/auth/status').expect(200);
  tokens.push(status.body.csrfToken);
  const password = 'stories-test-only-password!';
  const signup = await agent.post('/api/auth/signup').set('X-CSRF-Token', status.body.csrfToken)
    .send({ email: `stories-${randomUUID()}@example.test`, password, confirmPassword: password }).expect(201);
  ids.push(signup.body.user.id); tokens.push(signup.body.csrfToken);
  return { agent, id: signup.body.user.id, token: signup.body.csrfToken };
}
const write = (actor: Actor, method: 'post' | 'put' | 'delete', path: string, data?: unknown) =>
  actor.agent[method](path).set('X-CSRF-Token', actor.token).send(data);
const storyBody = (extra = {}) => ({
  title: 'Budget reforecast leadership', competency_id: competency,
  context: 'FP&A, budget reforecast', situation: 'A forecast changed.',
  task: 'Coordinate the team.', action: 'I clarified owners.', result: 'We delivered on time.',
  ...extra,
});
const sessionBody = (extra = {}) => ({
  session_date: '2025-01-01', question_type_id: competency, prompt: 'Leadership practice',
  format: 'solo', overall_score: 3, ...extra,
});
beforeAll(async () => {
  if (process.env.NODE_ENV === 'production') throw new Error('Development tests only.');
  await seedQuestionTypes();
  a = await account(); b = await account();
  const types = (await a.agent.get('/api/question-types').expect(200)).body;
  competency = types.behavioral.find((t: { name: string }) => t.name === 'Leadership').id;
  otherCompetency = types.behavioral.find((t: { name: string }) => t.name === 'Teamwork').id;
  caseType = types.case[0].id;
});
afterAll(async () => {
  try {
    if (process.env.NODE_ENV !== 'production') {
      await pool.query(
        "DELETE FROM login_sessions WHERE sess->>'csrfToken'=ANY($1::text[]) OR (sess->>'userId')::int=ANY($2::int[])",
        [tokens, ids],
      );
      await pool.query('DELETE FROM users WHERE id=ANY($1::int[])', [ids]);
      expect((await pool.query('SELECT id FROM stories WHERE user_id=ANY($1::int[])', [ids])).rows).toEqual([]);
      expect((await pool.query('SELECT id FROM practice_sessions WHERE user_id=ANY($1::int[])', [ids])).rows).toEqual([]);
    }
  } finally { sessionStore.close(); await pool.end(); }
});

describe('private STAR stories and behavioral-session links', () => {
  it('requires login on every story route and CSRF on story writes', async () => {
    for (const [method, path] of [
      ['get', '/api/stories'], ['get', '/api/stories/1'], ['post', '/api/stories'],
      ['put', '/api/stories/1'], ['delete', '/api/stories/1'],
    ] as const) await request(app)[method](path).expect(401);
    await a.agent.post('/api/stories').send(storyBody()).expect(403);
  });

  it('validates required title, behavioral competency and text lengths without writing', async () => {
    const empty = await write(a, 'post', '/api/stories', {}).expect(400);
    expect(empty.body.errors).toMatchObject({
      title: 'Please give your story a short title.',
      competency_id: 'Please choose the main competency this story shows.',
    });
    for (const invalid of [caseType, 2147483647, '1', null]) {
      const response = await write(a, 'post', '/api/stories',
        storyBody({ competency_id: invalid, title: '   ' })).expect(400);
      expect(response.body.errors.competency_id).toBe('Please choose the main competency this story shows.');
      expect(response.body.errors.title).toBe('Please give your story a short title.');
    }
    await write(a, 'post', '/api/stories', storyBody({ title: 'x'.repeat(301) })).expect(400);
    await write(a, 'post', '/api/stories', storyBody({ action: 'x'.repeat(4001) })).expect(400);
    expect((await a.agent.get('/api/stories').expect(200)).body).toEqual([]);
  });

  it('creates only under the authenticated owner and safely accepts four full-length STAR sections', async () => {
    const created = await write(a, 'post', '/api/stories', storyBody({
      user_id: b.id, title: ' Budget reforecast leadership ',
    })).expect(201);
    storyId = created.body.id;
    expect(created.body).toMatchObject({
      title: 'Budget reforecast leadership', competency_name: 'Leadership',
      times_practiced: 0, average_score: null, sessions: [],
    });
    expect((await pool.query('SELECT user_id FROM stories WHERE id=$1', [storyId])).rows[0].user_id).toBe(a.id);
    const long = '界'.repeat(4000);
    const full = await write(a, 'post', '/api/stories', storyBody({
      context: long, situation: long, task: long, action: long, result: long,
    })).expect(201);
    expect(full.body.result).toBe(long);
    await write(a, 'delete', `/api/stories/${full.body.id}`).expect(204);
  });

  it('hides foreign, missing and malformed stories identically on read, edit and delete', async () => {
    for (const id of [storyId, 2147483647, 'not-an-id', '999999999999999']) {
      const hidden = await b.agent.get(`/api/stories/${id}`).expect(404);
      expect(hidden.body).toEqual({ message: 'Story not found' });
      for (const method of ['put', 'delete'] as const) {
        const denied = await write(b, method, `/api/stories/${id}`, storyBody()).expect(404);
        expect(denied.body).toEqual(hidden.body);
      }
    }
    expect((await b.agent.get('/api/stories').expect(200)).body).toEqual([]);
  });

  it('filters owned stories by one competency without leaking another user’s story', async () => {
    otherStoryId = (await write(a, 'post', '/api/stories',
      storyBody({ title: 'Teamwork story', competency_id: otherCompetency })).expect(201)).body.id;
    await write(b, 'post', '/api/stories', storyBody({ title: 'B private story' })).expect(201);
    const all = (await a.agent.get('/api/stories').expect(200)).body;
    expect(all.map((s: { id: number }) => s.id).sort((x: number, y: number) => x - y))
      .toEqual([storyId, otherStoryId].sort((x, y) => x - y));
    const filtered = await a.agent.get('/api/stories').query({ competency }).expect(200);
    expect(filtered.body.map((s: { id: number }) => s.id)).toEqual([storyId]);
    expect((await a.agent.get('/api/stories').query({ competency: 'invalid' }).expect(200)).body).toHaveLength(2);
  });

  it('calculates practice counts and rounded averages from linked owned behavioral sessions, newest first', async () => {
    for (const [day, score] of [[1, 3], [3, 4], [2, 4]]) {
      const response = await write(a, 'post', '/api/sessions', sessionBody({
        session_date: `2025-01-0${day}`, overall_score: score, story_id: storyId,
        question_type_id: day === 2 ? otherCompetency : competency,
      })).expect(201);
      linkedIds.push(response.body.id);
      expect(response.body.story_id).toBe(storyId);
      expect(response.body.story_title).toBe('Budget reforecast leadership');
    }
    const detail = (await a.agent.get(`/api/stories/${storyId}`).expect(200)).body;
    expect(detail.times_practiced).toBe(3);
    expect(detail.average_score).toBe(3.7);
    expect(detail.sessions.map((s: { id: number }) => s.id)).toEqual([linkedIds[1], linkedIds[2], linkedIds[0]]);
    expect((await a.agent.get('/api/stories').expect(200)).body
      .find((s: { id: number }) => s.id === storyId).average_score).toBe(3.7);
  });

  it('rejects foreign and missing story IDs on create and update with no partial writes', async () => {
    const original = (await write(b, 'post', '/api/sessions', sessionBody({ overall_score: 5 })).expect(201)).body;
    for (const foreign of [storyId, 2147483647]) {
      const create = await write(b, 'post', '/api/sessions', sessionBody({ story_id: foreign })).expect(400);
      expect(create.body.errors.story_id).toBe('Please choose one of your stories.');
      const edit = await write(b, 'put', `/api/sessions/${original.id}`,
        sessionBody({ story_id: foreign, overall_score: 1 })).expect(400);
      expect(edit.body.errors.story_id).toBe('Please choose one of your stories.');
    }
    const unchanged = (await b.agent.get(`/api/sessions/${original.id}`).expect(200)).body;
    expect(unchanged.overall_score).toBe(5);
    expect(unchanged.story_id).toBeNull();
    expect((await b.agent.get('/api/sessions').expect(200)).body.sessions).toHaveLength(1);
  });

  it('edits story content and competency while linked session titles remain current', async () => {
    const updated = await write(a, 'put', `/api/stories/${storyId}`,
      storyBody({ title: 'Revised STAR story', competency_id: otherCompetency, context: ' ' })).expect(200);
    expect(updated.body.context).toBeNull();
    expect(updated.body.competency_name).toBe('Teamwork');
    expect(updated.body.times_practiced).toBe(3);
    expect((await a.agent.get(`/api/sessions/${linkedIds[0]}`).expect(200)).body.story_title).toBe('Revised STAR story');
    const rejected = await write(a, 'put', `/api/stories/${storyId}`, storyBody({ title: '' })).expect(400);
    expect(rejected.body.errors.title).toBe('Please give your story a short title.');
    expect((await a.agent.get(`/api/stories/${storyId}`).expect(200)).body.title).toBe('Revised STAR story');
  });

  it('recalculates practice stats after session score edits, relinking, case conversion and deletion', async () => {
    await write(a, 'put', `/api/sessions/${linkedIds[0]}`,
      sessionBody({ story_id: storyId, overall_score: 1 })).expect(200);
    expect((await a.agent.get(`/api/stories/${storyId}`).expect(200)).body.average_score).toBe(3);
    await write(a, 'put', `/api/sessions/${linkedIds[0]}`,
      sessionBody({ story_id: otherStoryId, overall_score: 1 })).expect(200);
    expect((await a.agent.get(`/api/stories/${storyId}`).expect(200)).body.times_practiced).toBe(2);
    expect((await a.agent.get(`/api/stories/${otherStoryId}`).expect(200)).body.average_score).toBe(1);
    const caseSession = await write(a, 'put', `/api/sessions/${linkedIds[0]}`,
      sessionBody({ story_id: otherStoryId, question_type_id: caseType, overall_score: 1 })).expect(200);
    expect(caseSession.body.story_id).toBeNull();
    expect((await a.agent.get(`/api/stories/${otherStoryId}`).expect(200)).body.average_score).toBeNull();
    const temporary = (await write(a, 'post', '/api/sessions', sessionBody({ story_id: otherStoryId })).expect(201)).body;
    await write(a, 'delete', `/api/sessions/${temporary.id}`).expect(204);
    expect((await a.agent.get(`/api/stories/${otherStoryId}`).expect(200)).body.times_practiced).toBe(0);
  });

  it('deletes a linked story without deleting session scores or stars, and user deletion cascades owned stories', async () => {
    await write(a, 'post', `/api/sessions/${linkedIds[1]}/star`).expect(204);
    await write(a, 'delete', `/api/stories/${storyId}`).expect(204);
    await a.agent.get(`/api/stories/${storyId}`).expect(404);
    for (const id of linkedIds.slice(1)) {
      const session = (await a.agent.get(`/api/sessions/${id}`).expect(200)).body;
      expect(session.overall_score).toBe(4);
      expect(session.story_id).toBeNull();
      expect(session.story_title).toBeNull();
    }
    expect((await a.agent.get(`/api/sessions/${linkedIds[1]}`).expect(200)).body.starred).toBe(true);
    await pool.query('DELETE FROM users WHERE id=$1', [b.id]);
    expect((await pool.query('SELECT id FROM stories WHERE user_id=$1', [b.id])).rows).toEqual([]);
  });
});
