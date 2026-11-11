// Production NODE_ENV/cookie behavior, using ONLY a temporary schema in the
// development database. This is not a production provisioning script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pg from 'pg';

if (process.env.PRODUCTION_TEST_CHILD === '1') {
  const { default: request } = await import('supertest');
  const { app, sessionStore } = await import('./app.mjs');
  const { pool } = await import('./db.mjs');
  const { seedQuestionTypes, questionTypeSeeds } = await import('./question-types.mjs');
  const { seedCaseSections, caseSectionSeeds } = await import('./case-sections.mjs');
  const { seedRubric } = await import('./rubric.mjs');
  const { seedCaseBooks } = await import('./case-books.mjs');
  test('fresh provisioned schema: production signup, refresh, logout and login', async () => {
    const https = req => req.set('X-Forwarded-Proto', 'https');
    try {
      // The same seeder used by startup, with production NODE_ENV and a freshly
      // provisioned isolated development schema. No live production writes.
      const legacyOwner = (await pool.query(`INSERT INTO users(email,password_hash)
        VALUES ('legacy-category@example.test','test-only-not-a-login-account') RETURNING id`)).rows[0];
      const legacyType = (await pool.query(`INSERT INTO question_types(name,kind,user_id)
        VALUES ('Wildcard','behavioral',$1) RETURNING id`, [legacyOwner.id])).rows[0];
      const legacySession = (await pool.query(`INSERT INTO practice_sessions
        (user_id,question_type_id,session_date,prompt,overall_score)
        VALUES ($1,$2,'2026-01-01','Legacy custom category',3) RETURNING id`,
      [legacyOwner.id, legacyType.id])).rows[0];
      await seedQuestionTypes();
      await seedCaseSections();
      await seedRubric();
      const caseSeeded = (await pool.query('SELECT id, name, display_order FROM case_sections ORDER BY display_order')).rows;
      await Promise.all([seedCaseSections(), seedCaseSections()]);
      assert.deepEqual((await pool.query('SELECT id, name, display_order FROM case_sections ORDER BY display_order')).rows, caseSeeded);
      assert.deepEqual(caseSeeded.map(row => row.name), caseSectionSeeds);
      const seeded = (await pool.query('SELECT id, name, kind FROM question_types WHERE user_id IS NULL ORDER BY id')).rows;
      await Promise.all([seedQuestionTypes(), seedQuestionTypes()]);
      assert.deepEqual((await pool.query('SELECT id, name, kind FROM question_types WHERE user_id IS NULL ORDER BY id')).rows, seeded);
      assert.equal(seeded.length, questionTypeSeeds.length);
      assert.equal((await pool.query('SELECT question_type_id FROM practice_sessions WHERE id=$1',
        [legacySession.id])).rows[0].question_type_id, legacyType.id);
      assert.equal((await pool.query('SELECT kind FROM question_types WHERE id=$1', [legacyType.id])).rows[0].kind, 'behavioral');
      await https(request(app).get('/api/question-types')).expect(401);
      const status = await https(request(app).get('/api/auth/status')).expect(200);
      const firstCookie = status.headers['set-cookie'][0].split(';')[0];
      const email = 'production-settings-test@example.test';
      const password = 'production-settings-test-password';
      const signup = await https(request(app).post('/api/auth/signup'))
        .set('Cookie', firstCookie).set('X-CSRF-Token', status.body.csrfToken)
        .send({ email, password, confirmPassword: password }).expect(201);
      const signedCookie = signup.headers['set-cookie'][0];
      assert.ok(/Secure/.test(signedCookie) && /HttpOnly/.test(signedCookie) && /SameSite=Lax/.test(signedCookie));
      assert.ok(signedCookie.split(';')[0] !== firstCookie);
      assert.ok(!!signup.headers['content-security-policy']);
      const refresh = await https(request(app).get('/api/auth/status'))
        .set('Cookie', signedCookie.split(';')[0]).expect(200);
      assert.equal(refresh.body.user.email, email);
      await https(request(app).get('/api/me')).set('Cookie', signedCookie.split(';')[0]).expect(200);
      const areas = await https(request(app).get('/api/question-types'))
        .set('Cookie', signedCookie.split(';')[0]).expect(200);
      assert.equal(areas.body.case.length, 9);
      assert.ok(areas.body.case.some(q => q.name === 'Private Equity' && q.kind === 'case'));
      assert.ok(areas.body.case.some(q => q.name === 'Wildcard' && q.kind === 'case'));
      assert.equal(areas.body.behavioral.length, 17);
      // A book created before it became a shared seed keeps its ID and links.
      const privateBook = (await pool.query('INSERT INTO case_books(name,user_id) VALUES ($1,$2) RETURNING id',
        ['Booth Casebook', refresh.body.user.id])).rows[0];
      const practice = (await pool.query(`INSERT INTO practice_sessions
        (user_id,question_type_id,session_date,prompt,overall_score,case_book_id)
        VALUES ($1,$2,'2026-01-01','Legacy Booth session',3,$3) RETURNING id`,
      [refresh.body.user.id, areas.body.case[0].id, privateBook.id])).rows[0];
      await seedCaseBooks();
      await seedCaseBooks();
      const books = (await https(request(app).get('/api/case-books'))
        .set('Cookie', signedCookie.split(';')[0]).expect(200)).body.books;
      assert.equal(books.filter(b => b.name === 'Booth Casebook' && b.user_id === null).length, 1);
      assert.ok(books.some(b => b.id === privateBook.id && b.user_id === refresh.body.user.id));
      assert.equal((await pool.query('SELECT case_book_id FROM practice_sessions WHERE id=$1',
        [practice.id])).rows[0].case_book_id, privateBook.id);
      const sections = await https(request(app).get('/api/case-sections'))
        .set('Cookie', signedCookie.split(';')[0]).expect(200);
      assert.deepEqual(sections.body.map(row => row.name), caseSectionSeeds);
      const rubric = (await https(request(app).get('/api/rubric'))
        .set('Cookie', signedCookie.split(';')[0]).expect(200)).body;
      assert.equal(rubric.scopes.length, sections.body.length + 1);
      assert.ok(rubric.scopes.every(s => s.entries.length === 5 && s.entries.every(e => !e.edited)));
      const logout = await https(request(app).post('/api/auth/logout'))
        .set('Cookie', signedCookie.split(';')[0]).set('X-CSRF-Token', refresh.body.csrfToken)
        .send({}).expect(200);
      assert.ok(/Expires=Thu, 01 Jan 1970/.test(logout.headers['set-cookie'][0]));
      await https(request(app).get('/api/me')).set('Cookie', signedCookie.split(';')[0]).expect(401);
      const next = await https(request(app).get('/api/auth/status')).expect(200);
      const login = await https(request(app).post('/api/auth/login'))
        .set('Cookie', next.headers['set-cookie'][0].split(';')[0]).set('X-CSRF-Token', next.body.csrfToken)
        .send({ email: email.toUpperCase(), password }).expect(200);
      assert.equal(login.body.user.email, email);
    } finally {
      sessionStore.close();
      await pool.end();
    }
  });
} else {
  test('production configuration on a fresh isolated development schema', async () => {
    assert.notEqual(process.env.NODE_ENV, 'production', 'Run this test from development only.');
    const schema = `auth_test_${randomUUID().replaceAll('-', '')}`;
    // This identifier is generated internally, never supplied by a user.
    assert.ok(/^auth_test_[a-f0-9]+$/.test(schema));
    const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const isolated = new pg.Pool({
      connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema}`,
    });
    try {
      await admin.query(`CREATE SCHEMA "${schema}"`);
      assert.equal((await isolated.query("SELECT tablename FROM pg_tables WHERE schemaname=$1", [schema])).rowCount, 0);
      // Simulate the schema being installed BEFORE traffic, as Publish does.
      await isolated.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
      const childEnv = { ...process.env, NODE_ENV: 'production', PGOPTIONS: `-c search_path=${schema}`, PRODUCTION_TEST_CHILD: '1' };
      // Do not inherit the parent runner's internal IPC/reporter context.
      delete childEnv.NODE_TEST_CONTEXT;
      const { stdout } = await promisify(execFile)(process.execPath, ['--test', '--test-reporter=tap', fileURLToPath(import.meta.url)], {
        env: childEnv,
        timeout: 30000,
      });
      assert.ok(stdout.includes('production signup, refresh, logout and login'));
    } finally {
      await isolated.end();
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  });
}
