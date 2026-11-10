import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { app, sessionStore } from '../artifacts/interviewprep/server/app.mjs';
import { pool } from '../artifacts/interviewprep/server/db.mjs';
import { seedQuestionTypes } from '../artifacts/interviewprep/server/question-types.mjs';
import { seedCaseSections } from '../artifacts/interviewprep/server/case-sections.mjs';
import { calDate, parseSP, scoreColors, sortByChange, subtitle, trailing3 } from '../artifacts/interviewprep/src/components/section-progress-utils';

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
  it('compares recent five and earlier five section scores with decimal changes and ignores N/A', async () => {
    const actor = await signUp();
    const framework = sections.find(s => s.name === 'Framework')!.id;
    const scores = [1, 2, 2, 2, 2, 2, 2, 2, 3, 2];
    const ids = [];
    for (const [index, score] of scores.entries()) {
      ids.push(await create(actor, 3, `2026-10-${String(index + 1).padStart(2, '0')}`, profit, [
        { section_id: framework, score },
        ...(index === 0 ? [{ section_id: math, score: 5 }] : index === 5 ? [{ section_id: math, score: 1 }] : []),
      ]));
    }
    const data = (await actor.agent.get('/api/dashboard').expect(200)).body;
    const progress = data.section_progress;
    expect(progress.cases.map((c: { id: number }) => c.id)).toEqual(ids);
    expect(progress.cases.map((c: { is_recent: boolean }) => c.is_recent))
      .toEqual([false, false, false, false, false, true, true, true, true, true]);
    expect(progress.sections.map((s: { id: number }) => s.id)).toEqual(sections.map(s => s.id));
    expect(progress.sections.find((s: { id: number }) => s.id === framework)).toMatchObject({
      earlier_avg: 1.8, recent_avg: 2.2, change: 0.4, earlier_count: 5, recent_count: 5,
      all_time_avg: 2, times_scored: 10,
    });
    expect(progress.sections.find((s: { id: number }) => s.id === math)).toMatchObject({
      earlier_avg: 5, recent_avg: 1, change: -4, earlier_count: 1, recent_count: 1,
      all_time_avg: 3, times_scored: 2,
    });
    expect(progress.cases[1].sections.find((s: { section_id: number }) => s.section_id === math).score).toBeNull();
    expect(sortByChange(progress.sections).slice(0, 2).map(s => s.id)).toEqual([framework, math]);
    const all = (await actor.agent.get('/api/dashboard').query({ range: 'all' }).expect(200)).body;
    expect(all.section_progress.sections).toEqual(progress.sections);
  });

  it('groups plain calendar dates into Monday weeks, preserving Sunday and empty week gaps', async () => {
    const actor = await signUp();
    const framework = sections.find(s => s.name === 'Framework')!.id;
    for (const [date, score] of [['2026-10-12', 2], ['2026-10-18', 4], ['2026-10-19', 5], ['2026-11-02', 1]] as const) {
      await create(actor, 3, date, profit, [
        { section_id: framework, score },
        ...(date === '2026-10-12' ? [{ section_id: math, score: 4 }] : []),
      ]);
    }
    const { section_progress: progress } = (await actor.agent.get('/api/dashboard').expect(200)).body;
    expect(progress.weeks.map((w: { week_start: string; case_count: number }) => [w.week_start, w.case_count]))
      .toEqual([['2026-10-12', 2], ['2026-10-19', 1], ['2026-10-26', 0], ['2026-11-02', 1]]);
    expect(progress.weeks[0].sections.find((s: { section_id: number }) => s.section_id === framework).score).toBe(3);
    expect(progress.weeks[0].sections.find((s: { section_id: number }) => s.section_id === math).score).toBe(4);
    expect(progress.weeks[1].sections.find((s: { section_id: number }) => s.section_id === framework).score).toBe(5);
    expect(progress.weeks[2].sections.every((s: { score: number | null }) => s.score === null)).toBe(true);
    expect(progress.sections.every((s: { change: number | null }) => s.change === null)).toBe(true);
  });

  it('limits only the chart range and uses the same case windows as Next-case focus, including unscored cases', async () => {
    const actor = await signUp();
    const framework = sections.find(s => s.name === 'Framework')!.id;
    const ids = [];
    for (let index = 1; index <= 12; index++) {
      ids.push(await create(actor, 3, `2026-10-${String(index).padStart(2, '0')}`, profit, [
        { section_id: framework, score: index <= 7 ? 2 : 4 },
      ]));
    }
    // Unscored cases affect the five-CASE comparison, but not chart points.
    await create(actor, 5, '2026-10-13');
    await create(actor, 1, '2026-10-14', behavioral);
    const data = (await actor.agent.get('/api/dashboard').expect(200)).body;
    const all = (await actor.agent.get('/api/dashboard').query({ range: 'all' }).expect(200)).body;
    expect(data.section_progress.cases.map((c: { id: number }) => c.id)).toEqual(ids.slice(-10));
    expect(all.section_progress.cases.map((c: { id: number }) => c.id)).toEqual(ids);
    expect(data.section_progress.sections).toEqual(all.section_progress.sections);
    const row = data.section_progress.sections.find((s: { id: number }) => s.id === framework);
    const focus = data.next_case_focus.find((s: { section_id: number }) => s.section_id === framework);
    expect(row.recent_avg).toBe(focus.average_score);
    expect(row.recent_count).toBe(focus.scored_count);
    expect(row).toMatchObject({ recent_count: 4, recent_avg: 4, earlier_count: 5, earlier_avg: 2.4, change: 1.6, times_scored: 12 });
    expect(data.section_progress.cases.filter((c: { is_recent: boolean }) => c.is_recent)).toHaveLength(4);
    expect((await actor.agent.get('/api/dashboard').query({ range: 'invalid' }).expect(200)).body.section_progress)
      .toEqual(data.section_progress);
  });

  it('requires login', async () => {
    await request(app).get('/api/dashboard').expect(401);
  });

  it('keeps progress chart transforms, calendar labels, URL defaults and colors deterministic', () => {
    expect(trailing3([1, null, 5, null, null, null, 2])).toEqual([1, 1, 3, 5, 5, null, 2]);
    expect(calDate('2026-10-18')).toEqual({ short: 'Oct 18', long: 'Oct 18, 2026' });
    expect(parseSP('?view=heatmap&group=week&range=all')).toEqual({ view: 'heatmap', group: 'week', range: 'all' });
    expect(parseSP('?view=invalid&group=invalid&range=invalid')).toEqual({ view: 'trends', group: 'case', range: 'last10' });
    expect(subtitle({ view: 'trends', group: 'case', range: 'last10' }))
      .toBe('Last 10 cases · shaded = recent 5 · line = 3-case rolling average');
    expect(subtitle({ view: 'heatmap', group: 'week', range: 'all' }))
      .toBe('Weekly averages · cases per week under each date');
    expect(subtitle({ view: 'averages', group: 'week', range: 'last10' }))
      .toBe('All cases · marker = recent 5 average');
    expect(scoreColors(2.5)).toEqual(['#FAC775', '#633806']);
    expect(scoreColors(null)).toEqual(['#E8EAEE', '#5B6577']);
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
    expect(data.section_progress.cases).toEqual([]);
    expect(data.section_progress.weeks).toEqual([]);
    expect(data.section_progress.sections).toHaveLength(7);
    expect(data.section_progress.sections.every((s: { recent_avg: number | null; change: number | null; times_scored: number }) =>
      s.recent_avg === null && s.change === null && s.times_scored === 0)).toBe(true);
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
