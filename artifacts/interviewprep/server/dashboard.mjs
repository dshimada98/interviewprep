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
    )
    SELECT
      (SELECT count(*)::int FROM cases) AS total_cases,
      (SELECT round(avg(overall_score), 1) FROM cases)::float8 AS average_case_score,
      (SELECT jsonb_build_object('name', name, 'average_score', round(average, 1))
        FROM type_stats WHERE count >= 2 ORDER BY average, name, id LIMIT 1) AS weakest_case_type,
      (SELECT count(*)::int FROM owned WHERE kind = 'behavioral') AS behavioral_sessions,
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
