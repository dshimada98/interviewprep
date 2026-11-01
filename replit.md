# InterviewPrep

InterviewPrep is a consulting case and behavioral interview preparation tracker.
Features 1 and 2 cover custom email/password authentication and the initial
practice data model/reference areas. No session CRUD or later features exist.

## Run & Operate

- Use the managed workflow `artifacts/interviewprep: web` for the product. One Express process serves React and all `/api` authentication routes.
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm test` — authentication, data-model, and production-settings integration tests against PostgreSQL
- `pnpm --filter @workspace/interviewprep test:browser` — real browser flows against the running product
- Required env: `DATABASE_URL` and `SESSION_SECRET` (never print values)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild

## Where things live

- `PLAN.md` — full product roadmap; build only the currently requested feature.
- `schema.md` — current table definitions, relationships, seeding, and Feature 2 API.
- `attached_assets/` — original user briefs.
- `artifacts/interviewprep/` — product React frontend and Express auth backend. `server/app.mjs` exports the app without a listener; `server/index.mjs` starts it.
- `artifacts/api-server/` — retained unused setup scaffold; it must not intercept the product's `/api` routes.
- `artifacts/mockup-sandbox/` — pre-existing design sandbox, not the product frontend.
- `lib/` — shared database, API specification, generated client, and validation packages.
- `.migration-backup/` — original files retained by the migration. Root PLAN.md,
  README.md, and uploaded briefs were restored byte-for-byte.

## Architecture decisions

- There was no legacy application to port. Setup must not fabricate a website
  or create domain tables simply to demonstrate migration.
- Create the actual React product artifact during the separate Feature 1 build;
  do not place its frontend in the API or mockup-sandbox artifact.

## Product

The separate Feature 1 build is email/password signup, login, logout, and a
protected welcome page. Later practice tracking, scorecards, stars, dashboard,
and stories must not be built early.

## User preferences

- The user manages Git. Do not change branches, merge, or push to main.
- Use in-app email/password authentication with bcrypt and express-session,
  not Replit Auth or third-party login.
- New signup passwords require at least eight characters and one punctuation
  mark or symbol; spaces alone do not count. Preserve login for existing accounts.
- For Feature 1, create only users and the separately approved PostgreSQL
  login-session storage table. Authentication sessions are not practice sessions.
- Preserve the user's PLAN.md and README.md unless specifically asked to edit them. Feature 1 delivery documentation is in `AUTHENTICATION.md`.

## Gotchas

- Artifact services own their workflows and supply PORT and BASE_PATH.
  Do not create replacement workflows or run root-level `pnpm dev`.
- The SQL source of truth is `artifacts/interviewprep/server/schema.sql`.
  Current tables are `users`, `login_sessions`, `question_types`, and
  `practice_sessions`. Never run the empty scaffold's Drizzle push over them.
- Startup seeds only missing shared question types in both development and
  production, after schema provisioning. No startup DDL or production migration
  hooks. Practice-session CRUD and story links remain out of scope.
- Every future API router goes below the shared `requireAuth` boundary in the product's `server/app.mjs`. Mutations require its session-bound CSRF token.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
