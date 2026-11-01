Feature 1 (sign up and login) is done and merged. Now build ONLY Feature 2 (data model) from PLAN.md. Use the same database setup and migration approach you used for the users table.

NEW TABLE: question_types (shared reference data, the same for every user, not owned by any user)
- id (primary key)
- name (text, required, unique)
- kind (text, required, must be either "case" or "behavioral")

Pre-load these rows:
- kind "case": Market Sizing, Profitability, Market Entry, M&A, Growth Strategy, Pricing, Operations
- kind "behavioral": Leadership, Teamwork, Conflict, Failure / Setback, Impact, Why Consulting

Seeding rules:
- Seed automatically when the server starts, inserting only rows that are missing, so running it many times never creates duplicates.
- This must also work for the published app's database, not just the development database.

NEW TABLE: practice_sessions (each row belongs to exactly one user)
- id (primary key)
- user_id (required, references users.id, delete the user's sessions if the user is deleted)
- question_type_id (required, references question_types.id)
- session_date (date, required)
- prompt (text, required)
- format (text, required, one of "solo", "partner", "mock", default "solo")
- overall_score (integer, required, must be between 1 and 5, enforced in the database too)
- duration_minutes (integer, optional)
- went_well (text, optional)
- to_improve (text, optional)
- created_at (timestamp, defaults to now)
Do NOT add a story_id column yet. That comes with a later feature.

API
- GET /api/question-types: returns all question types grouped by kind. Requires login (use the auth middleware from Feature 1).

HOME PAGE
- Under the welcome message, add a "Your practice areas" section with two groups, "Case" and "Behavioral", each showing its question types as small chips. Use the existing theme colors. Must look good on phone and laptop.

DOCUMENTATION
- Create schema.md in the repo root listing every table that exists now (users, question_types, practice_sessions), each column with its type, the primary keys, and how the tables relate in plain English (e.g. "a user has many practice sessions; a question type has many practice sessions"). Include a mermaid erDiagram.

DO NOT
- Build any forms or pages for creating, editing, or listing practice sessions. That is Feature 3.
- Build scorecards, stars, dashboard, or stories.
- Change git branches, merge, or push. I manage Git myself.

# Prompts after Initial Prompt
