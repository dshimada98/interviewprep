import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { app, sessionStore } from '../artifacts/interviewprep/server/app.mjs';
import { pool } from '../artifacts/interviewprep/server/db.mjs';
import { seedQuestionTypes } from '../artifacts/interviewprep/server/question-types.mjs';
import { seedCaseSections } from '../artifacts/interviewprep/server/case-sections.mjs';
import { seedRubric } from '../artifacts/interviewprep/server/rubric.mjs';

const ids: number[] = [];
const tokens: string[] = [];
type Actor = { agent: ReturnType<typeof request.agent>; id: number; token: string };
type Entry = { score: number; level_name: string; description: string; edited: boolean };
type Scope = { scope: string; name: string; subtitle: string; entries: Entry[] };
const LEVELS = ['Needs rescue', 'Below bar', 'At bar', 'Strong', 'Offer-level'];

async function signup(): Promise<Actor> {
  const agent = request.agent(app);
  const status = await agent.get('/api/auth/status').expect(200);
  tokens.push(status.body.csrfToken);
  const password = 'rubric-test-only-password!';
  const result = await agent.post('/api/auth/signup').set('X-CSRF-Token', status.body.csrfToken)
    .send({ email: `rubric-${randomUUID()}@example.test`, password, confirmPassword: password }).expect(201);
  ids.push(result.body.user.id); tokens.push(result.body.csrfToken);
  return { agent, id: result.body.user.id, token: result.body.csrfToken };
}
const rubric = async (a: Actor): Promise<Scope[]> => (await a.agent.get('/api/rubric').expect(200)).body.scopes;
const edit = (a: Actor, scope: string, score: number, description: unknown) =>
  a.agent.put(`/api/rubric/${scope}/${score}`).set('X-CSRF-Token', a.token).send({ description });
const level = (scopes: Scope[], name: string, score: number) =>
  scopes.find(s => s.name === name)!.entries.find(e => e.score === score)!;

beforeAll(async () => {
  if (process.env.NODE_ENV === 'production') throw new Error('Development tests only.');
  await seedQuestionTypes(); await seedCaseSections(); await seedRubric();
});
afterAll(async () => {
  try {
    await pool.query(`DELETE FROM login_sessions WHERE sess->>'csrfToken'=ANY($1::text[])
      OR (sess->>'userId')::int=ANY($2::int[])`, [tokens, ids]);
    await pool.query('DELETE FROM users WHERE id=ANY($1::int[])', [ids]);
    expect((await pool.query('SELECT id FROM rubric_entries WHERE user_id=ANY($1::int[])', [ids])).rows).toEqual([]);
  } finally { sessionStore.close(); await pool.end(); }
});

