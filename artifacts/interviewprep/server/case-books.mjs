import { Router } from 'express';
import { pool } from './db.mjs';

export const caseBookSeeds = [
  'Case in Point', 'Victor Cheng (Case Interview Secrets)', 'Haas Casebook',
  'Wharton Casebook', 'Kellogg Casebook', 'Columbia Casebook', 'Darden Casebook',
  'Tuck Casebook', 'Ross Casebook', 'Fuqua Casebook', 'MIT Sloan Casebook',
  'Stern Casebook', 'Firm website practice cases', 'Booth Casebook',
];
export const publicationYearError = () =>
  `Please enter a four-digit year between 1990 and ${new Date().getFullYear() + 1}.`;

export async function seedCaseBooks(database = pool) {
  await database.query(`INSERT INTO case_books (name)
    SELECT seed.name FROM unnest($1::text[]) AS seed(name)
    WHERE NOT EXISTS (SELECT 1 FROM case_books b WHERE b.user_id IS NULL
      AND b.publication_year IS NULL
      AND category_name_key(b.name)=category_name_key(seed.name))
    ON CONFLICT DO NOTHING`, [caseBookSeeds]);
}

export async function visibleCaseBook(database, id, userId) {
  return (await database.query(
    'SELECT id FROM case_books WHERE id=$1 AND (user_id IS NULL OR user_id=$2) FOR KEY SHARE',
    [id, userId],
  )).rowCount > 0;
}

// Called inside the session transaction, after all input validation succeeded.
// The lock key matches the edition-scope trigger, including shared seed inserts.
export async function resolveCaseBookEdition(database, id, year, userId) {
  const selected = (await database.query(`SELECT name FROM case_books
    WHERE id=$1 AND (user_id IS NULL OR user_id=$2) FOR KEY SHARE`, [id, userId])).rows[0];
  if (!selected) throw new Error('Validated case book is no longer available.');
  await database.query(`SELECT pg_advisory_xact_lock(hashtextextended(
    'case-book:' || category_name_key($1::text) || ':' || coalesce($2::integer,0)::text,0))`,
  [selected.name, year]);
  const { rows } = await database.query(`SELECT id FROM case_books
    WHERE category_name_key(name)=category_name_key($1)
      AND publication_year IS NOT DISTINCT FROM $2::integer
      AND (user_id IS NULL OR user_id=$3)
    ORDER BY (user_id IS NOT NULL),id LIMIT 1 FOR KEY SHARE`, [selected.name, year, userId]);
  if (rows.length) return rows[0].id;
  return (await database.query(`INSERT INTO case_books(name,publication_year,user_id)
    VALUES ($1,$2,$3) RETURNING id`, [selected.name, year, userId])).rows[0].id;
}

export const caseBooks = Router();
caseBooks.get('/', async (req, res) => {
  const { rows } = await pool.query(`SELECT
    (SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY (b.user_id IS NOT NULL), lower(b.name), b.publication_year DESC NULLS LAST, b.id), '[]'::jsonb)
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
  const year = req.body?.publication_year ?? null;
  if (year !== null && (!Number.isInteger(year) || year < 1990 || year > new Date().getFullYear() + 1)) {
    return res.status(400).json({ errors: { publication_year: publicationYearError() } });
  }
  try {
    const { rows } = await pool.query(
      'INSERT INTO case_books (name,user_id,publication_year) VALUES ($1,$2,$3) RETURNING id,name,user_id,publication_year,created_at',
      [name, req.user.id, year],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === '23505') return invalid(`You already have a case book called ${name}${year === null ? '' : ` (${year})`}.`);
    throw error;
  }
});
