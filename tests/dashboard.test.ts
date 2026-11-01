import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { app, sessionStore } from '../artifacts/interviewprep/server/app.mjs';
import { pool } from '../artifacts/interviewprep/server/db.mjs';
import { seedQuestionTypes } from '../artifacts/interviewprep/server/question-types.mjs';
import { seedCaseSections } from '../artifacts/interviewprep/server/case-sections.mjs';

const userIds: number[] = [];
const tokens: string[] = [];
type Actor = { agent: ReturnType<typeof request.agent>; token: string; id: number };
let a: Actor, b: Actor;
let profit: number, entry: number, behavioral: number, introduction: number, math: number;
let caseTypes: { id: number; name: string }[];
let sections: { id: number; name: string; display_order: number }[];
const initialIds: number[] = [];

async function signUp(): Promise<Actor> {
  const agent = request.agent(app);
  const status = await agent.get('/api/auth/status').expect(200);
  tokens.push(status.body.csrfToken);
  const password = 'dashboard-test-only-password!';
  const result = await agent.post('/api/auth/signup')
    .set('X-CSRF-Token', status.body.csrfToken)
    .send({ email: `dashboard-${randomUUID()}@example.test`, password, confirmPassword: password })
    .expect(201);
  userIds.push(result.body.user.id);
  tokens.push(result.body.csrfToken);
  return { agent, token: result.body.csrfToken, id: result.body.user.id };
}

async function create(actor: Actor, score: number, date: string, type = profit,
  scores: { section_id: number; score: number }[] = []) {
  const result = await actor.agent.post('/api/sessions').set('X-CSRF-Token', actor.token)
    .send({
      question_type_id: type, session_date: date, prompt: 'Dashboard test case',
      format: 'solo', overall_score: score, section_scores: scores,
    }).expect(201);
  return result.body.id as number;
}
async function dashboard(actor = a) {
  return (await actor.agent.get('/api/dashboard').expect(200)).body;
}

beforeAll(async () => {
  if (process.env.NODE_ENV === 'production') throw new Error('Development tests only.');
  await seedQuestionTypes();
  await seedCaseSections();
  a = await signUp();
  b = await signUp();
  const types = (await a.agent.get('/api/question-types').expect(200)).body;
  caseTypes = types.case;
  profit = types.case.find((t: { name: string }) => t.name === 'Profitability').id;
  entry = types.case.find((t: { name: string }) => t.name === 'Market Entry').id;
  behavioral = types.behavioral[0].id;
  sections = (await a.agent.get('/api/case-sections').expect(200)).body;
  introduction = sections.find(s => s.name === 'Introduction')!.id;
  math = sections.find(s => s.name === 'Math')!.id;
});

afterAll(async () => {
  try {
    if (process.env.NODE_ENV !== 'production') {
      await pool.query(
        "DELETE FROM login_sessions WHERE sess->>'csrfToken'=ANY($1::text[]) OR (sess->>'userId')::int=ANY($2::int[])",
        [tokens, userIds],
      );
      // Cascades remove only this test's practice sessions, scores and stars.
      await pool.query('DELETE FROM users WHERE id=ANY($1::int[])', [userIds]);
      const remaining = await pool.query(
        'SELECT id FROM practice_sessions WHERE user_id=ANY($1::int[])', [userIds],
      );
      expect(remaining.rows).toEqual([]);
    }
  } finally {
    sessionStore.close();
    await pool.end();
  }
});

