# InterviewPrep

InterviewPrep tracks consulting case and behavioral interview practice, with section-by-section case scorecards, case books, and a STAR story bank. Its dashboard combines a section heatmap, next-case focus, and an improvement checklist so you can decide what to practice next. Stars, search, and Excel export help you revisit and review your progress.

## Live app

Live URL: myinterviewprep.replit.app

## Features

- **Private accounts:** Sign up, log in, and log out; each account can access only its own practice data.
- **Practice log:** Create, view, edit, and delete case and behavioral sessions with dates, prompts, formats, scores, and feedback.
- **Case scorecards:** Score eight skills including Delivery, see skill subtitles and rubric guidance, record what went well and what to improve, and leave unscored sections as N/A.
- **Scoring rubric:** Calibrate scores from Needs rescue to Offer-level, consult scorecard help, and privately edit or reset descriptions for each case skill and behavioral overall score.
- **Case books:** Choose a book name once, optionally type its edition year, and reuse or create a private edition automatically; add private names, including alongside shared books such as Booth Casebook, and review distinct editions by book.
- **Case categories:** Practice shared case types including Private Equity and Wildcard.
- **Interview styles:** Optionally log interviewer-led, candidate-led, or unsure cases; filter sessions, compare style averages and weakest sections, and export the style to Excel.
- **Behavioral categories:** Use built-in question types or add private custom categories.
- **STAR story bank:** Save stories by competency, link them to behavioral practice, and track practice counts and average scores.
- **Dashboard:** Review practice totals and question-type breakdowns, plus a Section progress card with case/weekly trends, heatmaps, all-time averages, and recent-versus-earlier section comparisons.
- **Next-case focus:** Identify the weakest sections from recent cases and see the latest improvement notes.
- **Improvement checklist:** Add or copy improvement notes, optionally tag a case section, and edit, complete, or clear checklist items.
- **Stars:** Save important sessions for later review in a dedicated starred view.
- **Session finder:** Search prompts and notes, combine filters, and sort practice sessions.
- **Excel export:** Download all your data, regardless of page filters, in six sheets: Summary, Cases (including Delivery), Section notes, Behavioral, Stories, and your current Rubric.

## Tools used

- **Replit Agent** — development assistance.
- **React** — user interface, served with Vite during development.
- **Node/Express** — application server and authenticated API.
- **PostgreSQL** — persistent practice data and login sessions.
- **bcrypt + express-session** — password hashing and session-based authentication.
- **Recharts** — dashboard charts.
- **exceljs** — server-generated Excel workbooks.
- **Vitest + Supertest** — automated API, calculation, and data-isolation tests; additional server tests use Node's built-in test runner.
- **GitHub** — version control with a pull-request workflow.
- **Replit Deployments** — application hosting.

## How to run it

Run commands from the repository root. This is a **pnpm workspace**: use pnpm to install dependencies, not `npm install`.

1. **Prepare the prerequisites.** Use Node.js 24, pnpm, and a running PostgreSQL database. You also need the PostgreSQL `psql` command for initial schema setup.

2. **Configure the environment.** Set these variables in your shell environment or workspace secret settings before running database, server, or test commands:
   - `DATABASE_URL` — connection information for your development PostgreSQL database.
   - `SESSION_SECRET` — a strong, randomly generated secret used to sign login-session cookies.

   Keep their values out of source control and documentation. Use a development database, not a production database, for local setup and tests.

3. **Install dependencies.**

   ```sh
   pnpm install --frozen-lockfile
   ```

4. **Provision the database schema.** For a fresh development database, apply the checked-in SQL:

   ```sh
   psql --dbname="$DATABASE_URL" -v ON_ERROR_STOP=1 -f artifacts/interviewprep/server/schema.sql
   ```

   This command changes the database selected by `DATABASE_URL`. For an existing database, apply the updated idempotent schema before starting this version as well: it adds the nullable `case_style` column and allows new shared seeds without relinking legacy private books. The server expects the schema to exist; it does not create or migrate tables at startup. See [schema.md](schema.md) for database structure and provisioning details.

