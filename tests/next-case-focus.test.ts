import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { app, sessionStore } from '../artifacts/interviewprep/server/app.mjs';
import { pool } from '../artifacts/interviewprep/server/db.mjs';
import { seedQuestionTypes } from '../artifacts/interviewprep/server/question-types.mjs';
import { seedCaseSections } from '../artifacts/interviewprep/server/case-sections.mjs';

type Actor = { agent: ReturnType<typeof request.agent>; token: string; id: number };
type Score = { section_id: number; score: number; to_improve?: string };
type Focus = {
  section_id: number; section_name: string; average_score: number;
  scored_count: number; case_count: number;
  note: { text: string; session_id: number; session_date: string; prompt: string } | null;
};
const ids: number[] = [], tokens: string[] = [];
let caseType: number, behaviorType: number;
let intro: number, framework: number, exhibits: number, math: number, recommendation: number;

async function account(): Promise<Actor> {
  const agent = request.agent(app);
  const status = await agent.get('/api/auth/status').expect(200);
  tokens.push(status.body.csrfToken);
  const password = 'focus-test-only-password!';
  const result = await agent.post('/api/auth/signup').set('X-CSRF-Token', status.body.csrfToken)
    .send({ email: `focus-${randomUUID()}@example.test`, password, confirmPassword: password })
    .expect(201);
  ids.push(result.body.user.id);
  tokens.push(result.body.csrfToken);
  return { agent, token: result.body.csrfToken, id: result.body.user.id };
}
async function create(a: Actor, day: number, scores: Score[] = [], type = caseType) {
  const result = await a.agent.post('/api/sessions').set('X-CSRF-Token', a.token).send({
    question_type_id: type, session_date: `2025-10-${String(day).padStart(2, '0')}`,
    prompt: `Focus case ${day}`, format: 'solo', overall_score: 4, section_scores: scores,
  }).expect(201);
  return result.body.id as number;
}
async function focus(a: Actor): Promise<Focus[]> {
  return (await a.agent.get('/api/dashboard').expect(200)).body.next_case_focus;
}
beforeAll(async () => {
  if (process.env.NODE_ENV === 'production') throw new Error('Development tests only.');
  await seedQuestionTypes();
  await seedCaseSections();
  const types = await pool.query('SELECT id, kind FROM question_types ORDER BY id');
  caseType = types.rows.find(t => t.kind === 'case').id;
  behaviorType = types.rows.find(t => t.kind === 'behavioral').id;
  const sections = (await pool.query('SELECT id, name FROM case_sections ORDER BY display_order, id')).rows;
  [intro, framework, exhibits] = sections.slice(0, 3).map(s => s.id);
  math = sections.find(s => s.name === 'Math').id;
  recommendation = sections.find(s => s.name === 'Recommendation').id;
});
afterAll(async () => {
  try {
    if (process.env.NODE_ENV !== 'production') {
      await pool.query(
        "DELETE FROM login_sessions WHERE sess->>'csrfToken'=ANY($1::text[]) OR (sess->>'userId')::int=ANY($2::int[])",
        [tokens, ids],
      );
      await pool.query('DELETE FROM users WHERE id=ANY($1::int[])', [ids]);
      expect((await pool.query('SELECT id FROM practice_sessions WHERE user_id=ANY($1::int[])', [ids])).rows)
        .toEqual([]);
    }
  } finally {
    sessionStore.close();
    await pool.end();
  }
});

