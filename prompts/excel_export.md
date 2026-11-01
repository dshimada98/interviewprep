## Initial Prompt
Features 1-13 are done and merged. Now build ONLY this improvement: an Excel export.

1. SERVER: GET /api/export.xlsx (login required)
- Generate the file on the server with the exceljs library, using ONLY the logged-in user's data.
- Send it as a download named InterviewPrep_YYYY-MM-DD.xlsx (today's date).
- Always export everything (not the current page filters).
- Write all text as plain text values, never as formulas.

2. SHEETS (in this order)
a) "Summary"
   - Title "InterviewPrep — practice summary" and the export date.
   - Key stats: cases logged, average case score, weakest case type, behavioral sessions (same calculations as the dashboard; reuse that code, don't duplicate it).
   - "Strongest sections": the 2 case sections with the highest average score. "Focus areas": the Next-case focus sections with their latest "to improve" notes.
   - Section averages: all 7 sections with their average and times scored.
   - Open checklist items: text and section.
   - If the user has no sessions, show "No sessions logged yet." instead of empty tables.
b) "Cases": one row per case session, newest first. Columns: Date, Case book (or "No book / live case"), Case type, Prompt, Format, Overall score, Introduction, Framework, Exhibits, Math, Brainstorm, Recommendation, Driving the case forward, What went well, What to improve, Starred (Yes/No). Section columns are empty for N/A.
c) "Section notes": one row per scored section. Date, Prompt, Section, Score, What went well, What to improve. Sorted by date (newest first), then section order.
d) "Behavioral": one row per behavioral session, newest first. Date, Question type, Story used, Prompt, Format, Overall score, What went well, What to improve.
e) "Stories": one row per story. Title, Competency, Context, Situation, Task, Action, Result, Times practiced, Average score.

3. FORMATTING (every sheet with a table)
- Header row: bold white text on navy (#1F2A44), frozen so it stays visible while scrolling, with filters turned on.
- Dates are real Excel dates (format d-mmm-yyyy), and scores are real numbers, so sorting and formulas work.
- Score cells get a light fill with dark text: 1-2 light red (#F5B7B1), 3 light amber (#FAD7A0), 4-5 light green (#ABEBC6). Empty (N/A) cells stay blank.
- Sensible column widths; long text columns (prompt, notes, STAR fields) wrap and are wide enough to read.

4. UI
- An "Export to Excel" button (with a download icon) at the top of the Sessions page and on the dashboard, styled as a secondary button, not competing with "+ Log session".
- While the file generates, the button shows "Preparing…" and is disabled. If it fails, show a short error message.
- Must work on a phone (the file downloads or opens in the phone's preview).

5. TESTS
- Add to tests/data-isolation.test.ts: download the export as User A and confirm it contains "Coffee chain profitability"; download it as User B and confirm it does NOT. (Read the file in the test with exceljs.)
- Run npm test and confirm everything passes.

DO NOT
- Change any other features or the database structure.
- Change git branches, merge, or push. I manage Git myself.

WHEN YOU'RE DONE
Give me: (1) the files you created or changed, (2) a plain-English explanation of how the export goes from the button click to a file on my computer, and why it's generated on the server, and (3) the npm test result.

## Follow Up Prompt