describe('private dashboard', () => {
  it('requires login', async () => {
    await request(app).get('/api/dashboard').expect(401);
  });

  it('returns safe null averages and all zero-count references for a brand-new account', async () => {
    const data = await dashboard();
    expect(data.total_cases).toBe(0);
    expect(data.average_case_score).toBeNull();
    expect(data.weakest_case_type).toBeNull();
    expect(data.behavioral_sessions).toBe(0);
    expect(data.cases_by_type).toHaveLength(caseTypes.length);
    expect(data.cases_by_type.every((t: { count: number }) => t.count === 0)).toBe(true);
    expect(data.section_averages).toEqual(sections.map(s => ({
      ...s, average_score: null, scored_count: 0,
    })));
    expect(data.heatmap).toEqual([]);
  });

  it('shows an average case score of 4.0 for three Profitability cases scored 3, 4 and 5', async () => {
    for (const score of [3, 4, 5]) {
      initialIds.push(await create(a, score, `2025-01-0${score - 2}`, profit, [
        { section_id: introduction, score },
        ...(score === 4 ? [] : [{ section_id: math, score: score === 3 ? 5 : 1 }]),
      ]));
    }
    const data = await dashboard();
    // JSON numbers have no trailing-zero representation; UI formats this as 4.0.
    expect(data.average_case_score).toBe(4.0);
    expect(data.average_case_score.toFixed(1)).toBe('4.0');
    expect(data.total_cases).toBe(3);
    expect(data.weakest_case_type).toEqual({ name: 'Profitability', average_score: 4 });
    expect(data.cases_by_type.find((t: { id: number }) => t.id === profit).count).toBe(3);
    expect(data.cases_by_type.filter((t: { id: number }) => t.id !== profit)
      .every((t: { count: number }) => t.count === 0)).toBe(true);
  });

  it('averages only scored case sections, keeps display order, and uses null for N/A', async () => {
    const data = await dashboard();
    expect(data.section_averages.map((s: { id: number }) => s.id)).toEqual(sections.map(s => s.id));
    expect(data.section_averages.find((s: { id: number }) => s.id === introduction))
      .toMatchObject({ average_score: 4, scored_count: 3 });
    expect(data.section_averages.find((s: { id: number }) => s.id === math))
      .toMatchObject({ average_score: 3, scored_count: 2 });
    expect(data.section_averages.filter((s: { id: number }) => ![math, introduction].includes(s.id))
      .every((s: { average_score: number | null; scored_count: number }) =>
        s.average_score === null && s.scored_count === 0)).toBe(true);
    expect(data.heatmap.map((s: { id: number }) => s.id)).toEqual(initialIds);
    expect(data.heatmap[1].sections).toEqual(sections.map(s => ({
      section_id: s.id, score: s.id === introduction ? 4 : null,
    })));
  });

  it('never includes another user in counts, averages, types, section scores or heatmap', async () => {
    await create(b, 5, '2025-02-03', behavioral);
    const behavioralOnly = await dashboard(b);
    expect(behavioralOnly.total_cases).toBe(0);
    expect(behavioralOnly.average_case_score).toBeNull();
    expect(behavioralOnly.weakest_case_type).toBeNull();
    expect(behavioralOnly.behavioral_sessions).toBe(1);
    expect(behavioralOnly.heatmap).toEqual([]);
    await create(b, 1, '2025-02-01', entry, [{ section_id: introduction, score: 1 }]);
    expect((await dashboard(b)).weakest_case_type).toBeNull();
    await create(b, 1, '2025-02-02', entry, [{ section_id: introduction, score: 1 }]);
    const data = await dashboard();
    expect(data.total_cases).toBe(3);
    expect(data.average_case_score).toBe(4);
    expect(data.behavioral_sessions).toBe(0);
    expect(data.weakest_case_type?.name).toBe('Profitability');
    expect(data.cases_by_type.find((t: { id: number }) => t.id === entry).count).toBe(0);
    expect(data.section_averages.find((s: { id: number }) => s.id === introduction).average_score).toBe(4);
    expect(data.heatmap.map((s: { id: number }) => s.id)).toEqual(initialIds);
    const other = await dashboard(b);
    expect(other.total_cases).toBe(2);
    expect(other.average_case_score).toBe(1);
    expect(other.behavioral_sessions).toBe(1);
    expect(other.weakest_case_type.name).toBe('Market Entry');
  });

  it('requires two cases per weakest-type candidate and excludes behavioral scores from case averages', async () => {
    await create(a, 1, '2025-01-04', entry);
    await create(a, 5, '2025-01-05', behavioral);
    let data = await dashboard();
    expect(data.weakest_case_type).toEqual({ name: 'Profitability', average_score: 4 });
    expect(data.average_case_score).toBe(3.3); // (3+4+5+1)/4, rounded in PostgreSQL.
    expect(data.behavioral_sessions).toBe(1);
    await create(a, 5, '2025-01-05', entry);
    data = await dashboard();
    expect(data.weakest_case_type).toEqual({ name: 'Market Entry', average_score: 3 });
    expect(data.average_case_score).toBe(3.6);
    expect(data.total_cases).toBe(5);
    expect(data.heatmap).toHaveLength(5); // Behavioral session is not a heatmap column.
  });

  it('returns only the ten latest cases, oldest to newest, breaking date ties by creation time', async () => {
    const added: number[] = [];
    for (let day = 6; day <= 14; day++) {
      added.push(await create(a, 3, `2025-01-${String(day).padStart(2, '0')}`));
    }
    for (let i = 6; i < 9; i++) {
      await pool.query(
        'UPDATE practice_sessions SET session_date=$1, created_at=$2 WHERE id=$3 AND user_id=$4',
        ['2025-01-14', `2025-01-14T10:00:0${i - 6}Z`, added[i], a.id],
      );
    }
    const data = await dashboard();
    expect(data.total_cases).toBe(14);
    expect(data.heatmap).toHaveLength(10);
    expect(data.heatmap.slice(1).map((s: { id: number }) => s.id)).toEqual(added);
    expect(data.heatmap.some((s: { id: number }) => initialIds.includes(s.id))).toBe(false);
    expect(data.heatmap.every((s: { sections: unknown[] }) => s.sections.length === 7)).toBe(true);
    expect(data.heatmap.every((s: { prompt: string }) => s.prompt === 'Dashboard test case')).toBe(true);
  });
});
