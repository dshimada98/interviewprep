import { pool } from './db.mjs';

export const caseSectionSeeds = [
  'Introduction', 'Framework', 'Exhibits', 'Math', 'Brainstorm',
  'Recommendation', 'Driving the case forward',
];

export async function seedCaseSections(database = pool) {
  await database.query(
    `INSERT INTO case_sections (name, display_order)
     SELECT name, position::integer FROM unnest($1::text[]) WITH ORDINALITY AS seeds(name, position)
     ON CONFLICT (name) DO NOTHING`,
    [caseSectionSeeds],
  );
}

export async function getCaseSections() {
  return (await pool.query('SELECT id, name, display_order FROM case_sections ORDER BY display_order, id')).rows;
}

// Parent ownership must already be established by the session handler.
export async function readSectionScores(database, sessionId) {
  return (await database.query(
    `SELECT ss.id, ss.section_id, ss.score, ss.went_well, ss.to_improve,
       cs.name AS section_name, cs.display_order
     FROM section_scores ss JOIN case_sections cs ON cs.id=ss.section_id
     WHERE ss.session_id=$1 ORDER BY cs.display_order, cs.id`,
    [sessionId],
  )).rows;
}

// Called inside the same transaction as the parent session write.
export async function replaceSectionScores(database, sessionId, scores) {
  await database.query('DELETE FROM section_scores WHERE session_id=$1', [sessionId]);
  for (const section of scores) {
    await database.query(
      `INSERT INTO section_scores (session_id, section_id, score, went_well, to_improve)
       VALUES ($1,$2,$3,$4,$5)`,
      [sessionId, section.section_id, section.score, section.went_well || null, section.to_improve || null],
    );
  }
}
