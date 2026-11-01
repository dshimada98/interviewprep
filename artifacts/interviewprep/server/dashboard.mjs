import { pool } from './db.mjs';

// One statement gives every tile and chart the same database snapshot.
// All session and score aggregates descend from this ownership boundary.
export async function getDashboard(userId) {
  const { rows } = await pool.query(`
    WITH owned AS MATERIALIZED (
      SELECT p.*, q.kind
      FROM practice_sessions p JOIN question_types q ON q.id = p.question_type_id
      WHERE p.user_id = $1
    ), cases AS MATERIALIZED (
      SELECT * FROM owned WHERE kind = 'case'
    ), type_stats AS (
      SELECT q.id, q.name, count(c.id)::int AS count, avg(c.overall_score) AS average
      FROM question_types q LEFT JOIN cases c ON c.question_type_id = q.id
      WHERE q.kind = 'case'
      GROUP BY q.id, q.name
    ), section_stats AS (
      SELECT s.id, s.name, s.display_order,
        round(avg(sc.score), 1) AS average_score, count(sc.score)::int AS scored_count
      FROM case_sections s
      LEFT JOIN (section_scores sc JOIN cases c ON c.id = sc.session_id)
        ON sc.section_id = s.id
      GROUP BY s.id, s.name, s.display_order
    ), recent AS (
      SELECT * FROM cases ORDER BY session_date DESC, created_at DESC, id DESC LIMIT 10
    ), focus_cases AS MATERIALIZED (
      SELECT * FROM recent ORDER BY session_date DESC, created_at DESC, id DESC LIMIT 5
    ), focus_sections AS (
      SELECT s.id, s.name, s.display_order, round(avg(sc.score), 1) AS average_score,
        count(sc.score)::int AS scored_count
      FROM section_scores sc JOIN focus_cases c ON c.id = sc.session_id
      JOIN case_sections s ON s.id = sc.section_id
      GROUP BY s.id, s.name, s.display_order
      ORDER BY average_score, scored_count DESC, s.display_order, s.id
      LIMIT 2
    )
    SELECT
      (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'section_id', f.id, 'section_name', f.name, 'average_score', f.average_score,
          'scored_count', f.scored_count, 'case_count', (SELECT count(*)::int FROM focus_cases),
          'note', n.note
        ) ORDER BY f.average_score, f.scored_count DESC, f.display_order, f.id), '[]'::jsonb)
        FROM focus_sections f LEFT JOIN LATERAL (
          SELECT jsonb_build_object('text', sc.to_improve, 'session_id', c.id,
            'session_date', c.session_date, 'prompt', c.prompt) AS note
          FROM cases c JOIN section_scores sc ON sc.session_id = c.id
          WHERE sc.section_id = f.id AND sc.to_improve ~ '[^[:space:]]'
          ORDER BY c.session_date DESC, c.created_at DESC, c.id DESC
          LIMIT 1
        ) n ON true) AS next_case_focus,
      (SELECT count(*)::int FROM cases) AS total_cases,
      (SELECT round(avg(overall_score), 1) FROM cases)::float8 AS average_case_score,
      (SELECT jsonb_build_object('name', name, 'average_score', round(average, 1))
        FROM type_stats WHERE count >= 2 ORDER BY average, name, id LIMIT 1) AS weakest_case_type,
      (SELECT count(*)::int FROM owned WHERE kind = 'behavioral') AS behavioral_sessions,
      (SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.count DESC, b.name, b.case_book_id NULLS LAST), '[]'::jsonb)
        FROM (SELECT c.case_book_id, coalesce(b.name, 'No book / live case') AS name,
          count(*)::int AS count, round(avg(c.overall_score), 1)::float8 AS average_score,
          max(c.session_date)::text AS last_practiced
          FROM cases c LEFT JOIN case_books b ON b.id=c.case_book_id
            AND (b.user_id IS NULL OR b.user_id=$1)
          GROUP BY c.case_book_id, b.name) b) AS by_case_book,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'count', count)
        ORDER BY id), '[]'::jsonb) FROM type_stats) AS cases_by_type,
      (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY display_order, id), '[]'::jsonb)
        FROM section_stats s) AS section_averages,
      (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', r.id, 'session_date', r.session_date, 'prompt', r.prompt,
          'sections', (SELECT jsonb_agg(jsonb_build_object('section_id', s.id, 'score', sc.score)
            ORDER BY s.display_order, s.id)
            FROM case_sections s LEFT JOIN section_scores sc
              ON sc.section_id = s.id AND sc.session_id = r.id)
        ) ORDER BY r.session_date, r.created_at, r.id), '[]'::jsonb)
        FROM recent r) AS heatmap
  `, [userId]);
  return rows[0];
}
