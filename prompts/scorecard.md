Features 1-3 are done and merged. Now build ONLY Feature 4 (case scorecard) from PLAN.md.

NEW TABLE: case_sections (shared reference data, same for every user)
- id (primary key), name (text, required, unique), display_order (integer, required)
- Seed these 7 rows in this order, using the same safe auto-seeding approach as question_types (insert only missing rows, works for the published database too):
  1 Introduction, 2 Framework, 3 Exhibits, 4 Math, 5 Brainstorm, 6 Recommendation, 7 Driving the case forward

NEW TABLE: section_scores
- id (primary key)
- session_id (required, references practice_sessions.id, deleted automatically when the session is deleted)
- section_id (required, references case_sections.id)
- score (integer, required, between 1 and 5, enforced in the database)
- went_well (text, optional), to_improve (text, optional)
- A unique constraint on (session_id, section_id), so a session can never have two scores for the same section.
- A section marked N/A has NO row.

SAVING (critical: avoid duplicates)
- When a session is created or edited, save its section scores in ONE database transaction: delete that session's existing section scores, then insert the currently scored sections. Editing must never create duplicate rows.
- If a session's question type is changed from a case type to a behavioral type, delete its section scores.
- Section scores are only ever read or written through their parent session, using the same rule as Feature 3: the session must belong to the logged-in user, otherwise 404. Include the section scores in the GET /api/sessions/:id response, ordered by display_order.

FORM (new and edit pages)
- When Case is selected, show a "Scorecard" section below the overall score, with one compact row per case section in display_order, like an interviewer's feedback form.
- Each row: the section name, then six tap buttons: 1, 2, 3, 4, 5, N/A. N/A is selected by default. Selected scores use the score color scale (1-2 red, 3 amber, 4-5 green).
- Each row has a small "Add notes" link that expands "What went well" and "What to improve" boxes for that section. Rows that already have notes start expanded on the edit page.
- When Behavioral is selected, hide the scorecard completely.
- On the edit page, pre-fill every section's score and notes.

DETAIL PAGE
- For case sessions, show the scorecard as a table: section, score badge (number plus color), what went well, what to improve. Show N/A sections in muted gray with "N/A".
- On phones, show each section as a stacked card instead of a wide table.

MOBILE
- Scoring all 7 sections on a phone must be fast and easy: tap targets at least 44px, nothing scrolls sideways.

DOCUMENTATION AND TESTS
- Update schema.md with both new tables and their relationships ("a practice session has many section scores, at most one per case section").
- Run npm test and confirm the existing data-isolation test still passes.

DO NOT
- Build validation messages, stars, search, dashboard, or stories.
- Change git branches, merge, or push. I manage Git myself.

WHEN YOU'RE DONE
Give me: (1) the files you created or changed, (2) a plain-English explanation of how the scorecard is saved and how editing avoids duplicates, and (3) the npm test result.

# Post Initial Prompt Adjustments
