CREATE TABLE IF NOT EXISTS attempts (
  id UUID PRIMARY KEY,
  participant_name TEXT NOT NULL,
  exam_date DATE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  correct INTEGER NOT NULL DEFAULT 0,
  wrong INTEGER NOT NULL DEFAULT 0,
  unanswered INTEGER NOT NULL DEFAULT 0,
  total_questions INTEGER NOT NULL DEFAULT 10,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  UNIQUE (id)
);
CREATE TABLE IF NOT EXISTS answers (
  attempt_id UUID NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_index INTEGER NOT NULL,
  selected_index INTEGER,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  elapsed_ms INTEGER NOT NULL DEFAULT 0,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (attempt_id, question_index)
);
CREATE INDEX IF NOT EXISTS attempts_exam_date_idx ON attempts(exam_date);