describe('private scoring rubric and table-driven Delivery section', () => {
  it('returns every default and named level for a new user and seeds idempotently', async () => {
    await request(app).get('/api/rubric').expect(401);
    const a = await signup();
    const sections = (await a.agent.get('/api/case-sections').expect(200)).body;
    expect(sections.at(-1)).toMatchObject({ name: 'Delivery', display_order: 8,
      subtitle: 'Concise, confident, signposted communication' });
    const scopes = await rubric(a);
    expect(scopes.map(s => s.name)).toEqual([...sections.map((s: { name: string }) => s.name), 'Behavioral (overall)']);
    expect(scopes.at(-1)?.scope).toBe('behavioral_overall');
    for (const s of scopes) {
      expect(s.entries.map(e => e.score)).toEqual([1, 2, 3, 4, 5]);
      expect(s.entries.map(e => e.level_name)).toEqual(LEVELS);
      expect(s.entries.every(e => !e.edited && e.description.trim().length > 0 && e.description.length <= 200)).toBe(true);
    }
    expect(level(scopes, 'Framework', 3).description).toBe('MECE framework with some case-specific buckets.');
    expect(level(scopes, 'Behavioral (overall)', 5).description)
      .toBe('Compelling and concise; quantified impact, reflection on what I learned, tailored to the firm.');
    const before = (await pool.query('SELECT * FROM rubric_entries ORDER BY id')).rows;
    await Promise.all([seedRubric(), seedRubric(), seedRubric()]);
    expect((await pool.query('SELECT * FROM rubric_entries ORDER BY id')).rows).toEqual(before);
  });

  it('keeps private edits isolated and resets only the current user and selected scope', async () => {
    const a = await signup(), b = await signup();
    const scopes = await rubric(a), framework = scopes.find(s => s.name === 'Framework')!.scope;
    const math = scopes.find(s => s.name === 'Math')!.scope;
    await a.agent.put(`/api/rubric/${framework}/3`).set('X-CSRF-Token', a.token)
      .send({ description: 'My tailored at-bar framework.', user_id: b.id }).expect(200);
    expect(level(await rubric(a), 'Framework', 3)).toMatchObject({ description: 'My tailored at-bar framework.', edited: true });
    expect(level(await rubric(b), 'Framework', 3)).toMatchObject({
      description: 'MECE framework with some case-specific buckets.', edited: false });
    await edit(b, framework, 3, 'B keeps this private definition.').expect(200);
    await edit(a, framework, 2, 'A second framework edit.').expect(200);
    await edit(a, math, 4, 'A math edit survives Framework reset.').expect(200);
    await seedRubric();
    expect(level(await rubric(a), 'Framework', 3).edited).toBe(true);
    await a.agent.delete(`/api/rubric/${framework}`).set('X-CSRF-Token', a.token).expect(204);
    expect(level(await rubric(a), 'Framework', 3)).toMatchObject({ edited: false,
      description: 'MECE framework with some case-specific buckets.' });
    expect(level(await rubric(a), 'Framework', 2).edited).toBe(false);
    expect(level(await rubric(a), 'Math', 4).edited).toBe(true);
    expect(level(await rubric(b), 'Framework', 3)).toMatchObject({ edited: true, description: 'B keeps this private definition.' });
    await a.agent.delete(`/api/rubric/${framework}`).set('X-CSRF-Token', a.token).expect(204);
  });

  it('enforces exact field errors, CSRF, valid scopes and scores, and atomic private uniqueness', async () => {
    const a = await signup(), scope = (await rubric(a))[0].scope;
    await a.agent.put(`/api/rubric/${scope}/3`).send({ description: 'No CSRF' }).expect(403);
    await a.agent.delete(`/api/rubric/${scope}`).expect(403);
    for (const description of ['', ' \n ', null, 1, {}]) {
      const result = await edit(a, scope, 3, description).expect(400);
      expect(result.body.errors.description).toBe('Please describe what this score means.');
    }
    expect((await edit(a, scope, 3, 'x'.repeat(201)).expect(400)).body.errors.description)
      .toBe('Please keep it under 200 characters.');
    await edit(a, scope, 3, 'x'.repeat(200)).expect(200);
    const results = await Promise.all([edit(a, scope, 3, 'Concurrent first.'), edit(a, scope, 3, 'Concurrent second.')]);
    expect(results.map(r => r.status)).toEqual([200, 200]);
    expect((await pool.query('SELECT id FROM rubric_entries WHERE scope=$1 AND score=3 AND user_id=$2', [scope, a.id])).rowCount).toBe(1);
    for (const invalid of ['0', '2147483647', '99999999999', 'Framework']) {
      await edit(a, invalid, 3, 'Not a valid scope').expect(404);
      await a.agent.delete(`/api/rubric/${invalid}`).set('X-CSRF-Token', a.token).expect(404);
    }
    for (const score of [0, 6, 2.5]) await edit(a, scope, score, 'Invalid score').expect(404);
    await expect(pool.query(`INSERT INTO rubric_entries(scope,score,description,user_id)
      VALUES ($1,6,'Bad score',$2)`, [scope, a.id])).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query(`INSERT INTO rubric_entries(scope,score,description,user_id)
      VALUES ('invalid_scope',3,'Bad scope',$1)`, [a.id])).rejects.toMatchObject({ code: '23503' });
  });

  it('saves Delivery, treats legacy scores as N/A, and exposes it in every dashboard section view', async () => {
    const a = await signup();
    const sections = (await a.agent.get('/api/case-sections').expect(200)).body;
    const delivery = sections.find((s: { name: string }) => s.name === 'Delivery');
    const types = (await a.agent.get('/api/question-types').expect(200)).body;
    const body = { question_type_id: types.case[0].id, session_date: '2026-01-05',
      prompt: 'Before Delivery was scored', format: 'solo', overall_score: 3,
      section_scores: sections.filter((s: { id: number }) => s.id !== delivery.id)
        .map((s: { id: number }) => ({ section_id: s.id, score: 3 })) };
    const old = (await a.agent.post('/api/sessions').set('X-CSRF-Token', a.token).send(body).expect(201)).body;
    expect(old.section_scores.some((s: { section_id: number }) => s.section_id === delivery.id)).toBe(false);
    const newer = (await a.agent.post('/api/sessions').set('X-CSRF-Token', a.token).send({
      ...body, prompt: 'Scored Delivery', session_date: '2026-01-06',
      section_scores: [{ section_id: delivery.id, score: 2 }],
    }).expect(201)).body;
    expect(newer.section_scores[0]).toMatchObject({ section_name: 'Delivery', score: 2 });
    const d = (await a.agent.get('/api/dashboard').expect(200)).body;
    expect(d.section_averages.find((s: { id: number }) => s.id === delivery.id))
      .toMatchObject({ name: 'Delivery', average_score: 2, scored_count: 1 });
    expect(d.heatmap.find((s: { id: number }) => s.id === old.id).sections
      .find((s: { section_id: number }) => s.section_id === delivery.id).score).toBeNull();
    expect(d.section_progress.cases.find((s: { id: number }) => s.id === old.id).sections
      .find((s: { section_id: number }) => s.section_id === delivery.id).score).toBeNull();
    expect(d.section_progress.sections.find((s: { id: number }) => s.id === delivery.id))
      .toMatchObject({ all_time_avg: 2, times_scored: 1 });
    expect(d.next_case_focus.some((s: { section_id: number }) => s.section_id === delivery.id)).toBe(true);
    expect((await a.agent.get(`/api/sessions/${old.id}`).expect(200)).body.section_scores).toEqual(old.section_scores);
  });

  it('exports table-ordered Delivery and the signed-in user rubric including private edits', async () => {
    const a = await signup(), b = await signup();
    const scopes = await rubric(a), framework = scopes.find(s => s.name === 'Framework')!.scope;
    await edit(a, framework, 3, '=Private edited description, stored as text.').expect(200);
    const sections = (await a.agent.get('/api/case-sections').expect(200)).body;
    const delivery = sections.find((s: { name: string }) => s.name === 'Delivery');
    const types = (await a.agent.get('/api/question-types').expect(200)).body;
    const input = { question_type_id: types.case[0].id, session_date: '2026-01-05', prompt: 'Unscored Delivery',
      format: 'solo', overall_score: 3 };
    await a.agent.post('/api/sessions').set('X-CSRF-Token', a.token).send(input).expect(201);
    await a.agent.post('/api/sessions').set('X-CSRF-Token', a.token).send({
      ...input, session_date: '2026-01-06', prompt: 'Scored Delivery', section_scores: [{ section_id: delivery.id, score: 4 }],
    }).expect(201);
    async function workbook(actor: Actor) {
      const result = await actor.agent.get('/api/export.xlsx').buffer(true).parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      }).expect(200);
      const book = new ExcelJS.Workbook(); await book.xlsx.load(result.body); return book;
    }
    const book = await workbook(a), cases = book.getWorksheet('Cases')!, sheet = book.getWorksheet('Rubric')!;
    const headers = cases.getRow(1).values as ExcelJS.CellValue[];
    const column = headers.indexOf('Delivery');
    expect(column).toBe(headers.indexOf('Driving the case forward') + 1);
    expect(cases.getRow(2).getCell(column).value).toBe(4);
    expect(cases.getRow(3).getCell(column).value).toBeNull();
    expect(sheet.rowCount).toBe(scopes.length * 5 + 1);
    const descriptions: ExcelJS.CellValue[] = [];
    sheet.eachRow(row => {
      expect(row.getCell(4).formula).toBeUndefined();
      descriptions.push(row.getCell(4).value);
    });
    expect(descriptions).toContain('=Private edited description, stored as text.');
    const other = (await workbook(b)).getWorksheet('Rubric')!;
    const otherDescriptions: ExcelJS.CellValue[] = [];
    other.eachRow(row => otherDescriptions.push(row.getCell(4).value));
    expect(otherDescriptions).not.toContain('=Private edited description, stored as text.');
    expect(otherDescriptions).toContain('MECE framework with some case-specific buckets.');
  });
});
