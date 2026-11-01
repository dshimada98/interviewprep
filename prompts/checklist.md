## Initial Prompt
Features 1-12 are done and merged. Now build ONLY this improvement: the improvement checklist.

1. NEW TABLE: checklist_items (each row belongs to exactly one user)
- id (primary key)
- user_id (required, references users.id, deleted with the user)
- text (required, up to 200 characters)
- section_id (optional, references case_sections.id): a tag for which case section it's about
- source_session_id (optional, references practice_sessions.id; if that session is deleted, set to empty, keep the item)
- done (true/false, default false)
- created_at (timestamp, default now), done_at (timestamp, optional)
- An item added from a note must not be added twice: at most one item per user + source session + section (where "no section" counts as its own value for the overall note). Enforce this in the database too.

2. API (login required; same security rules as Feature 3)
- GET /api/checklist: the user's open items (newest first) and their 10 most recently completed items, each with section name, source session date and prompt, and whether it came from a note.
- POST /api/checklist: create an item. Either typed text with an optional section_id, or "from note": source_session_id plus section_id (or no section for the session's overall "to improve" note), in which case the text is copied from that note. The source session must belong to the logged-in user; otherwise 404. Adding the same note twice returns the existing item, not an error and not a duplicate.
- PATCH /api/checklist/:id: mark done or undone (set or clear done_at), or edit the text.
- DELETE /api/checklist/:id: delete one item. DELETE /api/checklist/completed: delete all of the user's completed items.
- Anything that isn't the user's returns 404 "Item not found".
- Validation in the existing friendly style: blank -> "Please write what you want to work on."; over 200 characters -> "Please keep it under 200 characters."

3. DASHBOARD UI: a "Before your next case" card directly below the Next-case focus card
- At the top: a text box "Add something to work on…", an optional section dropdown (any of the 7 case sections, or none), and an Add button. Pressing Enter also adds.
- Open items: a large checkbox (at least 44px tap target), the text, a small section chip if tagged, and if it came from a note, a small "from Oct 28 · Coffee chain profitability" link to that session. A small delete icon on each item.
- Ticking an item updates immediately (and reverts with an error message if the save fails), then moves it to a collapsed "Completed (N)" area. Expanding it shows completed items with strikethrough, an untick option to restore, and a "Clear completed" button.
- Empty state: "Nothing on your list. Add something to work on, or add a 'to improve' note from a session."
- Phone: full-width, comfortable to tap. Laptop: fits the existing dashboard layout.

4. ONE-TAP ADD FROM NOTES
- On the session detail page, next to every section's "to improve" note AND the overall "to improve" note, show a small "+ Add to checklist" button. Once added, it changes to "✓ On checklist" (not clickable).
- On the Next-case focus card, add the same button under each quoted note.

5. DOCUMENTATION AND TESTS
- Update schema.md: the checklist_items table and its relationships ("a user has many checklist items; an item can optionally point to a case section and to the session it came from").
- Add assertions to tests/data-isolation.test.ts: (1) User B's GET /api/checklist doesn't include User A's items; (2) User B ticking or deleting User A's item gets 404; (3) User B adding from User A's session's note gets 404.
- Run npm test and confirm everything passes.

DO NOT
- Build the Excel export. That comes next.
- Change git branches, merge, or push. I manage Git myself.

WHEN YOU'RE DONE
Give me: (1) the files you created or changed, (2) a plain-English explanation of how one-tap add works and how it prevents duplicates, and (3) the npm test result.

## Follow-up prompts
