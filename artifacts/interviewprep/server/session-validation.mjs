import { z } from 'zod/v4';

const messages = {
  date: 'Please pick the date of your session.',
  future: "The date can't be in the future.",
  type: 'Please choose a question type.',
  prompt: 'Please describe the case or question you practiced.',
  score: 'Please give this session an overall score from 1 to 5.',
  duration: 'Duration should be a whole number of minutes, like 30.',
  section: 'Section scores must be between 1 and 5.',
};
const integer = (min, max, message) => z.number({ error: message })
  .int({ error: message }).min(min, { error: message }).max(max, { error: message });
const notes = z.string({ error: 'Please enter text.' }).trim()
  .max(4000, 'Please use 4,000 characters or fewer.').nullable().optional();
function calendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
const input = z.object({
  session_date: z.string({ error: messages.date }).refine(calendarDate, messages.date)
    .refine(value => value <= new Date().toISOString().slice(0, 10), messages.future),
  question_type_id: integer(1, 2147483647, messages.type),
  prompt: z.string({ error: messages.prompt }).trim().min(1, messages.prompt)
    .max(4000, 'Please use 4,000 characters or fewer.'),
  format: z.enum(['solo', 'partner', 'mock'], { error: 'Please choose solo, partner, or mock.' }),
  overall_score: integer(1, 5, messages.score),
  duration_minutes: integer(1, 600, messages.duration).nullable().optional(),
  went_well: notes,
  to_improve: notes,
  story_id: integer(1, 2147483647, 'Please choose one of your stories.').nullable().optional(),
  section_scores: z.array(z.object({
    section_id: integer(1, 2147483647, messages.section),
    score: integer(1, 5, messages.section),
    went_well: notes,
    to_improve: notes,
  }), { error: messages.section }).max(7, messages.section).refine(
    scores => new Set(scores.map(row => row.section_id)).size === scores.length,
    messages.section,
  ).optional().default([]),
});

// Both create and update call this before writing anything, within their transaction.
export async function validateSession(body, database, userId) {
  const result = input.safeParse(body);
  const errors = {};
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0] ?? 'form';
      if (!errors[field]) errors[field] = field === 'section_scores' ? messages.section : issue.message;
    }
  }
  // Check references even when other fields failed, so users can fix them together.
  const typeId = input.shape.question_type_id.safeParse(body?.question_type_id);
  let kind;
  if (typeId.success) {
    const type = await database.query('SELECT kind FROM question_types WHERE id=$1 AND (user_id IS NULL OR user_id=$2)', [typeId.data, userId]);
    kind = type.rows[0]?.kind;
    if (!kind) errors.question_type_id = messages.type;
  }
  const scores = input.shape.section_scores.safeParse(body?.section_scores);
  if (scores.success && scores.data.length) {
    if (kind !== 'case') errors.section_scores = messages.section;
    else {
      const sections = await database.query('SELECT id FROM case_sections WHERE id=ANY($1::integer[])',
        [scores.data.map(row => row.section_id)]);
      if (sections.rowCount !== scores.data.length) errors.section_scores = messages.section;
    }
  }
  const story = input.shape.story_id.safeParse(body?.story_id);
  if (story.success && story.data != null) {
    // Hold a key-share lock until this session transaction commits, preventing
    // a concurrent deletion from turning a validated link into a dangling FK.
    const owned = await database.query(
      'SELECT id FROM stories WHERE id=$1 AND user_id=$2 FOR KEY SHARE', [story.data, userId],
    );
    if (!owned.rowCount) errors.story_id = 'Please choose one of your stories.';
  }
  if (!result.success || Object.keys(errors).length) return { errors };
  const data = result.data;
  return {
    values: [data.question_type_id, data.session_date, data.prompt, data.format,
      data.overall_score, data.duration_minutes ?? null, data.went_well || null, data.to_improve || null,
      kind === 'behavioral' ? data.story_id ?? null : null],
    scores: data.section_scores,
  };
}