5. **Start InterviewPrep.**

   ```sh
   pnpm --filter @workspace/interviewprep run dev
   ```

   Express serves both the API and the React application. The default local address is `http://localhost:5000`; when the workspace supplies a different port, use its Preview instead.

   **Question types, case sections, case books, and shared rubric defaults seed automatically on startup**, before the server begins accepting requests. Seeding inserts missing shared reference data without duplicating existing entries or replacing private rubric edits; it requires a working database with the updated schema already provisioned, including `rubric_entries`.

6. **Open the app and create an account.** Sign up to begin logging practice. A new account starts with no practice sessions.

### Production build

With the same required environment variables configured and the database schema provisioned:

```sh
pnpm --filter @workspace/interviewprep run build
pnpm --filter @workspace/interviewprep run start
```

The production server serves the built React app and API together. Production authentication expects HTTPS with secure cookies, so use a suitable HTTPS hosting environment rather than plain local HTTP.

## How to run the tests

Install dependencies, configure `DATABASE_URL` and `SESSION_SECRET`, and provision a dedicated development/test database as described above. The tests use real PostgreSQL, create temporary fixtures, and clean them up; do not point them at a production database.

From the repository root:

```sh
npm test
```

This command runs the Node server suites followed by the Vitest suites. Although installation requires pnpm, `npm test` is supported and invokes the workspace's test script; pnpm must still be available.

### Test files included in `npm test`

Paths in the first table are relative to `artifacts/interviewprep/server/`.

| Test file | What it checks |
| --- | --- |
| `auth.test.mjs` | Signup/login validation, password hashing, persistent sessions, logout, protected routes, and CSRF protection. |
| `data-model.test.mjs` | Reference-data seeding, database constraints, and authenticated access to reference APIs. |
| `practice-sessions.test.mjs` | Private session create/read/update/delete operations, input validation, and ownership enforcement. |
| `scorecard.test.mjs` | Section scores and notes, N/A handling, privacy, database constraints, and atomic scorecard updates. |
| `stars.test.mjs` | Private stars, repeat-safe star/unstar requests, starred ordering, and cascading cleanup. |
| `session-finder.test.mjs` | Search, combined filters, sorting, and user-scoped result counts. |
| `production.test.mjs` | Production-mode authentication and configuration against fresh, isolated development database schemas. |

Paths in the next table are relative to the repository root.

| Test file | What it checks |
| --- | --- |
| `tests/dashboard.test.ts` | Dashboard calculations, section averages, heatmap data, recent cases, empty accounts, and user isolation. |
| `tests/next-case-focus.test.ts` | Recent-case focus selection, N/A exclusion, tie-breaking, improvement notes, and privacy. |
| `tests/stories.test.ts` | STAR story validation and CRUD, competency filtering, session links, practice statistics, and ownership. |
| `tests/rubric.test.ts` | Shared rubric defaults and level names, private edits and resets, validation, Delivery/N/A dashboard data, and personalized Excel exports. |
| `tests/data-isolation.test.ts` | Cross-user isolation for sessions, categories, books, checklist items, and Excel exports, plus workbook contents and formatting. |

### Optional browser test

`artifacts/interviewprep/tests/browser.test.mjs` checks signup, validation, refresh, logout, login, and layout at phone and laptop widths. It is **not** included in `npm test`.

With the app running and system Chromium available, run:

```sh
pnpm --filter @workspace/interviewprep run test:browser
```

Outside the Replit development environment, configure `TEST_BASE_URL` to identify the running app. If Chromium is not on the executable search path, configure `CHROMIUM_PATH`.

## Project docs

- [PLAN.md](PLAN.md) — project scope, feature plan, and product decisions.
- [schema.md](schema.md) — database tables, relationships, constraints, provisioning, and seeding.
