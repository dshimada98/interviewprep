# Initial Prompt
Features 1-6 are done and merged. Now build ONLY Feature 7 (find things: search, filter, sort) from PLAN.md, on the Sessions list page.

SERVER (do the searching, filtering, and sorting in the database query, not in the browser)
Extend GET /api/sessions with optional query parameters:
- q: keyword search, case-insensitive, matching the session prompt, the overall "went well" and "to improve" notes, AND the section-level notes. A session should appear only once even if several notes match.
- kind: "case" or "behavioral"
- type: a question_type_id
- score: "low" (1-2), "mid" (3), or "high" (4-5), based on overall_score
- sort: "newest" (default), "oldest", "highest", "lowest". Break ties by newest session_date.
- starred: keep the existing starred=true behavior working.
Rules:
- Every result must still be filtered to the logged-in user's sessions only.
- Use parameterized queries. Typing characters like ' or % in the search must not break anything.
- Ignore invalid parameter values instead of erroring.
- Also return the user's total session count, so the page can show "Showing X of Y sessions".

UI ON THE SESSIONS PAGE
- A search box at the top: "Search prompts and notes". Results update as I type, waiting about 300ms after I stop typing.
- Filters:
  - Kind: All / Case / Behavioral, as tap buttons.
  - Question type dropdown, limited to the selected kind.
  - Score: Any / 1-2 / 3 / 4-5, as tap buttons using the score colors.
- A sort dropdown: Newest first, Oldest first, Highest score, Lowest score.
- "Showing X of Y sessions" above the results.
- A "Clear filters" button, shown whenever any search, filter, or non-default sort is active.
- No results: "No sessions match your search." with a Clear filters button.
- Keep the current search, filters, and sort in the page URL, so refreshing the page or pressing Back keeps them.
- On phones: the search box is full width, and the filters collapse behind a "Filters" button showing how many are active, e.g. "Filters (2)". On laptops, show the filters in one row above the list. Nothing scrolls sideways.

TESTS
- Add one assertion to tests/data-isolation.test.ts: User B searching for "Coffee chain" (the words in User A's session prompt) gets zero results.
- Run npm test and confirm everything passes.

DO NOT
- Build the dashboard or stories.
- Change git branches, merge, or push. I manage Git myself.

WHEN YOU'RE DONE
Give me: (1) the files you created or changed, (2) a plain-English explanation of how a search goes from the search box to the database and back, and why it's done in the database rather than the browser, and (3) the npm test result.

# Follow up prompt
