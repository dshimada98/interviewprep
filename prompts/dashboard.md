# Initial Prompt
Features 1-7 are done and merged. Now build ONLY Feature 8 (dashboard) from PLAN.md, plus the dashboard test.

SERVER: GET /api/dashboard (login required; every calculation uses ONLY the logged-in user's sessions)
Compute everything in the database and return:
- total_cases: number of case sessions.
- average_case_score: average overall_score across case sessions, rounded to 1 decimal (e.g. 4.0). Null if there are no cases.
- weakest_case_type: the case question type with the lowest average overall_score, counting ONLY types with at least 2 sessions. Return its name and average. Null if no type has 2+ sessions.
- behavioral_sessions: number of behavioral sessions.
- cases_by_type: every case question type with its session count, including types with 0.
- section_averages: for each of the 7 case sections in display_order, the average section score rounded to 1 decimal, and how many times it was scored. N/A sections have no row, so they don't count. Null average if never scored.
- heatmap: the 10 most recent case sessions (by session_date, then created_at), ordered oldest to newest, each with its id, session_date, prompt, and its score for each of the 7 sections (null for N/A).

DASHBOARD PAGE (/dashboard)
- Make it the page users land on after logging in, and add "Dashboard" as the first item in the header navigation. Move the "Your practice areas" chips from the home page to the bottom of the dashboard.
- Stat cards in the existing style: big, bold numbers with small labels: "Cases logged", "Average case score" (number shown with the score color), "Weakest case type" (name plus its average, or "Log 2+ cases of one type to see this"), "Behavioral sessions".
- "Cases by type": a compact list of each case type and its count. Types with 0 are shown in muted gray.
- "Average score by section": a Recharts bar chart with the 7 sections on one axis and scores from 0 to 5 on the other. Each bar is colored by the score scale (1-2 red, 3 amber, 4-5 green) and labeled with its value. Never-scored sections show no bar and a "not scored yet" note.
- "Section heatmap": a grid with the 7 sections as rows (in display_order) and the 10 most recent cases as columns (oldest left, newest right). Each column header is a short date (e.g. "Oct 28") and links to that session's detail page. Each cell shows the score number on its score color. N/A cells are blank light gray. Add a small legend: 1-2, 3, 4-5, N/A.

EMPTY STATE
- A brand-new account with no sessions must not show broken charts or "NaN". Show: "Your dashboard fills in as you log sessions." with a "Log your first session" button. This matters because I'll sign up live during my demo.

LAYOUT
- Phone (around 375px): stat cards in a 2×2 grid, then cases by type, the chart, and the heatmap, all stacked. The heatmap scrolls sideways INSIDE its own box with the section-name column staying fixed; the page itself never scrolls sideways.
- Laptop: stat cards in one row of 4; the chart and heatmap side by side.

DASHBOARD TEST
- Create tests/dashboard.test.ts implementing this scenario from PLAN.md:
  Given a user has three sessions with overall scores of 3, 4, and 5,
  when they open the dashboard,
  then the average score shows 4.0.
- Sign up a brand-new test user, create three case sessions (Profitability) scored 3, 4, and 5, call GET /api/dashboard, and check that average_case_score is 4.0 and total_cases is 3. Delete the test user and data afterwards.
- Run npm test and confirm all tests pass.

DOCUMENTATION
- Update schema.md only if any table changed (none should).

DO NOT
- Build the Next-case focus card or stories. Those are later features.
- Change git branches, merge, or push. I manage Git myself.

WHEN YOU'RE DONE
Give me: (1) the files you created or changed, (2) a plain-English explanation of how each stat is calculated, including why weakest type requires 2+ sessions, (3) a plain-English step-by-step explanation of what the dashboard test does, and (4) the npm test result.

# Follow up prompt
