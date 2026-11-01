## Initial Prompt

Features 1-10 are done and merged. Now build ONLY this improvement: more behavioral question types, an "Other" option, and user-created custom behavioral categories.

1. NEW SHARED BEHAVIORAL TYPES
Using the existing safe auto-seeding (insert only missing rows; works on the published database), add these kind "behavioral" types:
Tell me about yourself, Why this firm, Influencing without authority, Entrepreneurial drive, Courageous change, Navigating ambiguity, Giving and receiving feedback, Problem solving, Inclusive leadership, Working under pressure, Other
Do not rename or remove any existing types; existing sessions and stories must be unaffected.

2. CUSTOM CATEGORIES (private to each user)
- Add an optional user_id column to question_types (references users.id, deleted automatically with the user). user_id empty = shared type everyone sees; user_id set = a private custom type only that user sees.
- Users can only create custom types of kind "behavioral".
- A name must not duplicate, ignoring capitalization and extra spaces, any shared type or any of that user's own types. Enforce this in the database too, not just in the code.
- Update the seeding so it only checks against shared types.
- POST /api/question-types: creates a custom behavioral type for the logged-in user. user_id always comes from the server session. Validation messages in the existing friendly style: blank -> "Please enter a category name."; over 40 characters -> "Please keep it under 40 characters."; duplicate -> "You already have a category called [name]."
- GET /api/question-types: returns shared types plus ONLY the logged-in user's custom types. Within the behavioral group, order: shared types alphabetically, then the user's custom types alphabetically, with "Other" last.

3. SECURITY
- Every place that accepts a question_type_id (saving sessions, saving stories, search filters) must check it's either shared or owned by the logged-in user. Another user's custom type is rejected as invalid.

4. UI
- In the behavioral question type dropdown on the session form, and in the competency dropdown on the story form, add a last option "+ Add your own category". Choosing it shows an inline text box with Save and Cancel buttons. On save, the new category is created and automatically selected, with no page reload. Show validation messages inline.
- Custom categories appear wherever behavioral types appear: the story list filter chips, the Sessions filters, and the practice areas chips on the dashboard (mark custom ones with a small "custom" label).
- Must work well on a phone.

5. DOCUMENTATION AND TESTS
- Update schema.md: question_types now has an optional user_id ("shared types have no owner; custom types belong to one user").
- Add assertions to tests/data-isolation.test.ts: (1) User A creates a custom category; User B's GET /api/question-types does not include it; (2) User B saving a session with User A's custom category is rejected.
- Run npm test and confirm everything passes.

DO NOT
- Build case books, the checklist, or the Excel export. Those come next.
- Change git branches, merge, or push. I manage Git myself.

## Follow up Prompts
It seems like I am not able to add a new category? Says cannot add category when trying to save it



WHEN YOU'RE DONE
Give me: (1) the files you created or changed, (2) a plain-English explanation of how shared and custom types live in the same table and how the app keeps custom ones private, and (3) the npm test result.
