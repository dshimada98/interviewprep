## Initial Prompt
Features 1-11 are done and merged. Now build ONLY this improvement: case books. Reuse the same shared-plus-private pattern we used for question types in the last feature.

1. NEW TABLE: case_books
- id (primary key), name (text, required), user_id (optional, references users.id, deleted with the user; empty = shared, set = private to that user), created_at.
- Same duplicate rule as custom question types: no duplicate names ignoring capitalization and extra spaces, against shared books and the user's own books, enforced in the database too.
- Seed these shared books with the existing safe auto-seeding:
  Case in Point, Victor Cheng (Case Interview Secrets), Haas Casebook, Wharton Casebook, Kellogg Casebook, Columbia Casebook, Darden Casebook, Tuck Casebook, Ross Casebook, Fuqua Casebook, MIT Sloan Casebook, Stern Casebook, Firm website practice cases

2. CHANGE TO practice_sessions
- Add case_book_id (optional, references case_books.id; if the book is ever deleted, set to empty, never delete the session).
- Only case sessions can have a case book. Clear it if a session is switched to behavioral.
- An empty case_book_id means "No book / live case".

3. API AND SECURITY
- GET /api/case-books: shared books plus ONLY the logged-in user's own books (shared alphabetically, then the user's own alphabetically). Also return the case_book_id of the user's most recent case session (or empty).
- POST /api/case-books: creates a private case book for the logged-in user. Validation in the existing friendly style: blank -> "Please enter a case book name."; over 60 characters -> "Please keep it under 60 characters."; duplicate -> "You already have a case book called [name]."
- Any place that accepts a case_book_id must check it's shared or owned by the logged-in user; otherwise reject it as invalid.
- Session list and detail responses include the case book name.
- GET /api/sessions accepts a new filter: book (a case_book_id, or "none" for no book / live case).

4. UI
- Session form, when Case is selected: a "Case book" dropdown right after the question type. Options: "No book / live case", then the books, then a last option "+ Add your own case book" (inline text box with Save and Cancel; the new book is created and selected without a page reload). On the NEW session form, default to the book from my most recent case session, since I usually work through one book at a time. On the edit form, keep the session's saved value.
- Session list cards and the detail page: show the case book name (or "No book / live case") in small muted text.
- Sessions page filters: add a "Case book" dropdown alongside the existing filters (inside the Filters panel on phones). It's included in the "Filters (N)" count, the URL, and Clear filters.

5. DASHBOARD
- Add to GET /api/dashboard: by_case_book, a list of each case book the user has used (including "No book / live case" if any), with case count, average overall score (1 decimal), and last practiced date, sorted by case count (most first).
- Add a "By case book" panel below "Cases by type": each row shows the book name, case count, average as a score-colored badge, and "last practiced Oct 28". On a phone, it's a compact stacked list.
- Hide the panel if the user has no case sessions.

6. DOCUMENTATION AND TESTS
- Update schema.md: the case_books table, the new case_book_id column, and the relationships ("a case book has many case sessions; shared books have no owner, custom books belong to one user").
- Add assertions to tests/data-isolation.test.ts: (1) User B's GET /api/case-books does not include User A's custom book; (2) User B saving a session with User A's custom book is rejected.
- Run npm test and confirm everything passes.

DO NOT
- Build the improvement checklist or Excel export. Those come next.
- Change git branches, merge, or push. I manage Git myself.

WHEN YOU'RE DONE
Give me: (1) the files you created or changed, (2) a plain-English explanation of how case books connect to sessions and how the "most recent book" default works, and (3) the npm test result.

## Follow up prompts
Can you add the year of when the casebook was published

