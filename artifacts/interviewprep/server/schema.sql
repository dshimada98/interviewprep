CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS login_sessions (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS login_sessions_expire_idx ON login_sessions (expire);

CREATE TABLE IF NOT EXISTS question_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('case', 'behavioral'))
);

CREATE TABLE IF NOT EXISTS stories (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  competency_id INTEGER NOT NULL REFERENCES question_types(id),
  title TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  context TEXT,
  situation TEXT,
  task TEXT,
  action TEXT,
  result TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stories_user_id_idx ON stories (user_id);
CREATE INDEX IF NOT EXISTS stories_competency_id_idx ON stories (competency_id);

CREATE TABLE IF NOT EXISTS practice_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_type_id INTEGER NOT NULL REFERENCES question_types(id),
  session_date DATE NOT NULL,
  prompt TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'solo' CHECK (format IN ('solo', 'partner', 'mock')),
  overall_score INTEGER NOT NULL CHECK (overall_score BETWEEN 1 AND 5),
  duration_minutes INTEGER,
  went_well TEXT,
  to_improve TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS practice_sessions_user_id_idx ON practice_sessions (user_id);
CREATE INDEX IF NOT EXISTS practice_sessions_question_type_id_idx ON practice_sessions (question_type_id);
ALTER TABLE practice_sessions
  ADD COLUMN IF NOT EXISTS story_id INTEGER REFERENCES stories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS practice_sessions_story_id_idx ON practice_sessions (story_id);

CREATE TABLE IF NOT EXISTS case_sections (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS section_scores (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  section_id INTEGER NOT NULL REFERENCES case_sections(id),
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  went_well TEXT,
  to_improve TEXT,
  UNIQUE (session_id, section_id)
);
CREATE INDEX IF NOT EXISTS section_scores_section_id_idx ON section_scores (section_id);

CREATE TABLE IF NOT EXISTS stars (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id INTEGER NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, session_id)
);
CREATE INDEX IF NOT EXISTS stars_session_id_idx ON stars (session_id);
