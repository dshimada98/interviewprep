import { Router } from 'express';
import { pool } from './db.mjs';
import { replaceSectionScores } from './case-sections.mjs';
import { validateSession } from './session-validation.mjs';
import { sessionListQuery } from './session-finder.mjs';
import { visibleQuestionType } from './question-types.mjs';
import { visibleCaseBook } from './case-books.mjs';
const fields = `s.id, s.question_type_id, s.session_date::text, s.prompt, s.format,
  s.overall_score, s.duration_minutes, s.went_well, s.to_improve, s.created_at,
  q.name AS question_type_name, q.kind, s.story_id, s.case_book_id,
  (SELECT b.name FROM case_books b WHERE b.id=s.case_book_id
    AND (b.user_id IS NULL OR b.user_id=s.user_id) AND q.kind='case') AS case_book_name,
  (SELECT st.title FROM stories st WHERE st.id=s.story_id AND st.user_id=s.user_id
    AND q.kind='behavioral') AS story_title,
  EXISTS (SELECT 1 FROM stars st WHERE st.session_id=s.id AND st.user_id=s.user_id) AS starred`;
const notFound = res => res.status(404).json({ message: 'Session not found' });

async function validated(body, res, database, userId) {
  const result = await validateSession(body, database, userId);
  if (result.errors) {
    res.status(400).json({ errors: result.errors });
    return null;
  }
  return result;
}

// Also used by tests to prove real PostgreSQL rollback on an insertion failure.
export async function sessionTransaction(operation) {
  const database = await pool.connect();
  try {
    await database.query('BEGIN');
    const result = await operation(database);
    await database.query('COMMIT');
    return result;
  } catch (error) {
    await database.query('ROLLBACK');
    throw error;
  } finally {
    database.release();
  }
}

async function readSession(database, sessionId, userId) {
  // One statement gives a consistent snapshot of parent and child rows while
  // enforcing ownership before anything, including section notes, is returned.
  return (await database.query(`SELECT ${fields}, COALESCE((
    SELECT json_agg(json_build_object(
      'id', ss.id, 'section_id', ss.section_id, 'score', ss.score,
      'went_well', ss.went_well, 'to_improve', ss.to_improve,
      'section_name', cs.name, 'display_order', cs.display_order
    ) ORDER BY cs.display_order, cs.id)
    FROM section_scores ss JOIN case_sections cs ON cs.id=ss.section_id
    WHERE ss.session_id=s.id
  ), '[]'::json) AS section_scores
  FROM practice_sessions s JOIN question_types q ON q.id=s.question_type_id
  WHERE s.id=$1 AND s.user_id=$2`, [sessionId, userId])).rows[0];
}

export const practiceSessions = Router();
practiceSessions.get('/', async (req, res) => {
  const book = req.query.book;
  if (book !== undefined && book !== 'none') {
    if (typeof book !== 'string' || !/^[1-9]\d*$/.test(book) || Number(book) > 2147483647 ||
        !await visibleCaseBook(pool, Number(book), req.user.id)) {
      return res.status(400).json({ errors: { book: 'Please choose a case book.' } });
    }
  }
  const type = req.query.type;
  if (typeof type === 'string' && /^[1-9]\d*$/.test(type) && Number(type) <= 2147483647) {
    const visible = await visibleQuestionType(pool, Number(type), req.user.id);
    if (!visible) {
      const exists = await pool.query('SELECT id FROM question_types WHERE id=$1', [Number(type)]);
      if (exists.rowCount) return res.status(400).json({ errors: { type: 'Please choose a question type.' } });
    }
  }
  const result = await pool.query(sessionListQuery(req.user.id, req.query, fields));
  res.json(result.rows[0]);
});
practiceSessions.post('/', async (req, res) => {
  const saved = await sessionTransaction(async database => {
    const data = await validated(req.body, res, database, req.user.id);
    if (!data) return null;
    const result = await database.query(`INSERT INTO practice_sessions (user_id, question_type_id, session_date, prompt, format,
      overall_score, duration_minutes, went_well, to_improve, story_id, case_book_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, [req.user.id, ...data.values]);
    const id = result.rows[0].id;
    await replaceSectionScores(database, id, data.scores);
    return readSession(database, id, req.user.id);
  });
  if (saved) res.status(201).json(saved);
});
practiceSessions.use('/:id', (req, res, next) => {
  if (!/^[1-9]\d*$/.test(req.params.id) || Number(req.params.id) > 2147483647) return notFound(res);
  next();
});
async function setStar(req, res, starred) {
  const found = await sessionTransaction(async database => {
    // Serialize star/unstar with session edits/deletion and establish ownership
    // before touching the junction table. Client-supplied user_id is never used.
    const owned = await database.query('SELECT id FROM practice_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE',
      [req.params.id, req.user.id]);
    if (!owned.rowCount) return false;
    if (starred) {
      await database.query('INSERT INTO stars (user_id, session_id) VALUES ($1,$2) ON CONFLICT (user_id, session_id) DO NOTHING',
        [req.user.id, req.params.id]);
    } else {
      await database.query('DELETE FROM stars WHERE user_id=$1 AND session_id=$2', [req.user.id, req.params.id]);
    }
    return true;
  });
  if (!found) return notFound(res);
  res.status(204).end();
}
practiceSessions.post('/:id/star', (req, res) => setStar(req, res, true));
practiceSessions.delete('/:id/star', (req, res) => setStar(req, res, false));
practiceSessions.get('/:id', async (req, res) => {
  const saved = await readSession(pool, req.params.id, req.user.id);
  if (!saved) return notFound(res);
  res.json(saved);
});
practiceSessions.put('/:id', async (req, res) => {
  const saved = await sessionTransaction(async database => {
    // Lock the owned parent first: concurrent replacements cannot interleave.
    const owned = await database.query('SELECT id FROM practice_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE',
      [req.params.id, req.user.id]);
    if (!owned.rowCount) { notFound(res); return null; }
    const data = await validated(req.body, res, database, req.user.id);
    if (!data) return null;
    await database.query(`UPDATE practice_sessions SET question_type_id=$3, session_date=$4, prompt=$5, format=$6,
      overall_score=$7, duration_minutes=$8, went_well=$9, to_improve=$10, story_id=$11, case_book_id=$12
      WHERE id=$1 AND user_id=$2`, [req.params.id, req.user.id, ...data.values]);
    await replaceSectionScores(database, req.params.id, data.scores);
    return readSession(database, req.params.id, req.user.id);
  });
  if (saved) res.json(saved);
});
practiceSessions.delete('/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM practice_sessions WHERE id=$1 AND user_id=$2 RETURNING id',
    [req.params.id, req.user.id]);
  if (!result.rowCount) return notFound(res);
  res.status(204).end();
});
