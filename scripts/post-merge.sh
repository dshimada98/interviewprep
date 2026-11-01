#!/usr/bin/env bash
set -euo pipefail
pnpm install --frozen-lockfile
if [ "${NODE_ENV:-development}" = "production" ]; then
  echo "Post-merge setup must only run in development." >&2
  exit 1
fi
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f artifacts/interviewprep/server/schema.sql
