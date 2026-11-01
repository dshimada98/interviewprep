import { Router } from 'express';
import { pool } from './db.mjs';

export const caseBookSeeds = [
  'Case in Point', 'Victor Cheng (Case Interview Secrets)', 'Haas Casebook',
  'Wharton Casebook', 'Kellogg Casebook', 'Columbia Casebook', 'Darden Casebook',
  'Tuck Casebook', 'Ross Casebook', 'Fuqua Casebook', 'MIT Sloan Casebook',
  'Stern Casebook', 'Firm website practice cases',
];

export async function seedCaseBooks(database = pool) {
  await database.query(`INSERT INTO case_books (name)
    SELECT seed.name FROM unnest($1::text[]) AS seed(name)
    WHERE NOT EXISTS (SELECT 1 FROM case_books b WHERE b.user_id IS NULL
      AND category_name_key(b.name)=category_name_key(seed.name))
    ON CONFLICT DO NOTHING`, [caseBookSeeds]);
}

export async function visibleCaseBook(database, id, userId) {
  return (await database.query(
    'SELECT id FROM case_books WHERE id=$1 AND (user_id IS NULL OR user_id=$2) FOR KEY SHARE',
    [id, userId],
  )).rowCount > 0;
}

export const caseBooks = Router();
caseBooks.get('/', async (req, res) => {
  const { rows } = await pool.query(`SELECT
    (SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY (b.user_id IS NOT NULL), lower(b.name), b.id), '[]'::jsonb)
      FROM case_books b WHERE b.user_id IS NULL OR b.user_id=$1) AS books,
    (SELECT p.case_book_id FROM practice_sessions p JOIN question_types q ON q.id=p.question_type_id
      WHERE p.user_id=$1 AND q.kind='case'
      ORDER BY p.session_date DESC, p.created_at DESC, p.id DESC LIMIT 1) AS most_recent_case_book_id`,
  [req.user.id]);
  res.json(rows[0]);
});
caseBooks.post('/', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ') : '';
  const invalid = message => res.status(400).json({ errors: { name: message } });
  if (!name) return invalid('Please enter a case book name.');
  if (name.length > 60) return invalid('Please keep it under 60 characters.');
  try {
    const { rows } = await pool.query(
      'INSERT INTO case_books (name,user_id) VALUES ($1,$2) RETURNING id,name,user_id,created_at',
      [name, req.user.id],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === '23505') return invalid(`You already have a case book called ${name}.`);
    throw error;
  }
});
