import { Router } from 'express';
import { pool } from './db.mjs';
import { rubricDefaults, scoreLevelNames, sectionSubtitles } from './rubric-defaults.mjs';

export async function seedRubric(database = pool) {
  const { rows } = await database.query('SELECT id,name FROM case_sections ORDER BY display_order,id');
  const scopes = [...rows.map(s => ({ scope: String(s.id), name: s.name })),
    { scope: 'behavioral_overall', name: 'behavioral_overall' }];
  const entries = scopes.flatMap(s => (rubricDefaults[s.name] ?? []).map((description, i) =>
    ({ scope: s.scope, score: i + 1, description })));
  await database.query(`INSERT INTO rubric_entries(scope,score,description)
    SELECT scope,score,description FROM jsonb_to_recordset($1::jsonb)
      AS seed(scope text,score integer,description text)
    ON CONFLICT (scope,score,user_id) DO NOTHING`, [JSON.stringify(entries)]);
}

export async function getRubric(userId, database = pool) {
  const { rows } = await database.query(`WITH scopes AS (
    SELECT id::text AS scope,name,display_order FROM case_sections
    UNION ALL SELECT 'behavioral_overall','Behavioral (overall)',2147483647
  )
  SELECT s.scope,s.name,jsonb_agg(jsonb_build_object(
    'score',n.score,'description',coalesce(p.description,d.description),
    'edited',p.id IS NOT NULL) ORDER BY n.score) AS entries
  FROM scopes s CROSS JOIN generate_series(1,5) n(score)
  LEFT JOIN rubric_entries d ON d.scope=s.scope AND d.score=n.score AND d.user_id IS NULL
  LEFT JOIN rubric_entries p ON p.scope=s.scope AND p.score=n.score AND p.user_id=$1
  GROUP BY s.scope,s.name,s.display_order ORDER BY s.display_order,s.scope`, [userId]);
  return { scopes: rows.map(s => ({
    scope: s.scope, name: s.name, subtitle: sectionSubtitles[s.name] ?? '',
    entries: s.entries.map(e => {
      if (e.description == null) throw new Error('Rubric defaults are missing; run reference seeding.');
      return { ...e, level_name: scoreLevelNames[e.score - 1] };
    }),
  })) };
}

async function scopeExists(scope) {
  if (scope === 'behavioral_overall') return true;
  if (!/^[1-9]\d{0,9}$/.test(scope) || Number(scope) > 2147483647) return false;
  return (await pool.query('SELECT id FROM case_sections WHERE id=$1', [Number(scope)])).rowCount > 0;
}

export const rubric = Router();
rubric.get('/', async (req, res) => res.json(await getRubric(req.user.id)));
rubric.put('/:scope/:score', async (req, res) => {
  const { scope, score } = req.params;
  if (!/^[1-5]$/.test(score) || !await scopeExists(scope)) {
    return res.status(404).json({ message: 'Rubric level not found.' });
  }
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
  if (!description) return res.status(400).json({ errors: { description: 'Please describe what this score means.' } });
  if (description.length > 200) return res.status(400).json({ errors: { description: 'Please keep it under 200 characters.' } });
  await pool.query(`INSERT INTO rubric_entries(scope,score,description,user_id) VALUES ($1,$2,$3,$4)
    ON CONFLICT (scope,score,user_id) DO UPDATE SET description=excluded.description`,
  [scope, Number(score), description, req.user.id]);
  res.json({ score: Number(score), level_name: scoreLevelNames[Number(score) - 1], description, edited: true });
});
rubric.delete('/:scope', async (req, res) => {
  if (!await scopeExists(req.params.scope)) return res.status(404).json({ message: 'Rubric section not found.' });
  await pool.query('DELETE FROM rubric_entries WHERE scope=$1 AND user_id=$2', [req.params.scope, req.user.id]);
  res.status(204).end();
});
