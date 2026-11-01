import { pool } from './db.mjs';
import { getDashboard } from './dashboard.mjs';
import { buildExportWorkbook } from './export-workbook.mjs';

export async function readExportData(userId) {
  const client = await pool.connect();
  try {
    // All sheets and the reused dashboard calculations describe one snapshot.
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const dashboard = await getDashboard(userId, client);
    const sessions = (await client.query(`SELECT p.*, p.session_date::text AS session_date,
      q.name AS question_type_name,q.kind,b.name AS case_book_name,b.publication_year,
      st.title AS story_title,EXISTS(SELECT 1 FROM stars x WHERE x.user_id=$1 AND x.session_id=p.id) AS starred
      FROM practice_sessions p JOIN question_types q ON q.id=p.question_type_id
        AND (q.user_id IS NULL OR q.user_id=$1)
      LEFT JOIN case_books b ON b.id=p.case_book_id AND (b.user_id IS NULL OR b.user_id=$1)
      LEFT JOIN stories st ON st.id=p.story_id AND st.user_id=$1
      WHERE p.user_id=$1 ORDER BY p.session_date DESC,p.created_at DESC,p.id DESC`, [userId])).rows;
    const sectionNotes = (await client.query(`SELECT sc.*,s.name AS section_name,s.display_order,
      p.session_date::text AS session_date,p.prompt
      FROM section_scores sc JOIN practice_sessions p ON p.id=sc.session_id AND p.user_id=$1
      JOIN question_types q ON q.id=p.question_type_id AND q.kind='case'
      JOIN case_sections s ON s.id=sc.section_id
      ORDER BY p.session_date DESC,s.display_order,s.id,p.created_at DESC,p.id DESC`, [userId])).rows;
    const stories = (await client.query(`SELECT st.*,q.name AS competency_name,
      count(p.id)::int AS times_practiced,round(avg(p.overall_score),1)::float8 AS average_score
      FROM stories st JOIN question_types q ON q.id=st.competency_id
        AND (q.user_id IS NULL OR q.user_id=$1)
      LEFT JOIN (practice_sessions p JOIN question_types pt ON pt.id=p.question_type_id AND pt.kind='behavioral')
        ON p.story_id=st.id AND p.user_id=$1
      WHERE st.user_id=$1 GROUP BY st.id,q.name ORDER BY st.created_at DESC,st.id DESC`, [userId])).rows;
    const checklist = (await client.query(`SELECT c.text,s.name AS section_name
      FROM checklist_items c LEFT JOIN case_sections s ON s.id=c.section_id
      WHERE c.user_id=$1 AND NOT c.done ORDER BY c.created_at DESC,c.id DESC`, [userId])).rows;
    await client.query('COMMIT');
    return { dashboard, sessions, sectionNotes, stories, checklist };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function downloadExport(req, res) {
  const data = await readExportData(req.user.id);
  const today = new Date().toISOString().slice(0, 10);
  const workbook = buildExportWorkbook(data, today);
  const buffer = await workbook.xlsx.writeBuffer();
  res.attachment(`InterviewPrep_${today}.xlsx`);
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(Buffer.from(buffer));
}
