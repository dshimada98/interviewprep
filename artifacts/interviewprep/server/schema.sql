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
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('case', 'behavioral'))
);
ALTER TABLE question_types ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE question_types DROP CONSTRAINT IF EXISTS question_types_name_key;
CREATE OR REPLACE FUNCTION category_name_key(value TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT lower(btrim(regexp_replace(value, '[[:space:]]+', ' ', 'g')));
$$;
CREATE UNIQUE INDEX IF NOT EXISTS question_types_shared_name_idx
  ON question_types (category_name_key(name)) WHERE user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS question_types_private_name_idx
  ON question_types (user_id, category_name_key(name)) WHERE user_id IS NOT NULL;
CREATE OR REPLACE FUNCTION check_question_type_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Serialize equal normalized names, including shared/private conflicts.
  PERFORM pg_advisory_xact_lock(hashtextextended(category_name_key(NEW.name), 0));
  IF NEW.user_id IS NOT NULL AND (NEW.kind <> 'behavioral'
      OR length(category_name_key(NEW.name)) = 0 OR length(NEW.name) > 40) THEN
    RAISE EXCEPTION 'Invalid custom category' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM question_types q WHERE q.id <> NEW.id
      AND category_name_key(q.name) = category_name_key(NEW.name)
      AND ((NEW.user_id IS NULL AND q.user_id IS NOT NULL)
        OR (NEW.user_id IS NOT NULL AND q.user_id IS NULL))) THEN
    RAISE EXCEPTION 'Duplicate category' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER question_types_scope_check BEFORE INSERT OR UPDATE ON question_types
  FOR EACH ROW EXECUTE FUNCTION check_question_type_scope();

CREATE TABLE IF NOT EXISTS case_books (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(category_name_key(name)) > 0 AND length(name) <= 60),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS case_books_shared_name_idx
  ON case_books (category_name_key(name)) WHERE user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS case_books_private_name_idx
  ON case_books (user_id, category_name_key(name)) WHERE user_id IS NOT NULL;
CREATE OR REPLACE FUNCTION check_case_book_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('case-book:' || category_name_key(NEW.name), 0));
  IF EXISTS (SELECT 1 FROM case_books b WHERE b.id <> NEW.id
      AND category_name_key(b.name) = category_name_key(NEW.name)
      AND ((NEW.user_id IS NULL AND b.user_id IS NOT NULL)
        OR (NEW.user_id IS NOT NULL AND b.user_id IS NULL))) THEN
    RAISE EXCEPTION 'Duplicate case book' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER case_books_scope_check BEFORE INSERT OR UPDATE ON case_books
  FOR EACH ROW EXECUTE FUNCTION check_case_book_scope();

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
ALTER TABLE practice_sessions
  ADD COLUMN IF NOT EXISTS case_book_id INTEGER REFERENCES case_books(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS practice_sessions_case_book_id_idx ON practice_sessions (case_book_id);
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