describe('next-case focus from private recent case scores', () => {
  it('returns an empty list for a new account and never falls back to older scores outside the five cases', async () => {
    const a = await account();
    expect(await focus(a)).toEqual([]);
    await create(a, 1, [{ section_id: intro, score: 1 }]);
    for (let day = 2; day <= 6; day++) await create(a, day);
    await create(a, 7, [], behaviorType);
    expect(await focus(a)).toEqual([]);
  });

  it('returns one scored section, excludes N/A and behavioral sessions, and reports window and sample counts separately', async () => {
    const a = await account();
    await create(a, 1, [{ section_id: math, score: 3 }]);
    await create(a, 2);
    await create(a, 3);
    await create(a, 4, [], behaviorType);
    expect(await focus(a)).toEqual([{
      section_id: math, section_name: 'Math', average_score: 3,
      scored_count: 1, case_count: 3, note: null,
    }]);
  });

  it('chooses two lowest recent averages, prefers more scored cases on a tie, and can retrieve a note outside the window', async () => {
    const a = await account();
    const older = await create(a, 1, [
      { section_id: framework, score: 5, to_improve: 'Older framework improvement' },
      { section_id: recommendation, score: 1 },
    ]);
    let mathNoteSession = 0;
    for (let day = 2; day <= 6; day++) {
      const id = await create(a, day, [
        { section_id: math, score: 2, ...(day === 4 ? { to_improve: 'Check units before calculating.' } : {}) },
        ...(day < 6 ? [{ section_id: framework, score: 2 }] : []),
        { section_id: intro, score: 3 },
      ]);
      if (day === 4) mathNoteSession = id;
    }
    await create(a, 10, [], behaviorType);
    const result = await focus(a);
    expect(result.map(s => s.section_id)).toEqual([math, framework]);
    expect(result.map(s => [s.average_score, s.scored_count, s.case_count])).toEqual([[2, 5, 5], [2, 4, 5]]);
    expect(result[0].note).toEqual({
      text: 'Check units before calculating.', session_id: mathNoteSession,
      session_date: '2025-10-04', prompt: 'Focus case 4',
    });
    expect(result[1].note).toEqual({
      text: 'Older framework improvement', session_id: older,
      session_date: '2025-10-01', prompt: 'Focus case 1',
    });
  });

  it('breaks equal average and sample-count ties using section display order', async () => {
    const a = await account();
    await create(a, 1, [
      { section_id: exhibits, score: 2 }, { section_id: framework, score: 2 }, { section_id: intro, score: 2 },
    ]);
    expect((await focus(a)).map(s => s.section_id)).toEqual([intro, framework]);
  });

  it('rounds to one decimal before applying average ties and sample-count precedence', async () => {
    const a = await account();
    for (let day = 1; day <= 5; day++) {
      await create(a, day, [
        { section_id: framework, score: day === 1 ? 1 : 2 },
        ...(day < 5 ? [{ section_id: math, score: day === 1 ? 1 : 2 }] : []),
      ]);
    }
    const result = await focus(a);
    expect(result.map(s => [s.section_id, s.average_score, s.scored_count]))
      .toEqual([[framework, 1.8, 5], [math, 1.8, 4]]);
  });

  it('orders both the five-case window and note lookup by session date then creation time, skipping whitespace-only notes', async () => {
    const a = await account();
    const sameDay: number[] = [];
    for (const text of ['Earlier creation', 'Later creation']) {
      sameDay.push(await create(a, 2, [{ section_id: math, score: 2, to_improve: text }]));
    }
    for (let i = 0; i < sameDay.length; i++) {
      await pool.query('UPDATE practice_sessions SET created_at=$1 WHERE id=$2 AND user_id=$3',
        [`2025-10-02T1${i}:00:00Z`, sameDay[i], a.id]);
    }
    const oldDate = await create(a, 1, [{ section_id: math, score: 1, to_improve: 'Old session with late creation' }]);
    await pool.query('UPDATE practice_sessions SET created_at=$1 WHERE id=$2 AND user_id=$3',
      ['2026-01-01T00:00:00Z', oldDate, a.id]);
    const blank = await create(a, 3, [{ section_id: math, score: 2 }]);
    await pool.query('UPDATE section_scores SET to_improve=$1 WHERE session_id=$2', [' \t\n ', blank]);
    expect((await focus(a))[0].note?.session_id).toBe(sameDay[1]);
    // Four later cases leave only the later-created Oct 2 case in the five-case window.
    for (let day = 4; day <= 6; day++) await create(a, day);
    const result = await focus(a);
    expect(result[0]).toMatchObject({ average_score: 2, scored_count: 2, case_count: 5 });
    expect(result[0].note?.text).toBe('Later creation');
  });

  it('never leaks another user’s averages, notes or source-session links', async () => {
    const a = await account(), b = await account();
    await create(a, 1, [{ section_id: math, score: 3 }]);
    const privateId = await create(b, 9, [
      { section_id: math, score: 1, to_improve: 'PRIVATE improvement note for B only' },
    ]);
    const owned = await focus(a);
    expect(owned).toEqual([{
      section_id: math, section_name: 'Math', average_score: 3, scored_count: 1, case_count: 1, note: null,
    }]);
    expect((await focus(b))[0].note?.session_id).toBe(privateId);
    expect(JSON.stringify(owned)).not.toContain('PRIVATE');
    await a.agent.get(`/api/sessions/${privateId}`).expect(404);
  });
});
