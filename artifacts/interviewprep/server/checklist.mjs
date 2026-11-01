import { Router } from 'express';
import { pool } from './db.mjs';

export const checklist = Router();
const fields = `c.*, s.name AS section_name, p.session_date::text AS source_session_date,
  p.prompt AS source_session_prompt`;
const joins = `LEFT JOIN case_sections s ON s.id=c.section_id
  LEFT JOIN practice_sessions p ON p.id=c.source_session_id AND p.user_id=c.user_id`;
const positiveId = value => Number.isInteger(value) && value > 0 && value <= 2147483647;
const missing = res => res.status(404).json({ message: 'Item not found' });
const invalid = (res, field, message) => res.status(400).json({ errors: { [field]: message } });
function checkedText(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return { error: 'Please write what you want to work on.' };
  if ([...text].length > 200) return { error: 'Please keep it under 200 characters.' };
  return { text };
}
async function item(database, id, userId) {
  return (await database.query(`SELECT ${fields} FROM checklist_items c ${joins}
    WHERE c.id=$1 AND c.user_id=$2`, [id, userId])).rows[0];
}

checklist.get('/', async (req, res) => {
  // One statement keeps lists, counts and membership consistent under concurrent edits.
  const { rows } = await pool.query(`WITH owned AS (
    SELECT ${fields} FROM checklist_items c ${joins} WHERE c.user_id=$1
  ) SELECT
    (SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.created_at DESC,o.id DESC),'[]'::jsonb)
      FROM owned o WHERE NOT o.done) AS open,
    (SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.done_at DESC,o.id DESC),'[]'::jsonb)
      FROM (SELECT * FROM owned WHERE done ORDER BY done_at DESC,id DESC LIMIT 10) o) AS completed,
    (SELECT count(*)::int FROM owned WHERE done) AS completed_count,
    (SELECT coalesce(jsonb_agg(jsonb_build_object('source_session_id',o.source_session_id,
      'section_id',o.section_id)),'[]'::jsonb) FROM owned o WHERE o.source_session_id IS NOT NULL) AS note_keys`,
  [req.user.id]);
  res.json(rows[0]);
});

checklist.post('/', async (req, res) => {
  const body = req.body ?? {};
  const source = body.source_session_id ?? null;
  const section = body.section_id ?? null;
  if (source !== null && !positiveId(source)) return missing(res);
  if (section !== null && !positiveId(section)) return invalid(res, 'section_id', 'Please choose a case section.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let text = body.text;
    if (source !== null) {
      const session = (await client.query(`SELECT to_improve FROM practice_sessions
        WHERE id=$1 AND user_id=$2 FOR KEY SHARE`, [source, req.user.id])).rows[0];
      if (!session) { await client.query('ROLLBACK'); return missing(res); }
      // An already-added note is idempotent even if the original note was edited,
      // cleared, or the checklist item's text/done state has since changed.
      const existing = (await client.query(`SELECT id FROM checklist_items
        WHERE user_id=$1 AND source_session_id=$2 AND section_id IS NOT DISTINCT FROM $3::int FOR UPDATE`,
      [req.user.id, source, section])).rows[0];
      if (existing) {
        const result = await item(client, existing.id, req.user.id);
        await client.query('COMMIT');
        return res.json(result);
      }
      text = section === null ? session.to_improve
        : (await client.query('SELECT to_improve FROM section_scores WHERE session_id=$1 AND section_id=$2',
          [source, section])).rows[0]?.to_improve;
    }
    if (section !== null && !(await client.query('SELECT id FROM case_sections WHERE id=$1', [section])).rowCount) {
      await client.query('ROLLBACK');
      return invalid(res, 'section_id', 'Please choose a case section.');
    }
    const value = checkedText(text);
    if (value.error) { await client.query('ROLLBACK'); return invalid(res, 'text', value.error); }
    const { rows } = await client.query(`INSERT INTO checklist_items
      (user_id,text,section_id,source_session_id,from_note) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (user_id,source_session_id,(coalesce(section_id,0))) WHERE source_session_id IS NOT NULL
      DO UPDATE SET id=checklist_items.id RETURNING id`,
    [req.user.id, value.text, section, source, source !== null]);
    const result = await item(client, rows[0].id, req.user.id);
    await client.query('COMMIT');
    res.json(result);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

// This static path must precede /:id.
checklist.delete('/completed', async (req, res) => {
  await pool.query('DELETE FROM checklist_items WHERE user_id=$1 AND done', [req.user.id]);
  res.sendStatus(204);
});
checklist.patch('/:id', async (req, res) => {
  const id = Number(req.params.id), userId = req.user.id;
  if (!positiveId(id) || !await item(pool, id, userId)) return missing(res);
  const body = req.body ?? {};
  const hasText = Object.hasOwn(body, 'text'), hasDone = Object.hasOwn(body, 'done');
  if (!hasText && !hasDone) return invalid(res, 'form', 'Please choose a change to save.');
  if (hasDone && typeof body.done !== 'boolean') return invalid(res, 'done', 'Please choose done or not done.');
  const value = hasText ? checkedText(body.text) : {};
  if (value.error) return invalid(res, 'text', value.error);
  const updated = await pool.query(`UPDATE checklist_items SET
    text=CASE WHEN $3 THEN $4::text ELSE text END,
    done=CASE WHEN $5 THEN $6::boolean ELSE done END,
    done_at=CASE WHEN NOT $5 THEN done_at WHEN $6 THEN coalesce(done_at,now()) ELSE NULL END
    WHERE id=$1 AND user_id=$2 RETURNING id`, [id, userId, hasText, value.text ?? null, hasDone, body.done ?? null]);
  if (!updated.rowCount) return missing(res);
  const result = await item(pool, id, userId);
  if (!result) return missing(res);
  res.json(result);
});
checklist.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!positiveId(id)) return missing(res);
  const result = await pool.query('DELETE FROM checklist_items WHERE id=$1 AND user_id=$2', [id, req.user.id]);
  if (!result.rowCount) return missing(res);
  res.sendStatus(204);
});
