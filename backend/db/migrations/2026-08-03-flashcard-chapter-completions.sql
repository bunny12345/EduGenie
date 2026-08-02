-- Learning Games: chapter-completion coin rewards
-- Grants a student a one-time coin bonus the first time they finish every card
-- in a flashcard chapter. The UNIQUE(student_id, deck_id) constraint makes the
-- award idempotent — replaying the chapter never double-pays.

CREATE TABLE IF NOT EXISTS flashcard_chapter_completions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    uuid NOT NULL,
  deck_id       uuid NOT NULL,
  subject_key   text,
  chapter_title text,
  coins_awarded integer NOT NULL DEFAULT 0,
  times_completed integer NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT flashcard_chapter_completions_uniq UNIQUE (student_id, deck_id)
);

CREATE INDEX IF NOT EXISTS idx_fc_completions_student
  ON flashcard_chapter_completions (student_id);
