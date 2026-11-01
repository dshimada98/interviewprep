import { Router } from 'express';
import { pool } from './db.mjs';
import { sessionTransaction } from './practice-sessions.mjs';
import { validateStory } from './story-validation.mjs';
import { visibleQuestionType } from './question-types.mjs';

const notFound = res => res.status(404).json({ message: 'Story not found' });
const fields = `st.id, st.competency_id, st.title, st.context, st.situation, st.task,
  st.action, st.result, st.created_at, q.name AS competency_name,
  stats.times_practiced, stats.average_score`;
const source = `stories st JOIN question_types q ON q.id=st.competency_id
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS times_practiced, round(avg(p.overall_score), 1)::float8 AS average_score
    FROM practice_sessions p JOIN question_types pt ON pt.id=p.question_type_id
    WHERE p.story_id=st.id AND p.user_id=st.user_id AND pt.kind='behavioral'
  ) stats ON true`;

async function readStory(database, userId, id) {
  return (await database.query(`SELECT ${fields}, (
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'session_date', p.session_date,
      'prompt', p.prompt, 'overall_score', p.overall_score)
      ORDER BY p.session_date DESC, p.created_at DESC, p.id DESC), '[]'::jsonb)
    FROM practice_sessions p JOIN question_types pt ON pt.id=p.question_type_id
    WHERE p.story_id=st.id AND p.user_id=st.user_id AND pt.kind='behavioral'
  ) AS sessions FROM ${source} WHERE st.user_id=$1 AND st.id=$2`, [userId, id])).rows[0];
}

export const stories = Router();
stories.get('/', async (req, res) => {
  const raw = req.query.competency;
  const competency = typeof raw === 'string' && /^[1-9]\d*$/.test(raw)
    && Number(raw) <= 2147483647 ? Number(raw) : null;
  if (competency) {
    const type = await visibleQuestionType(pool, competency, req.user.id);
    if (!type) {
      const exists = await pool.query('SELECT id FROM question_types WHERE id=$1', [competency]);
      if (exists.rowCount) return res.status(400).json({ errors: { competency: 'Please choose a competency.' } });
    } else if (type.kind !== 'behavioral') {
      return res.status(400).json({ errors: { competency: 'Please choose a competency.' } });
    }
  }
  res.json((await pool.query(`SELECT ${fields} FROM ${source}
    WHERE st.user_id=$1 AND ($2::integer IS NULL OR st.competency_id=$2)
    ORDER BY st.created_at DESC, st.id DESC`, [req.user.id, competency])).rows);
});
stories.post('/', async (req, res) => {
  const saved = await sessionTransaction(async database => {
    const input = await validateStory(req.body, database, req.user.id);
    if (input.errors) { res.status(400).json({ errors: input.errors }); return null; }
    const result = await database.query(`INSERT INTO stories
      (user_id, competency_id, title, context, situation, task, action, result)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [req.user.id, ...input.values]);
    return readStory(database, req.user.id, result.rows[0].id);
  });
  if (saved) res.status(201).json(saved);
});
stories.use('/:id', (req, res, next) => {
  if (!/^[1-9]\d*$/.test(req.params.id) || Number(req.params.id) > 2147483647) return notFound(res);
  next();
});
stories.get('/:id', async (req, res) => {
  const story = await readStory(pool, req.user.id, req.params.id);
  if (!story) return notFound(res);
  res.json(story);
});
stories.put('/:id', async (req, res) => {
  const saved = await sessionTransaction(async database => {
    const owned = await database.query('SELECT id FROM stories WHERE id=$1 AND user_id=$2 FOR UPDATE',
      [req.params.id, req.user.id]);
    if (!owned.rowCount) { notFound(res); return null; }
    const input = await validateStory(req.body, database, req.user.id);
    if (input.errors) { res.status(400).json({ errors: input.errors }); return null; }
    await database.query(`UPDATE stories SET competency_id=$3, title=$4, context=$5,
      situation=$6, task=$7, action=$8, result=$9 WHERE id=$1 AND user_id=$2`,
    [req.params.id, req.user.id, ...input.values]);
    return readStory(database, req.user.id, req.params.id);
  });
  if (saved) res.json(saved);
});
stories.delete('/:id', async (req, res) => {
  // The FK sets story_id to null atomically; practice rows and scores survive.
  const result = await pool.query('DELETE FROM stories WHERE id=$1 AND user_id=$2',
    [req.params.id, req.user.id]);
  if (!result.rowCount) return notFound(res);
  res.status(204).end();
});
