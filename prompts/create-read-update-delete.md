Features 1 and 2 are done and merged. Now build ONLY Feature 3 (create / read / update / delete practice sessions) from PLAN.md, plus the data-isolation test.

SECURITY RULES (most important)
- Every sessions API route requires login (use the existing auth middleware).
- The user_id for a session always comes from the logged-in user's server session, never from the request body or URL.
- Every query that reads, updates, or deletes a session must filter by the logged-in user's id.
- If a user requests, edits, or deletes a session that doesn't exist OR belongs to someone else, return 404 "Session not found". Never 403, so we don't reveal that it exists.

API
- GET /api/sessions: the logged-in user's sessions only, newest session_date first, including each session's question type name and kind.
- GET /api/sessions/:id: one session (same rules).
- POST /api/sessions: create a session for the logged-in user.
- PUT /api/sessions/:id: update one of the logged-in user's sessions.
- DELETE /api/sessions/:id: delete one of the logged-in user's sessions.

PAGES
- Header navigation: "Sessions" and a "+ Log session" button.
- Sessions list (/sessions): each session shows date, question type (with a small Case or Behavioral label), prompt, format, and overall score as a colored badge using the score color scale (1-2 red, 3 amber, 4-5 green, always showing the number). Each item opens its detail page. On phones show stacked cards; on laptops a clean list or table is fine. If there are no sessions, show "No sessions yet" with a "Log your first session" button.
- New session form (/sessions/new):
  - Date, defaulting to today.
  - A Case / Behavioral toggle that filters the question type dropdown to that kind.
  - Question type dropdown.
  - Prompt (e.g. "Coffee chain profits down 15%").
  - Format as three tap buttons: Solo, Partner, Mock.
  - Overall score as five tap buttons, 1 to 5, colored with the score scale when selected.
  - Duration in minutes (optional).
  - "What went well" and "What to improve" text boxes (optional).
  - After saving, go to the new session's detail page.
- Detail page (/sessions/:id): shows every field, with Edit and Delete buttons.
- Edit page (/sessions/:id/edit): the same form, pre-filled. Saving updates the existing session.
- Delete: clicking Delete opens an in-app confirmation dialog (not a browser alert): "Delete this session? This can't be undone." with Cancel and a red Delete button. After deleting, return to the list.
- If the server rejects a save, show a simple message: "Couldn't save. Please check your entries." Detailed per-field validation messages come later in Feature 5, so don't build those now.
- Everything must look good on a phone (around 375px) and a laptop. Tap targets at least 44px.

DATA-ISOLATION TEST
- Set up Vitest and Supertest, and add an "npm test" script.
- Create tests/data-isolation.test.ts implementing this scenario from PLAN.md:
  Given User A has logged a session "Coffee chain profitability" and User B is a separate account,
  when User B loads their sessions list and also requests User A's session directly by its ID,
  then User B's list is empty and the direct request returns 404.
- The test should sign up two new users with unique emails, using separate agents so each keeps its own login cookie, and delete the test users and their data when it finishes.
- Import the exported Express app directly, so the test doesn't need the server running.

DO NOT
- Build scorecards, validation messages, stars, search, dashboard, or stories.
- Change git branches, merge, or push. I manage Git myself.

WHEN YOU'RE DONE
Run npm test and show me the result. Then give me: (1) the files you created or changed, (2) a plain-English explanation of how a session goes from the form to the database and back to the list, and how the app makes sure each user only sees their own sessions, and (3) a plain-English explanation of what the test does, step by step.

# Secondary Prompts
