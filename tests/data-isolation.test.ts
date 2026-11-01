import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { app, sessionStore } from '../artifacts/interviewprep/server/app.mjs';
import { pool } from '../artifacts/interviewprep/server/db.mjs';
import { seedQuestionTypes } from '../artifacts/interviewprep/server/question-types.mjs';
import { seedCaseBooks, caseBookSeeds } from '../artifacts/interviewprep/server/case-books.mjs';

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
  await seedCaseBooks();
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
  it('isolates checklist reads, writes, clears and note sources between users', async () => {
    const a = await signUp(), b = await signUp();
    const add = (u: typeof a, data: object) => u.agent.post('/api/checklist').set('X-CSRF-Token', u.csrfToken).send(data);
    const own = (await add(a, { text: 'Slow down and clarify', user_id: b.id }).expect(200)).body;
    expect(own.user_id).toBe(a.id);
    expect((await b.agent.get('/api/checklist').expect(200)).body)
      .toEqual({ open: [], completed: [], completed_count: 0, note_keys: [] });
    const types = (await a.agent.get('/api/question-types').expect(200)).body;
    const section = (await a.agent.get('/api/case-sections').expect(200)).body[0].id;
    const session = (await a.agent.post('/api/sessions').set('X-CSRF-Token', a.csrfToken).send({
      question_type_id: types.case[0].id, session_date: '2025-10-28', prompt: 'Coffee chain profitability',
      format: 'solo', overall_score: 3, to_improve: 'Summarize the recommendation',
      section_scores: [{ section_id: section, score: 2, to_improve: 'Clarify the objective first' }],
    }).expect(201)).body;
    for (const method of ['patch', 'delete'] as const) {
      const r = await b.agent[method](`/api/checklist/${own.id}`).set('X-CSRF-Token', b.csrfToken)
        .send(method === 'patch' ? { done: true } : {}).expect(404);
      expect(r.body.message).toBe('Item not found');
    }
    for (const section_id of [null, section]) {
      const r = await add(b, { source_session_id: session.id, section_id, text: 'forged note' }).expect(404);
      expect(r.body.message).toBe('Item not found');
    }
    await a.agent.patch(`/api/checklist/${own.id}`).set('X-CSRF-Token', a.csrfToken).send({ done: true }).expect(200);
    const theirs = (await add(b, { text: 'Other account item' }).expect(200)).body;
    await b.agent.patch(`/api/checklist/${theirs.id}`).set('X-CSRF-Token', b.csrfToken).send({ done: true }).expect(200);
    await b.agent.delete('/api/checklist/completed').set('X-CSRF-Token', b.csrfToken).expect(204);
    expect((await a.agent.get('/api/checklist').expect(200)).body.completed.map((i: { id: number }) => i.id)).toEqual([own.id]);
    expect((await b.agent.get('/api/checklist').expect(200)).body.completed_count).toBe(0);
    await request(app).get('/api/checklist').expect(401);
    await request(app).post('/api/checklist').send({ text: 'Anonymous' }).expect(401);
    await a.agent.post('/api/checklist').send({ text: 'No CSRF' }).expect(403);
    expect((await a.agent.get('/api/checklist').expect(200)).body.open).toEqual([]);
  });

  it('copies notes once per session and section, preserves edits/completion, and survives source deletion', async () => {
    const a = await signUp();
    const types = (await a.agent.get('/api/question-types').expect(200)).body;
    const sections = (await a.agent.get('/api/case-sections').expect(200)).body;
    const session = (await a.agent.post('/api/sessions').set('X-CSRF-Token', a.csrfToken).send({
      question_type_id: types.case[0].id, session_date: '2025-10-28', prompt: 'Coffee chain profitability',
      format: 'solo', overall_score: 3, to_improve: '  Summarize the recommendation  ',
      section_scores: sections.slice(0, 2).map((s: { id: number }, i: number) =>
        ({ section_id: s.id, score: 2, to_improve: i ? 'Check the units' : 'Clarify the objective' })),
    }).expect(201)).body;
    const note = (section_id: number | null) => a.agent.post('/api/checklist').set('X-CSRF-Token', a.csrfToken)
      .send({ source_session_id: session.id, section_id, text: 'Never trust supplied note text', from_note: false });
    const [one, two] = await Promise.all([note(null).expect(200), note(null).expect(200)]);
    expect(one.body.id).toBe(two.body.id);
    expect(one.body.text).toBe('Summarize the recommendation');
    expect(one.body.from_note).toBe(true);
    expect(one.body.source_session_date).toBe('2025-10-28');
    expect(one.body.source_session_prompt).toBe('Coffee chain profitability');
    const section = (await note(sections[0].id).expect(200)).body;
    expect(section.text).toBe('Clarify the objective');
    expect(section.section_name).toBe(sections[0].name);
    expect((await note(sections[1].id).expect(200)).body.id).not.toBe(section.id);
    const edited = (await a.agent.patch(`/api/checklist/${one.body.id}`).set('X-CSRF-Token', a.csrfToken)
      .send({ text: 'Edited action', done: true }).expect(200)).body;
    expect(edited.done_at).toBeTruthy();
    expect((await note(null).expect(200)).body).toEqual(edited);
    const reopened = (await a.agent.patch(`/api/checklist/${one.body.id}`).set('X-CSRF-Token', a.csrfToken)
      .send({ done: false }).expect(200)).body;
    expect(reopened.done_at).toBeNull();
    expect(reopened.text).toBe('Edited action');
    // The source note may disappear; adding again still returns the same item.
    await pool.query('UPDATE practice_sessions SET to_improve=NULL WHERE id=$1 AND user_id=$2', [session.id, a.id]);
    expect((await note(null).expect(200)).body.id).toBe(one.body.id);
    await expect(pool.query(`INSERT INTO checklist_items(user_id,text,source_session_id)
      VALUES ($1,'Duplicate overall',$2)`, [a.id, session.id])).rejects.toMatchObject({ code: '23505' });
    await expect(pool.query(`INSERT INTO checklist_items(user_id,text,source_session_id,section_id)
      VALUES ($1,'Duplicate section',$2,$3)`, [a.id, session.id, sections[0].id])).rejects.toMatchObject({ code: '23505' });
    const list = (await a.agent.get('/api/checklist').expect(200)).body;
    expect(list.note_keys).toHaveLength(3);
    await a.agent.delete(`/api/sessions/${session.id}`).set('X-CSRF-Token', a.csrfToken).expect(204);
    const kept = (await a.agent.get('/api/checklist').expect(200)).body;
    expect(kept.open).toHaveLength(3);
    expect(kept.note_keys).toEqual([]);
    expect(kept.open.every((i: { source_session_id: number | null; from_note: boolean; source_session_prompt: string | null }) =>
      i.source_session_id === null && i.from_note && i.source_session_prompt === null)).toBe(true);
  });

  it('validates checklist text and sections and limits completed results without limiting counts or membership', async () => {
    const a = await signUp();
    const add = (data: object) => a.agent.post('/api/checklist').set('X-CSRF-Token', a.csrfToken).send(data);
    for (const text of ['', ' \n\t ']) {
      expect((await add({ text }).expect(400)).body.errors.text).toBe('Please write what you want to work on.');
    }
    expect((await add({ text: 'x'.repeat(201) }).expect(400)).body.errors.text).toBe('Please keep it under 200 characters.');
    await add({ text: 'A valid item', section_id: 2147483647 }).expect(400);
    await add({ source_session_id: 2147483647 }).expect(404);
    const first = (await add({ text: 'x'.repeat(200), done: true }).expect(200)).body;
    expect(first.text).toHaveLength(200);
    expect(first.done).toBe(false);
    expect(first.done_at).toBeNull();
    await a.agent.patch(`/api/checklist/${first.id}`).set('X-CSRF-Token', a.csrfToken)
      .send({ text: 'x'.repeat(201) }).expect(400);
    await a.agent.patch(`/api/checklist/${first.id}`).set('X-CSRF-Token', a.csrfToken).send({ done: 'true' }).expect(400);
    const types = (await a.agent.get('/api/question-types').expect(200)).body;
    const sections = (await a.agent.get('/api/case-sections').expect(200)).body;
    const source = (await a.agent.post('/api/sessions').set('X-CSRF-Token', a.csrfToken).send({
      question_type_id: types.case[0].id, session_date: '2025-10-28', prompt: 'Checklist validation',
      format: 'solo', overall_score: 3, to_improve: 'A completed note',
    }).expect(201)).body;
    const oldNote = (await add({ source_session_id: source.id }).expect(200)).body;
    await a.agent.patch(`/api/checklist/${oldNote.id}`).set('X-CSRF-Token', a.csrfToken).send({ done: true }).expect(200);
    expect((await add({ source_session_id: source.id, section_id: sections[0].id }).expect(400)).body.errors.text)
      .toBe('Please write what you want to work on.');
    await pool.query('UPDATE practice_sessions SET to_improve=$1 WHERE id=$2 AND user_id=$3',
      ['x'.repeat(201), source.id, a.id]);
    // No truncation: a different, over-limit source note is rejected explicitly.
    await a.agent.delete(`/api/checklist/${oldNote.id}`).set('X-CSRF-Token', a.csrfToken).expect(204);
    expect((await add({ source_session_id: source.id }).expect(400)).body.errors.text)
      .toBe('Please keep it under 200 characters.');
    await pool.query('UPDATE practice_sessions SET to_improve=$1 WHERE id=$2 AND user_id=$3',
      ['A completed note', source.id, a.id]);
    const restoredNote = (await add({ source_session_id: source.id }).expect(200)).body;
    await a.agent.patch(`/api/checklist/${restoredNote.id}`).set('X-CSRF-Token', a.csrfToken).send({ done: true }).expect(200);
    for (let i = 0; i < 12; i++) {
      const created = (await add({ text: `Completed ${i}` }).expect(200)).body;
      await a.agent.patch(`/api/checklist/${created.id}`).set('X-CSRF-Token', a.csrfToken).send({ done: true }).expect(200);
    }
    const list = (await a.agent.get('/api/checklist').expect(200)).body;
    expect(list.completed_count).toBe(13);
    expect(list.completed).toHaveLength(10);
    expect(list.completed[0].text).toBe('Completed 11');
    expect(list.completed[9].text).toBe('Completed 2');
    expect(list.note_keys).toContainEqual({ source_session_id: source.id, section_id: null });
    expect(list.completed.some((i: { id: number }) => i.id === restoredNote.id)).toBe(false);
    expect(list.open.map((i: { id: number }) => i.id)).toEqual([first.id]);
    await a.agent.delete('/api/checklist/completed').set('X-CSRF-Token', a.csrfToken).expect(204);
    expect((await a.agent.get('/api/checklist').expect(200)).body.completed_count).toBe(0);
    await a.agent.delete(`/api/checklist/${first.id}`).set('X-CSRF-Token', a.csrfToken).expect(204);
    await a.agent.delete(`/api/checklist/${first.id}`).set('X-CSRF-Token', a.csrfToken).expect(404);
  });

  it('tracks publication-year editions separately without changing unyearred books or privacy', async () => {
    const a = await signUp(), b = await signUp();
    const before = (await a.agent.get('/api/case-books').expect(200)).body.books;
    const shared = before.find((book: { name: string }) => book.name === 'Haas Casebook');
    expect(shared.publication_year).toBeNull();
    const post = (year: number | null, name = 'Haas Casebook') => a.agent.post('/api/case-books')
      .set('X-CSRF-Token', a.csrfToken).send({ name, publication_year: year });
    const old = (await post(2024).expect(201)).body;
    const recent = (await post(2025).expect(201)).body;
    expect(old.id).not.toBe(recent.id);
    expect(old.publication_year).toBe(2024);
    const duplicate = await post(2024, '  HAAS   CASEBOOK  ').expect(400);
    expect(duplicate.body.errors.name).toBe('You already have a case book called HAAS CASEBOOK (2024).');
    await post(null).expect(400);
    const list = (await a.agent.get('/api/case-books').expect(200)).body.books;
    expect(list.find((book: { id: number }) => book.id === shared.id)).toEqual(shared);
    expect(list.filter((book: { user_id: number | null }) => book.user_id === a.id)
      .map((book: { publication_year: number }) => book.publication_year)).toEqual([2025, 2024]);
    expect((await b.agent.get('/api/case-books').expect(200)).body.books
      .some((book: { id: number }) => book.id === old.id || book.id === recent.id)).toBe(false);
    await b.agent.post('/api/case-books').set('X-CSRF-Token', b.csrfToken)
      .send({ name: 'Haas Casebook', publication_year: 2024 }).expect(201);
    const types = (await a.agent.get('/api/question-types').expect(200)).body;
    for (const [book, date] of [[old, '2025-01-01'], [recent, '2025-01-02']] as const) {
      const result = await a.agent.post('/api/sessions').set('X-CSRF-Token', a.csrfToken)
        .send({ question_type_id: types.case[0].id, case_book_id: book.id, session_date: date,
          prompt: 'Edition case', format: 'solo', overall_score: 4 }).expect(201);
      expect(result.body.case_book_publication_year).toBe(book.publication_year);
      expect((await a.agent.get(`/api/sessions/${result.body.id}`).expect(200)).body.case_book_publication_year)
        .toBe(book.publication_year);
      const filtered = (await a.agent.get('/api/sessions').query({ book: book.id }).expect(200)).body.sessions;
      expect(filtered).toHaveLength(1);
      expect(filtered[0].case_book_publication_year).toBe(book.publication_year);
    }
    expect((await a.agent.get('/api/case-books').expect(200)).body.most_recent_case_book_id).toBe(recent.id);
    const rows = (await a.agent.get('/api/dashboard').expect(200)).body.by_case_book;
    expect(rows).toHaveLength(2);
    expect(rows.map((row: { publication_year: number }) => row.publication_year).sort()).toEqual([2024, 2025]);
    expect(rows.every((row: { count: number }) => row.count === 1)).toBe(true);
    await seedCaseBooks();
    expect((await a.agent.get('/api/case-books').expect(200)).body.books.find((book: { id: number }) => book.id === shared.id))
      .toEqual(shared);
  });

  it('validates publication years and enforces edition-aware database uniqueness', async () => {
    const a = await signUp();
    for (const year of [999, 10000, 2024.5, '2024', 'bad', '']) {
      const r = await a.agent.post('/api/case-books').set('X-CSRF-Token', a.csrfToken)
        .send({ name: 'Year validation', publication_year: year }).expect(400);
      expect(r.body.errors.publication_year).toBe('Please enter a four-digit year, like 2025.');
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const name = `Shared edition ${randomUUID().slice(0, 8)}`;
      await client.query('INSERT INTO case_books(name,publication_year) VALUES ($1,2024)', [name]);
      await client.query('SAVEPOINT invalid');
      await expect(client.query('INSERT INTO case_books(name,publication_year,user_id) VALUES ($1,2024,$2)',
        [name.toUpperCase(), a.id])).rejects.toMatchObject({ code: '23505' });
      await client.query('ROLLBACK TO SAVEPOINT invalid');
      await client.query('INSERT INTO case_books(name,publication_year,user_id) VALUES ($1,2025,$2)', [name, a.id]);
      await client.query('SAVEPOINT invalid');
      await expect(client.query('INSERT INTO case_books(name,publication_year,user_id) VALUES ($1,2025,$2)',
        [` ${name.toUpperCase()} `, a.id])).rejects.toMatchObject({ code: '23505' });
      await client.query('ROLLBACK TO SAVEPOINT invalid');
      await expect(client.query('INSERT INTO case_books(name,publication_year,user_id) VALUES ($1,999,$2)',
        [name, a.id])).rejects.toMatchObject({ code: '23514' });
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('keeps private case books out of other users lists, session writes, and filters', async () => {
    const a = await signUp(), b = await signUp();
    const name = `Private book ${randomUUID().slice(0, 8)}`;
    const created = await a.agent.post('/api/case-books').set('X-CSRF-Token', a.csrfToken)
      .send({ name, user_id: b.id }).expect(201);
    expect(created.body.user_id).toBe(a.id);
    const id = created.body.id;
    const aList = (await a.agent.get('/api/case-books').expect(200)).body;
    const bList = (await b.agent.get('/api/case-books').expect(200)).body;
    expect(aList.books.some((book: { id: number }) => book.id === id)).toBe(true);
    expect(bList.books.some((book: { id: number }) => book.id === id)).toBe(false);
    expect(aList.most_recent_case_book_id).toBeNull();
    expect(bList.most_recent_case_book_id).toBeNull();
    const types = (await a.agent.get('/api/question-types').expect(200)).body;
    const input = { session_date: '2025-01-01', question_type_id: types.case[0].id,
      prompt: 'Book privacy', overall_score: 3, format: 'solo', case_book_id: id };
    const invalid = await b.agent.post('/api/sessions').set('X-CSRF-Token', b.csrfToken)
      .send(input).expect(400);
    expect(invalid.body.errors.case_book_id).toBe('Please choose a case book.');
    await b.agent.get('/api/sessions').query({ book: id }).expect(400);
    const bSession = await b.agent.post('/api/sessions').set('X-CSRF-Token', b.csrfToken)
      .send({ ...input, case_book_id: null }).expect(201);
    await b.agent.put(`/api/sessions/${bSession.body.id}`).set('X-CSRF-Token', b.csrfToken)
      .send(input).expect(400);
    const own = await a.agent.post('/api/sessions').set('X-CSRF-Token', a.csrfToken)
      .send(input).expect(201);
    expect(own.body).toMatchObject({ case_book_id: id, case_book_name: name });
    expect((await a.agent.get(`/api/sessions/${own.body.id}`).expect(200)).body.case_book_name).toBe(name);
    expect((await a.agent.get('/api/case-books').expect(200)).body.most_recent_case_book_id).toBe(id);
    expect((await b.agent.get('/api/dashboard').expect(200)).body.by_case_book)
      .toEqual([{ case_book_id: null, name: 'No book / live case', publication_year: null, count: 1, average_score: 3, last_practiced: '2025-01-01' }]);
    await b.agent.post('/api/case-books').set('X-CSRF-Token', b.csrfToken).send({ name }).expect(201);
  });

  it('validates and normalizes book names in the API and database, with idempotent shared seeding', async () => {
    const a = await signUp();
    const post = (name: string) => a.agent.post('/api/case-books')
      .set('X-CSRF-Token', a.csrfToken).send({ name });
    expect((await post(' \t ').expect(400)).body.errors.name).toBe('Please enter a case book name.');
    expect((await post('x'.repeat(61)).expect(400)).body.errors.name).toBe('Please keep it under 60 characters.');
    expect((await post('  CASE   in Point ').expect(400)).body.errors.name)
      .toBe('You already have a case book called CASE in Point.');
    const name = `Book ${randomUUID().slice(0, 8)}`;
    await post(name).expect(201);
    await post(name.toUpperCase().replace(' ', '   ')).expect(400);
    await a.agent.post('/api/case-books').send({ name }).expect(403);
    await request(app).get('/api/case-books').expect(401);
    await request(app).post('/api/case-books').send({ name }).expect(401);
    for (const duplicate of [name.toUpperCase(), '  CASE   IN POINT  ']) {
      await expect(pool.query('INSERT INTO case_books(name,user_id) VALUES ($1,$2)',
        [duplicate, a.id])).rejects.toMatchObject({ code: '23505' });
    }
    await expect(pool.query('INSERT INTO case_books(name,user_id) VALUES ($1,$2)',
      ['x'.repeat(61), a.id])).rejects.toMatchObject({ code: '23514' });
    const before = (await pool.query('SELECT id,name,user_id FROM case_books ORDER BY id')).rows;
    await Promise.all([seedCaseBooks(), seedCaseBooks(), seedCaseBooks()]);
    expect((await pool.query('SELECT id,name,user_id FROM case_books ORDER BY id')).rows).toEqual(before);
    const list = (await a.agent.get('/api/case-books').expect(200)).body.books;
    expect(list.filter((book: { user_id: number | null }) => book.user_id === null).map((book: { name: string }) => book.name).sort())
      .toEqual([...caseBookSeeds].sort());
    expect(list.at(-1).name).toBe(name);
    const raceName = `Race ${randomUUID().slice(0, 8)}`;
    expect((await Promise.all([post(raceName), post(raceName.toUpperCase())])).map(r => r.status).sort()).toEqual([201, 400]);
  });

  it('aggregates case books, combines filters, and uses the newest case even when its book is empty', async () => {
    const a = await signUp();
    expect((await a.agent.get('/api/dashboard').expect(200)).body.by_case_book).toEqual([]);
    const types = (await a.agent.get('/api/question-types').expect(200)).body;
    const books = (await a.agent.get('/api/case-books').expect(200)).body.books;
    const book = books[0].id, other = books[1].id;
    const input = { question_type_id: types.case[0].id, prompt: 'Book aggregation', format: 'solo' };
    const create = async (date: string, score: number, bookId: number | null, type = types.case[0].id) =>
      (await a.agent.post('/api/sessions').set('X-CSRF-Token', a.csrfToken)
        .send({ ...input, session_date: date, overall_score: score, case_book_id: bookId, question_type_id: type }).expect(201)).body;
    const first = await create('2025-01-01', 3, book);
    const second = await create('2025-01-02', 4, book);
    await create('2025-01-03', 5, other);
    expect((await a.agent.get('/api/case-books').expect(200)).body.most_recent_case_book_id).toBe(other);
    // A later-created backdated row must not replace the newest session-date default.
    await create('2024-12-31', 2, book);
    expect((await a.agent.get('/api/case-books').expect(200)).body.most_recent_case_book_id).toBe(other);
    const none = await create('2025-01-04', 1, null);
    const behavioral = await create('2025-01-05', 5, book, types.behavioral[0].id);
    expect(behavioral.case_book_id).toBeNull();
    expect(behavioral.case_book_name).toBeNull();
    expect((await a.agent.get('/api/case-books').expect(200)).body.most_recent_case_book_id).toBeNull();
    const dashboard = (await a.agent.get('/api/dashboard').expect(200)).body;
    expect(dashboard.by_case_book).toHaveLength(3);
    expect(dashboard.by_case_book[0]).toEqual({ case_book_id: book, name: books[0].name, publication_year: null, count: 3,
      average_score: 3, last_practiced: '2025-01-02' });
    const thirds = await create('2024-12-30', 4, book);
    expect((await a.agent.get('/api/dashboard').expect(200)).body.by_case_book[0].average_score).toBe(3.3);
    const filtered = (await a.agent.get('/api/sessions').query({ book, score: 'high', q: 'aggregation', sort: 'highest' }).expect(200)).body;
    expect(filtered.sessions.map((s: { id: number }) => s.id)).toEqual([second.id, thirds.id]);
    expect(filtered.total).toBe(7);
    const noBook = (await a.agent.get('/api/sessions').query({ book: 'none' }).expect(200)).body;
    expect(noBook.sessions.map((s: { id: number }) => s.id)).toEqual([none.id]);
    await a.agent.get('/api/sessions').query({ book: '-1' }).expect(400);
    await a.agent.get('/api/sessions').query({ book: '2147483647' }).expect(400);
    const switched = await a.agent.put(`/api/sessions/${first.id}`).set('X-CSRF-Token', a.csrfToken)
      .send({ ...input, session_date: '2025-01-01', overall_score: 3, case_book_id: book,
        question_type_id: types.behavioral[0].id }).expect(200);
    expect(switched.body.case_book_id).toBeNull();
  });

  it('clears a deleted book link without deleting the session, scores, or star', async () => {
    const a = await signUp();
    const book = (await a.agent.post('/api/case-books').set('X-CSRF-Token', a.csrfToken)
      .send({ name: `Delete ${randomUUID().slice(0, 8)}` }).expect(201)).body;
    const types = (await a.agent.get('/api/question-types').expect(200)).body;
    const section = (await a.agent.get('/api/case-sections').expect(200)).body[0];
    const saved = (await a.agent.post('/api/sessions').set('X-CSRF-Token', a.csrfToken).send({
      question_type_id: types.case[0].id, case_book_id: book.id, session_date: '2025-01-01',
      prompt: 'Preserved after book deletion', format: 'solo', overall_score: 4,
      section_scores: [{ section_id: section.id, score: 3 }],
    }).expect(201)).body;
    await a.agent.post(`/api/sessions/${saved.id}/star`).set('X-CSRF-Token', a.csrfToken).expect(204);
    await pool.query('DELETE FROM case_books WHERE id=$1 AND user_id=$2', [book.id, a.id]);
    const after = (await a.agent.get(`/api/sessions/${saved.id}`).expect(200)).body;
    expect(after.case_book_id).toBeNull();
    expect(after.case_book_name).toBeNull();
    expect(after.overall_score).toBe(4);
    expect(after.starred).toBe(true);
    expect(after.section_scores).toHaveLength(1);
    expect(after.section_scores[0].score).toBe(3);
  });

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
