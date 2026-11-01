import { z } from 'zod/v4';

const TITLE = 'Please give your story a short title.';
const COMPETENCY = 'Please choose the main competency this story shows.';
const text = z.string({ error: 'Please enter text.' }).trim()
  .max(4000, 'Please use 4,000 characters or fewer.').nullable().optional();
const input = z.object({
  title: z.string({ error: TITLE }).trim().min(1, TITLE)
    .max(300, 'Please use 300 characters or fewer.'),
  competency_id: z.number({ error: COMPETENCY }).int({ error: COMPETENCY })
    .min(1, COMPETENCY).max(2147483647, COMPETENCY),
  context: text, situation: text, task: text, action: text, result: text,
});

export async function validateStory(body, database) {
  const parsed = input.safeParse(body);
  const errors = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] ?? 'form';
      if (!errors[key]) errors[key] = issue.message;
    }
  }
  const competency = input.shape.competency_id.safeParse(body?.competency_id);
  if (competency.success) {
    const found = await database.query(
      "SELECT id FROM question_types WHERE id=$1 AND kind='behavioral'", [competency.data],
    );
    if (!found.rowCount) errors.competency_id = COMPETENCY;
  }
  if (!parsed.success || Object.keys(errors).length) return { errors };
  const s = parsed.data;
  return { values: [s.competency_id, s.title, s.context || null, s.situation || null,
    s.task || null, s.action || null, s.result || null] };
}
