# Initial Prompt
Features 1-9 are done and merged. Now build ONLY Feature 10 (STAR story bank) from PLAN.md.

NEW TABLE: stories (each row belongs to exactly one user)
- id (primary key)
- user_id (required, references users.id, deleted automatically when the user is deleted)
- competency_id (required, references question_types.id; must be a "behavioral" question type)
- title (text, required)
- context (text, optional, e.g. "FP&A, budget reforecast")
- situation, task, action, result (text, optional)
- created_at (timestamp, defaults to now)

CHANGE TO practice_sessions
- Add story_id (optional, references stories.id). If the story is deleted, set story_id to null; never delete the session.
- story_id is only allowed on behavioral sessions. If a session is changed to a case type, clear its story_id.

SECURITY (same rules as Feature 3)
- All story routes require login. user_id always comes from the logged-in user's server session.
- Reading, editing, or deleting a story that isn't the user's returns 404 "Story not found".
- When saving a session with a story_id, the story must belong to the same logged-in user. Otherwise reject it with a validation error. A user must never be able to link someone else's story by sending its id.

API
- GET /api/stories (optional ?competency=id): the user's stories, each with competency name, times_practiced, and average overall score of the sessions that used it (rounded to 1 decimal, null if never practiced).
- GET /api/stories/:id: one story, plus the list of sessions that used it (id, date, prompt, overall score), newest first.
- POST /api/stories, PUT /api/stories/:id, DELETE /api/stories/:id.

VALIDATION (same friendly in-app style as Feature 5, on both browser and server)
- Title blank: "Please give your story a short title."
- Competency missing: "Please choose the main competency this story shows."

PAGES
- Add "Stories" to the header navigation, after Starred.
- Stories list (/stories): filter chips across the top: All plus each behavioral competency, each showing its story count, e.g. "Leadership (2)". Each story card shows the title, competency, context, and "Practiced 3× · avg 3.7" (or "Not practiced yet"). Empty state: "No stories yet. Add the stories you'll use in behavioral interviews." with an "Add a story" button.
- New / edit story form: title, competency dropdown (behavioral types only), context, then four labeled text boxes that grow as you type, each with a short hint:
  - Situation: "Where and when? What was at stake?"
  - Task: "What were you responsible for?"
  - Action: "What did YOU do, step by step?"
  - Result: "What happened? Quantify it if you can."
- Story detail (/stories/:id): the title and competency; the context; the four STAR sections clearly labeled; a stats line "Practiced N times · average X"; a "Used in" list of sessions (date, prompt, score badge) linking to each session; Edit and Delete buttons; and a "Practice this story" button that opens the new session form pre-set to Behavioral, this story's competency, and this story.
- Delete: in-app confirmation: "Delete this story? This can't be undone." If it's linked to sessions, add: "It's linked to N sessions. They'll keep their scores but lose the link."
- Session form: when Behavioral is selected, show an optional "Story used" dropdown listing the user's stories, with stories matching the selected question type listed first. Hide it for case sessions.
- Session detail: for behavioral sessions with a story, show "Story used: [title]" linking to the story.
- Phone: the STAR boxes are full width and comfortable for long writing; the nav stays in the compact menu; nothing scrolls sideways.

DOCUMENTATION AND TESTS
- Update schema.md with the stories table, the new story_id column, and the relationships: "a user has many stories", "a story can be used in many behavioral sessions", "each story has one main competency".
- Add two assertions to tests/data-isolation.test.ts: (1) User B requesting User A's story by id gets 404; (2) User B trying to save a session linked to User A's story is rejected.
- Run npm test and confirm everything passes.

DO NOT
- Build anything beyond this feature (no streaks, no coverage view, no multiple competency tags).
- Change git branches, merge, or push. I manage Git myself.

WHEN YOU'RE DONE
Give me: (1) the files you created or changed, (2) a plain-English explanation of how stories connect to sessions and to competencies, and how the app stops one user from using another user's story, and (3) the npm test result.

# Follow up prompts
