import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { app, sessionStore } from './app.mjs';
import { pool } from './db.mjs';

test('real PostgreSQL authentication lifecycle and validation', async t => {
  const prefix = `auth-test-${randomUUID()}`;
  const email = `${prefix}@example.test`;
  const password = 'testing-only-strong-password';
  const tokens = [];
  const ids = [];
  async function client() {
    const agent = request.agent(app);
    const status = await agent.get('/api/auth/status').expect(200);
    assert.equal(status.body.user, null);
    tokens.push(status.body.csrfToken);
    return { agent, token: status.body.csrfToken, cookie: status.headers['set-cookie'][0] };
  }
  const a = await client();
  const post = (path, body, status, message) => a.agent.post(`/api/auth/${path}`)
    .set('X-CSRF-Token', a.token).send(body).expect(status)
    .then(r => { if (message) assert.equal(r.body.message, message); return r; });
  try {
    await t.test('default-deny protects current and future API paths', async () => {
      await request(app).get('/api/me').expect(401);
      await request(app).get('/api/future-route').expect(401);
      await request(app).post('/api/future-route').send({}).expect(401);
      await request(app).post('/api/auth/logout').send({}).expect(401);
    });
    await t.test('requires a session-bound CSRF token, including login/signup', async () => {
      await a.agent.post('/api/auth/signup').send({ email, password, confirmPassword: password }).expect(403);
      await a.agent.post('/api/auth/login').set('X-CSRF-Token', 'x'.repeat(64)).send({ email, password }).expect(403);
    });
    await t.test('exact validation errors are enforced server-side', async () => {
      await post('signup', {}, 400, 'Please fill in all fields.');
      await post('login', { email, password: '' }, 400, 'Please fill in all fields.');
      await post('signup', { email: 'invalid', password, confirmPassword: password }, 400, 'Please enter a valid email address.');
      await post('signup', { email, password: 'short', confirmPassword: 'short' }, 400, 'Password must be at least 8 characters.');
      for (const candidate of ['Password123', 'Only Letters', '密码测试一二三四']) {
        await post('signup', { email, password: candidate, confirmPassword: candidate }, 400,
          'Password must include at least one special character (for example, !, @, or #).');
      }
      assert.equal((await pool.query('SELECT id FROM users WHERE email=$1', [email])).rowCount, 0);
      await post('signup', { email, password, confirmPassword: 'different' }, 400, "Passwords don't match.");
      await post('signup', { email, password: 'a'.repeat(73), confirmPassword: 'a'.repeat(73) }, 400, 'Password must be no more than 72 bytes.');
    });
    await t.test('existing accounts without special characters can still log in', async () => {
      const legacyPassword = 'LegacyPassword123';
      const legacyEmail = `legacy-${email}`;
      const hash = await bcrypt.hash(legacyPassword, 12);
      const legacy = (await pool.query(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id', [legacyEmail, hash],
      )).rows[0];
      ids.push(legacy.id);
      const legacyClient = await client();
      const result = await legacyClient.agent.post('/api/auth/login')
        .set('X-CSRF-Token', legacyClient.token)
        .send({ email: legacyEmail, password: legacyPassword }).expect(200);
      tokens.push(result.body.csrfToken);
      assert.equal(result.body.user.id, legacy.id);
    });
    let signup;
    await t.test('signup normalizes email, hashes password, rotates session and returns safe fields', async () => {
      signup = await post('signup', { email: `  ${email.toUpperCase()}  `, password, confirmPassword: password }, 201);
      ids.push(signup.body.user.id);
      tokens.push(signup.body.csrfToken);
      assert.equal(signup.body.user.email, email);
      assert.deepEqual(Object.keys(signup.body.user).sort(), ['email', 'id']);
      assert.notEqual(signup.body.csrfToken, a.token);
      assert.notEqual(signup.headers['set-cookie'][0].split(';')[0], a.cookie.split(';')[0]);
      assert.match(signup.headers['set-cookie'][0], /HttpOnly/);
      assert.match(signup.headers['set-cookie'][0], /SameSite=Lax/);
      const row = (await pool.query('SELECT password_hash FROM users WHERE id=$1', [signup.body.user.id])).rows[0];
      assert.ok(await bcrypt.compare(password, row.password_hash));
      assert.notEqual(row.password_hash, password);
    });
    await t.test('refresh persists identity and PostgreSQL stores the session', async () => {
      const status = await a.agent.get('/api/auth/status').expect(200);
      assert.deepEqual(status.body.user, signup.body.user);
      await a.agent.get('/api/me').expect(200);
      const rows = await pool.query("SELECT sid FROM login_sessions WHERE (sess->>'userId')::int=$1", [signup.body.user.id]);
      assert.equal(rows.rowCount, 1);
      await request(app).get('/api/me').set('Cookie', a.cookie.split(';')[0]).expect(401);
    });
    await t.test('case-insensitive duplicate returns exact error', async () => {
      a.token = signup.body.csrfToken;
      await post('signup', { email: email.toUpperCase(), password, confirmPassword: password }, 409,
        'An account with this email already exists. Try logging in.');
    });
    await t.test('logout invalidates server session and clears cookie', async () => {
      const cookie = signup.headers['set-cookie'][0].split(';')[0];
      const out = await post('logout', {}, 200);
      assert.match(out.headers['set-cookie'][0], /Expires=Thu, 01 Jan 1970/);
      await a.agent.get('/api/me').expect(401);
      await request(app).get('/api/me').set('Cookie', cookie).expect(401);
    });
    await t.test('login rejects either wrong credential identically and accepts mixed-case email', async () => {
      const b = await client();
      const login = body => b.agent.post('/api/auth/login').set('X-CSRF-Token', b.token).send(body);
      for (const body of [{ email, password: 'wrong-password' }, { email, password: 'short' }, { email: `missing-${email}`, password }]) {
        const result = await login(body).expect(401);
        assert.equal(result.body.message, 'Email or password is incorrect.');
      }
      const loggedIn = await login({ email: email.toUpperCase(), password }).expect(200);
      assert.deepEqual(loggedIn.body.user, signup.body.user);
      tokens.push(loggedIn.body.csrfToken);
      await b.agent.get('/api/me').expect(200);
    });
    await t.test('concurrent duplicate signup produces one success and one friendly conflict', async () => {
      const b = await client();
      const c = await client();
      const raceEmail = `race-${email}`;
      const results = await Promise.all([b, c].map(({ agent, token }) =>
        agent.post('/api/auth/signup').set('X-CSRF-Token', token)
          .send({ email: raceEmail, password, confirmPassword: password })));
      assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
      for (const r of results) {
        if (r.status === 201) { ids.push(r.body.user.id); tokens.push(r.body.csrfToken); }
        else assert.equal(r.body.message, 'An account with this email already exists. Try logging in.');
      }
    });
    await t.test('only approved tables exist', async () => {
      const tables = (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
      assert.deepEqual(tables.map(r => r.tablename), ['case_sections', 'login_sessions', 'practice_sessions', 'question_types', 'section_scores', 'stars', 'stories', 'users']);
    });
  } finally {
    await pool.query("DELETE FROM login_sessions WHERE sess->>'csrfToken'=ANY($1::text[]) OR (sess->>'userId')::int=ANY($2::int[])", [tokens, ids]);
    await pool.query('DELETE FROM users WHERE id=ANY($1::int[])', [ids]);
    sessionStore.close();
    await pool.end();
  }
});
