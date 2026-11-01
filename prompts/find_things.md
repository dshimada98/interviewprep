# Initial Prompt
Features 1-5 are done and merged. Now build ONLY Feature 6 (stars) from PLAN.md.

NEW TABLE: stars (one table for all users, a junction table meaning "this user starred this session")
- user_id (required, references users.id, deleted automatically when the user is deleted)
- session_id (required, references practice_sessions.id, deleted automatically when the session is deleted)
- created_at (timestamp, defaults to now)
- Composite primary key on (user_id, session_id), so the same user can never star the same session twice.

API (login required; same security rules as Feature 3)
- POST /api/sessions/:id/star: star a session. Calling it twice is harmless (no error, no duplicate row).
- DELETE /api/sessions/:id/star: unstar a session. Calling it when it isn't starred is harmless.
- The session must belong to the logged-in user, otherwise return 404 "Session not found". The user_id always comes from the logged-in user's server session.
- GET /api/sessions and GET /api/sessions/:id: include "starred": true/false for each session.
- GET /api/sessions?starred=true: only the logged-in user's starred sessions, newest session_date first.

UI
- A star button on every session in the list and on the detail page: an outline star when not starred, a filled navy (#1F2A44) star when starred. Tapping toggles it immediately, and if the server call fails, revert it and show a short error.
- Accessible labels: "Star this session" / "Unstar this session". Tap target at least 44px. Tapping the star in the list must NOT open the session's detail page.
- Add "Starred" to the header navigation. The Starred page (/starred) has the title "Starred" and a subtitle "Your redo list", and lists starred sessions in the same card style as the sessions list.
- Empty state: "No starred sessions yet. Star a session you want to redo."
- Must look good on a phone and a laptop.

DOCUMENTATION AND TESTS
- Update schema.md with the stars table and its relationships ("users and practice sessions connect many-to-many through stars").
- Add one assertion to tests/data-isolation.test.ts: User B trying to star User A's session gets 404.
- Run npm test and confirm everything passes.

DO NOT
- Build search, filters, sorting, dashboard, or stories.
- Change git branches, merge, or push. I manage Git myself.

WHEN YOU'RE DONE
Give me: (1) the files you created or changed, (2) a plain-English explanation of how the stars table works and why it's one table for everyone rather than one per user, and (3) the npm test result.

# Follow up prompt
