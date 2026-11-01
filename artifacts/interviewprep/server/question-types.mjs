import { pool } from './db.mjs';

// Shared reference data, not user-owned. Never overwrite existing reference rows.
export const questionTypeSeeds = [
  ['Market Sizing', 'case'],
  ['Profitability', 'case'],
  ['Market Entry', 'case'],
  ['M&A', 'case'],
  ['Growth Strategy', 'case'],
  ['Pricing', 'case'],
  ['Operations', 'case'],
  ['Leadership', 'behavioral'],
  ['Teamwork', 'behavioral'],
  ['Conflict', 'behavioral'],
  ['Failure / Setback', 'behavioral'],
  ['Impact', 'behavioral'],
  ['Why Consulting', 'behavioral'],
];

export async function seedQuestionTypes(database = pool) {
  const names = questionTypeSeeds.map(([name]) => name);
  const kinds = questionTypeSeeds.map(([, kind]) => kind);
  // A single statement is atomic. The unique name constraint also makes
  // simultaneous production instance startups safe.
  await database.query(
    `INSERT INTO question_types (name, kind)
     SELECT * FROM unnest($1::text[], $2::text[])
     ON CONFLICT (name) DO NOTHING`,
    [names, kinds],
  );
}

export async function getGroupedQuestionTypes() {
  const { rows } = await pool.query('SELECT id, name, kind FROM question_types ORDER BY name');
  return {
    case: rows.filter(row => row.kind === 'case'),
    behavioral: rows.filter(row => row.kind === 'behavioral'),
  };
}
