# Initial Prompt
Features 1-4 are done and merged. Now build ONLY Feature 5 (validation) from PLAN.md for the session form (new and edit pages).

RULES (apply on BOTH the browser and the server)
- session_date: required. Cannot be in the future.
- question_type_id: required, and must be an existing question type.
- prompt: required. Trim spaces first, so a prompt of only spaces counts as blank.
- format: must be solo, partner, or mock.
- overall_score: required, whole number 1-5.
- duration_minutes: optional. If filled in, must be a whole number from 1 to 600.
- Section scores: each must be a whole number 1-5. A section must belong to an existing case section and can appear at most once. Section scores are only allowed on case sessions.

SERVER
- Validate in one shared place used by both POST and PUT /api/sessions.
- On invalid data, return 400 with a JSON object of field-level errors, e.g. { "errors": { "prompt": "...", "overall_score": "..." } }, and save nothing.
- The server is the source of truth: invalid data must be rejected even if someone bypasses the browser.

FRIENDLY MESSAGES (shown in the app, never as browser pop-ups; turn off the browser's built-in validation bubbles)
- Date blank: "Please pick the date of your session."
- Date in future: "The date can't be in the future."
- Question type: "Please choose a question type."
- Prompt: "Please describe the case or question you practiced."
- Overall score: "Please give this session an overall score from 1 to 5."
- Duration: "Duration should be a whole number of minutes, like 30."
- Section score (should only ever come from the server): "Section scores must be between 1 and 5."

FORM BEHAVIOR
- Show each message directly under its field in red (#C0392B), and outline that field in red.
- Show a short summary at the top: "Please fix the highlighted fields."
- Scroll to and focus the first field with an error. This matters on phones.
- Keep everything the user already typed or tapped when showing errors.
- Clear a field's error as soon as the user fixes that field.
- Replace the old generic "Couldn't save" message with these field-level messages. Keep a generic message only for unexpected server errors.

TESTS
- Run npm test and confirm the existing data-isolation test still passes.

DO NOT
- Build stars, search, dashboard, or stories.
- Change git branches, merge, or push. I manage Git myself.

WHEN YOU'RE DONE
Give me: (1) the files you created or changed, (2) a plain-English explanation of why validation happens in both the browser and the server, (3) a request I can run in the Shell that sends a session with a blank prompt directly to the server while logged in (or show me the result of you running it), proving the server rejects it, and (4) the npm test result.

# Follow up prompts (if any)
