# Initial Prompt
Features 1-8 are done and merged. Now build ONLY Feature 9 (Next-case focus) from PLAN.md.

LOGIC (on the server, added to the GET /api/dashboard response as next_case_focus; logged-in user's data only)
1. Take the user's 5 most recent CASE sessions (by session_date, then created_at), the same ordering the heatmap uses.
2. For each case section scored at least once in those 5 sessions, compute its average score across them (N/A sections have no row and don't count), rounded to 1 decimal, plus how many of the 5 sessions scored it.
3. Pick the 2 sections with the lowest average. Break ties by whichever was scored in more sessions, then by display_order.
4. For each picked section, find the most recent "to improve" note for that section across ALL of the user's case sessions (not just the last 5), skipping blank notes. Return the note text plus the session's id, date, and prompt.
5. If only 1 section has ever been scored, return just that one. If no section scores exist, return an empty list.

UI: a "Focus for your next case" card at the TOP of the dashboard, above the stat cards
- For each focus section: the section name in bold, its average as a score-colored badge, and "over your last N cases".
- Below it, the latest "to improve" note in quotes, with a small "From: Oct 28 · Coffee chain profitability" link that opens that session.
- If a section has no note yet: "No improvement notes yet. Add one next time you score this section."
- If there are no section scores at all: hide the two slots and show "Score the sections of a case to get your focus areas."
- Make the card visually distinct but on-brand: navy (#1F2A44) left border accent, white background.
- Phone: the two focus sections stack. Laptop: side by side. Long notes wrap, never overflow.

TESTS
- Run npm test and confirm all existing tests still pass.

DO NOT
- Build stories.
- Change git branches, merge, or push. I manage Git myself.

WHEN YOU'RE DONE
Give me: (1) the files you created or changed, (2) a plain-English explanation of exactly how the two focus sections are chosen, and (3) the npm test result.

# Follow up prompts
