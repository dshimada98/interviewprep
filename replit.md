# InterviewPrep

InterviewPrep is a consulting case and behavioral interview preparation tracker.
The workspace setup is complete; no product frontend or authentication feature
has been implemented as part of setup.

## Run & Operate

- Use the managed workflow `artifacts/api-server: API Server` to run the API server (port 8080 supplied by the workflow).
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild

## Where things live

- `PLAN.md` — full product roadmap; only Feature 1 is currently in build scope.
- `attached_assets/` — original user briefs.
- `artifacts/api-server/` — Express scaffold, with the app exported separately from server startup.
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
- For Feature 1, create only users and the separately approved PostgreSQL
  login-session storage table. Authentication sessions are not practice sessions.
- Preserve the user's PLAN.md and README.md unless specifically asked to edit them.

## Gotchas

- Artifact services own their workflows and supply PORT and BASE_PATH.
  Do not create replacement workflows or run root-level `pnpm dev`.
- No database schema push was performed during setup.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
