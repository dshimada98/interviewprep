const orders = {
  newest: 's.session_date DESC, s.created_at DESC, s.id DESC',
  oldest: 's.session_date ASC, s.created_at DESC, s.id DESC',
  highest: 's.overall_score DESC, s.session_date DESC, s.created_at DESC, s.id DESC',
  lowest: 's.overall_score ASC, s.session_date DESC, s.created_at DESC, s.id DESC',
};
const scalar = value => typeof value === 'string' ? value : '';

export function sessionListQuery(userId, query, fields) {
  const values = [userId], filters = [];
  const param = value => { values.push(value); return `$${values.length}`; };
  const keyword = scalar(query.q).trim();
  if (keyword) {
    // Escape LIKE metacharacters so % and _ are literal text, not wildcards.
    const pattern = param(`%${keyword.replace(/[\\%_]/g, '\\$&')}%`);
    filters.push(`(s.prompt ILIKE ${pattern} OR s.went_well ILIKE ${pattern} OR s.to_improve ILIKE ${pattern}
      OR EXISTS (SELECT 1 FROM section_scores ss WHERE ss.session_id=s.id
        AND (ss.went_well ILIKE ${pattern} OR ss.to_improve ILIKE ${pattern})))`);
  }
  const kind = scalar(query.kind);
  if (kind === 'case' || kind === 'behavioral') filters.push(`s.kind=${param(kind)}`);
  const type = scalar(query.type);
  if (/^[1-9]\d*$/.test(type) && Number(type) <= 2147483647) {
    const id = param(Number(type));
    // A nonexistent reference ID is an invalid filter, so ignore it too.
    filters.push(`(NOT EXISTS (SELECT 1 FROM question_types qt WHERE qt.id=${id}) OR s.question_type_id=${id})`);
  }
  const score = scalar(query.score);
  const bands = { low: [1, 2], mid: [3, 3], high: [4, 5] };
  if (Object.hasOwn(bands, score)) {
    const [lo, hi] = bands[score];
    filters.push(`s.overall_score BETWEEN ${param(lo)} AND ${param(hi)}`);
  }
  if (query.starred === 'true') filters.push('s.starred=true');
  // Only these static, allowlisted SQL fragments can enter ORDER BY.
  const sort = scalar(query.sort);
  const order = Object.hasOwn(orders, sort) ? orders[sort] : orders.newest;
  return {
    text: `WITH owned AS (
      SELECT ${fields} FROM practice_sessions s JOIN question_types q ON q.id=s.question_type_id
      WHERE s.user_id=$1
    )
    SELECT (SELECT count(*)::integer FROM owned) AS total,
      COALESCE((SELECT json_agg(s ORDER BY ${order}) FROM owned s
        ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}), '[]'::json) AS sessions`,
    values,
  };
}
