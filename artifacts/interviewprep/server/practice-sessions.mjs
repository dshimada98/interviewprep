import { Router } from 'express';
import { z } from 'zod/v4';
import { pool } from './db.mjs';

// Calendar dates stay date-only strings; never convert a local day to an instant.
function calendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
const integer = (min, max, message) => z.number({ error: message })
  .int({ error: message }).min(min, { error: message }).max(max, { error: message });
const notes = z.string({ error: 'Please enter text.' }).trim()
  .max(4000, 'Please use 4,000 characters or fewer.').nullable().optional();
const input = z.object({
  session_date: z.string({ error: 'Please enter a valid date.' })
    .refine(calendarDate, 'Please enter a valid date.'),
  question_type_id: integer(1, 2147483647, 'Please choose a question type.'),
  prompt: z.string({ error: 'Please enter a prompt.' }).trim()
    .min(1, 'Please enter a prompt.').max(4000, 'Please use 4,000 characters or fewer.'),
  format: z.enum(['solo', 'partner', 'mock'], { error: 'Please choose solo, partner, or mock.' }),
  overall_score: integer(1, 5, 'Please choose a whole-number score from 1 to 5.'),
  duration_minutes: integer(0, 2147483647, 'Please enter whole minutes, zero or greater.').nullable().optional(),
  went_well: notes,
  to_improve: notes,
});
const fields = `s.id, s.question_type_id, s.session_date::text, s.prompt, s.format,
  s.overall_score, s.duration_minutes, s.went_well, s.to_improve, s.created_at,
  q.name AS question_type_name, q.kind`;
const notFound = res => res.status(404).json({ message: 'Session not found' });

async function validated(body, res) {
  const result = input.safeParse(body);
  const errors = {};
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if (field && !errors[field]) errors[field] = issue.message;
    }
  } else {
    const exists = await pool.query('SELECT id FROM question_types WHERE id=$1', [result.data.question_type_id]);
    if (!exists.rowCount) errors.question_type_id = 'Please choose an available question type.';
  }
  if (!result.success || Object.keys(errors).length) {
    res.status(400).json({ message: 'Please check the highlighted fields.', errors });
    return null;
  }
  const data = result.data;
  return [data.question_type_id, data.session_date, data.prompt, data.format,
    data.overall_score, data.duration_minutes ?? null, data.went_well || null, data.to_improve || null];
}

export const practiceSessions = Router();
practiceSessions.get('/', async (req, res) => {
  const result = await pool.query(`SELECT ${fields} FROM practice_sessions s
    JOIN question_types q ON q.id=s.question_type_id WHERE s.user_id=$1
    ORDER BY s.session_date DESC, s.created_at DESC, s.id DESC`, [req.user.id]);
  res.json(result.rows);
});
practiceSessions.post('/', async (req, res) => {
  const values = await validated(req.body, res);
  if (!values) return;
  const result = await pool.query(`WITH s AS (
    INSERT INTO practice_sessions (user_id, question_type_id, session_date, prompt, format,
      overall_score, duration_minutes, went_well, to_improve)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
  ) SELECT ${fields} FROM s JOIN question_types q ON q.id=s.question_type_id`, [req.user.id, ...values]);
  res.status(201).json(result.rows[0]);
});
practiceSessions.use('/:id', (req, res, next) => {
  if (!/^[1-9]\d*$/.test(req.params.id) || Number(req.params.id) > 2147483647) return notFound(res);
  next();
});
practiceSessions.get('/:id', async (req, res) => {
  const result = await pool.query(`SELECT ${fields} FROM practice_sessions s
    JOIN question_types q ON q.id=s.question_type_id WHERE s.id=$1 AND s.user_id=$2`,
  [req.params.id, req.user.id]);
  if (!result.rowCount) return notFound(res);
  res.json(result.rows[0]);
});
practiceSessions.put('/:id', async (req, res) => {
  // Check ownership before validation so foreign and missing IDs behave identically.
  const owned = await pool.query('SELECT id FROM practice_sessions WHERE id=$1 AND user_id=$2',
    [req.params.id, req.user.id]);
  if (!owned.rowCount) return notFound(res);
  const values = await validated(req.body, res);
  if (!values) return;
  const result = await pool.query(`WITH s AS (
    UPDATE practice_sessions SET question_type_id=$3, session_date=$4, prompt=$5, format=$6,
      overall_score=$7, duration_minutes=$8, went_well=$9, to_improve=$10
    WHERE id=$1 AND user_id=$2 RETURNING *
  ) SELECT ${fields} FROM s JOIN question_types q ON q.id=s.question_type_id`,
  [req.params.id, req.user.id, ...values]);
  if (!result.rowCount) return notFound(res);
  res.json(result.rows[0]);
});
practiceSessions.delete('/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM practice_sessions WHERE id=$1 AND user_id=$2 RETURNING id',
    [req.params.id, req.user.id]);
  if (!result.rowCount) return notFound(res);
  res.status(204).end();
});
