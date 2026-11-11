import { pool } from './db.mjs';

// Seed shared reference data only. Never overwrite existing reference rows.
export const questionTypeSeeds = [
  ['Market Sizing', 'case'],
  ['Profitability', 'case'],
  ['Market Entry', 'case'],
  ['M&A', 'case'],
  ['Growth Strategy', 'case'],
  ['Pricing', 'case'],
  ['Operations', 'case'],
  ['Private Equity', 'case'],
  ['Wildcard', 'case'],
  ['Leadership', 'behavioral'],
  ['Teamwork', 'behavioral'],
  ['Conflict', 'behavioral'],
  ['Failure / Setback', 'behavioral'],
  ['Impact', 'behavioral'],
  ['Why Consulting', 'behavioral'],
  ...['Tell me about yourself', 'Why this firm', 'Influencing without authority',
    'Entrepreneurial drive', 'Courageous change', 'Navigating ambiguity',
    'Giving and receiving feedback', 'Problem solving', 'Inclusive leadership',
    'Working under pressure', 'Other'].map(name => [name, 'behavioral']),
];

export async function seedQuestionTypes(database = pool) {
  const names = questionTypeSeeds.map(([name]) => name);
  const kinds = questionTypeSeeds.map(([, kind]) => kind);
  // A single statement is atomic. The shared normalized-name index also makes
  // simultaneous production instance startups safe.
  await database.query(
    `INSERT INTO question_types (name, kind)
     SELECT seed.name, seed.kind FROM unnest($1::text[], $2::text[]) AS seed(name, kind)
     WHERE NOT EXISTS (SELECT 1 FROM question_types q WHERE q.user_id IS NULL
       AND category_name_key(q.name)=category_name_key(seed.name))
     ON CONFLICT DO NOTHING`,
    [names, kinds],
  );
}

export async function getGroupedQuestionTypes(userId) {
  const { rows } = await pool.query(`SELECT id, name, kind, user_id FROM question_types
    WHERE user_id IS NULL OR user_id=$1
    ORDER BY (lower(name)='other'), (user_id IS NOT NULL), lower(name), id`, [userId]);
  return {
    case: rows.filter(row => row.kind === 'case'),
    behavioral: rows.filter(row => row.kind === 'behavioral'),
  };
}

export async function createQuestionType(req, res) {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ') : '';
  const invalid = message => res.status(400).json({ errors: { name: message } });
  if (!name) return invalid('Please enter a category name.');
  if (name.length > 40) return invalid('Please keep it under 40 characters.');
  if (req.body.kind !== undefined && req.body.kind !== 'behavioral') {
    return invalid('Please choose a behavioral category.');
  }
  try {
    const { rows } = await pool.query(
      "INSERT INTO question_types (name, kind, user_id) VALUES ($1,'behavioral',$2) RETURNING id,name,kind,user_id",
      [name, req.user.id],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === '23505') return invalid(`You already have a category called ${name}.`);
    throw error;
  }
}

export async function visibleQuestionType(database, id, userId) {
  return (await database.query(
    'SELECT id,kind FROM question_types WHERE id=$1 AND (user_id IS NULL OR user_id=$2)',
    [id, userId],
  )).rows[0];
}
