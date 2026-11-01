import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import bcrypt from 'bcrypt';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { pool } from './db.mjs';
import { getGroupedQuestionTypes } from './question-types.mjs';

const production = process.env.NODE_ENV === 'production';
if (!process.env.SESSION_SECRET) throw new Error('SESSION_SECRET is required. Add it in Replit Secrets.');
const cookieName = 'interviewprep.sid';
const cookieOptions = { httpOnly: true, secure: production, sameSite: 'lax', path: '/' };
const PgStore = connectPgSimple(session);
export const sessionStore = new PgStore({ pool, tableName: 'login_sessions', createTableIfMissing: false });
sessionStore.on('error', () => console.error('Session storage error.'));
export const app = express();
app.disable('x-powered-by');
// Both Replit Preview and production sit behind a single trusted reverse-proxy hop.
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: production ? undefined : false }));
app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use('/api', express.json({ limit: '16kb' }));
app.use('/api', session({
  name: cookieName,
  secret: process.env.SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 },
}));

function newToken(req) {
  req.session.csrfToken = randomBytes(32).toString('hex');
  return req.session.csrfToken;
}
// A session-bound synchronizer token also prevents cross-site login/signup requests.
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!req.session.userId && !['/auth/login', '/auth/signup'].includes(req.path)) return next();
  const supplied = req.get('X-CSRF-Token');
  const expected = req.session.csrfToken;
  if (!supplied || !expected || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return res.status(403).json({ message: 'Your session has expired. Refresh the page and try again.' });
  }
  next();
});

const publicAuth = express.Router();
publicAuth.get('/status', async (req, res) => {
  let user = null;
  if (req.session.userId) {
    user = (await pool.query('SELECT id, email FROM users WHERE id = $1', [req.session.userId])).rows[0] ?? null;
    if (!user) delete req.session.userId;
  }
  const csrfToken = req.session.csrfToken || newToken(req);
  res.json({ user, csrfToken });
});
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again in 15 minutes.' },
});
const errors = {
  blank: 'Please fill in all fields.',
  invalidEmail: 'Please enter a valid email address.',
  short: 'Password must be at least 8 characters.',
  special: 'Password must include at least one special character (for example, !, @, or #).',
  mismatch: "Passwords don't match.",
  duplicate: 'An account with this email already exists. Try logging in.',
  credentials: 'Email or password is incorrect.',
};
function validate(body, signup) {
  const { email, password, confirmPassword } = body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password.trim() ||
      (signup && (typeof confirmPassword !== 'string' || !confirmPassword.trim()))) return errors.blank;
  if (email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return errors.invalidEmail;
  if (password.length < 8) return signup ? errors.short : errors.credentials;
  // bcrypt only considers the first 72 bytes: reject rather than silently truncate.
  if (Buffer.byteLength(password, 'utf8') > 72) return signup ? 'Password must be no more than 72 bytes.' : errors.credentials;
  if (signup && !/[\p{P}\p{S}]/u.test(password)) return errors.special;
  if (signup && password !== confirmPassword) return errors.mismatch;
}
async function establishSession(req, res, user, status = 200) {
  await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
  req.session.userId = user.id;
  const csrfToken = newToken(req);
  await new Promise((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
  res.status(status).json({ user, csrfToken });
}
publicAuth.post('/signup', limiter, async (req, res) => {
  const error = validate(req.body, true);
  if (error) return res.status(400).json({ message: error });
  const email = req.body.email.trim().toLowerCase();
  const hash = await bcrypt.hash(req.body.password, 12);
  let user;
  try {
    user = (await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email', [email, hash],
    )).rows[0];
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ message: errors.duplicate });
    throw error;
  }
  await establishSession(req, res, user, 201);
});
// Do equivalent bcrypt work when an email is unknown to reduce timing differences.
const dummyHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
publicAuth.post('/login', limiter, async (req, res) => {
  const error = validate(req.body, false);
  if (error) return res.status(error === errors.credentials ? 401 : 400).json({ message: error });
  const found = (await pool.query(
    'SELECT id, email, password_hash FROM users WHERE email = $1', [req.body.email.trim().toLowerCase()],
  )).rows[0];
  const matches = await bcrypt.compare(req.body.password, found?.password_hash ?? dummyHash);
  if (!found || !matches) return res.status(401).json({ message: errors.credentials });
  await establishSession(req, res, { id: found.id, email: found.email });
});
// Only these three explicitly defined routes are public.
app.use('/api/auth', publicAuth);

export async function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ message: 'Please log in to continue.' });
  const user = (await pool.query('SELECT id, email FROM users WHERE id = $1', [req.session.userId])).rows[0];
  if (!user) return res.status(401).json({ message: 'Please log in to continue.' });
  req.user = user;
  next();
}
// Register every future API router BELOW this default-deny boundary.
app.use('/api', requireAuth);
app.get('/api/question-types', async (_req, res) => {
  res.json(await getGroupedQuestionTypes());
});
app.post('/api/auth/logout', (req, res, next) => {
  req.session.destroy(err => {
    if (err) return next(err);
    res.clearCookie(cookieName, cookieOptions);
    res.json({ user: null });
  });
});
app.get('/api/me', (req, res) => res.json({ user: req.user }));
app.use('/api', (_req, res) => res.status(404).json({ message: 'API route not found.' }));
app.use((error, _req, res, _next) => {
  // Never log request bodies, database errors, passwords, hashes, or session secrets.
  if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'Please send valid JSON.' });
  if (error.type === 'entity.too.large') return res.status(413).json({ message: 'Request is too large.' });
  console.error('Request failed.');
  res.status(500).json({ message: 'Something went wrong. Please try again.' });
});
export default app;
