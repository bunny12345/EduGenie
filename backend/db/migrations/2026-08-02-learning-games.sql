-- Migration: Learning Games — Flashcards (with spaced repetition)
--
-- Adds a generic "learning games" foundation and the first game: AI Flashcards.
-- Design goals:
--   * Flashcard CONTENT is generated ONCE per chapter (from uploaded lesson
--     content or a seed) and shared across all students in a class → we never
--     re-hit the LLM per session, saving tokens.
--   * Per-student REVIEW state (spaced repetition) is tracked separately so each
--     student sees cards on their own 1 / 3 / 7 / 14 / 30 day schedule.
--   * game_sessions is game-agnostic so future games (quiz, match, memory, …)
--     can reuse the same play-history + rewards plumbing.
--
-- Idempotent and safe to re-run.

BEGIN;

-- ---------------------------------------------------------------------------
-- flashcard_decks: one deck per chapter (subject + class). Shared content.
-- deck_key makes generation idempotent (upsert on a stable slug).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.flashcard_decks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_key        text NOT NULL UNIQUE,        -- '<subject_key>:<class>:<chapter-slug>'
  subject_key     text NOT NULL,               -- e.g. 'mathematics'
  class_name      text,                        -- e.g. 'Class 9'
  board           text,
  chapter_id      uuid,                        -- optional soft ref to orchard_chapters(id)
  lesson_id       uuid,                        -- optional soft ref to lessons(id)
  chapter_number  integer NOT NULL DEFAULT 1,
  chapter_title   text NOT NULL,
  source          text NOT NULL DEFAULT 'ai',  -- 'ai' | 'seed' | 'manual'
  card_count      integer NOT NULL DEFAULT 0,
  generated_at    timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flashcard_decks_subject
  ON public.flashcard_decks(subject_key);
CREATE INDEX IF NOT EXISTS idx_flashcard_decks_subject_class
  ON public.flashcard_decks(subject_key, class_name);
CREATE INDEX IF NOT EXISTS idx_flashcard_decks_lesson
  ON public.flashcard_decks(lesson_id);

-- ---------------------------------------------------------------------------
-- flashcards: the actual Q/A cards. Shared content (not per-student).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.flashcards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id         uuid NOT NULL REFERENCES public.flashcard_decks(id) ON DELETE CASCADE,
  subject_key     text NOT NULL,
  class_name      text,
  chapter_id      uuid,
  chapter_number  integer NOT NULL DEFAULT 1,
  chapter_title   text NOT NULL,
  front           text NOT NULL,               -- question / prompt
  back            text NOT NULL,               -- answer
  hint            text,                         -- optional nudge
  difficulty      text NOT NULL DEFAULT 'medium', -- 'easy' | 'medium' | 'hard'
  order_index     integer NOT NULL DEFAULT 0,
  source          text NOT NULL DEFAULT 'ai',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flashcards_deck
  ON public.flashcards(deck_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_subject
  ON public.flashcards(subject_key);
CREATE INDEX IF NOT EXISTS idx_flashcards_chapter
  ON public.flashcards(chapter_id);

-- ---------------------------------------------------------------------------
-- flashcard_progress: per-student spaced-repetition state for one card.
-- box 0 = brand new (due now). box 1..5 map to the 1/3/7/14/30 day schedule.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.flashcard_progress (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  flashcard_id     uuid NOT NULL REFERENCES public.flashcards(id) ON DELETE CASCADE,
  deck_id          uuid,
  subject_key      text NOT NULL,
  chapter_id       uuid,
  box              integer NOT NULL DEFAULT 0,   -- 0..5 (Leitner-style)
  interval_days    integer NOT NULL DEFAULT 0,
  ease             integer NOT NULL DEFAULT 250, -- x100 (2.50) — reserved for tuning
  due_at           timestamptz NOT NULL DEFAULT now(),
  last_reviewed_at timestamptz,
  review_count     integer NOT NULL DEFAULT 0,
  correct_count    integer NOT NULL DEFAULT 0,
  streak           integer NOT NULL DEFAULT 0,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  UNIQUE(student_id, flashcard_id)
);

CREATE INDEX IF NOT EXISTS idx_flashcard_progress_student
  ON public.flashcard_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_flashcard_progress_student_subject
  ON public.flashcard_progress(student_id, subject_key);
CREATE INDEX IF NOT EXISTS idx_flashcard_progress_student_due
  ON public.flashcard_progress(student_id, due_at);

-- ---------------------------------------------------------------------------
-- game_sessions: game-agnostic play history (for all games, present + future).
-- Powers streaks, rewards and "games played" analytics.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.game_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  game_key       text NOT NULL,               -- 'flashcards' | future games
  subject_key    text,
  chapter_id     uuid,
  chapter_scope  text NOT NULL DEFAULT 'all', -- 'all' | '<chapter title/id>'
  score          integer NOT NULL DEFAULT 0,  -- correct answers
  total          integer NOT NULL DEFAULT 0,  -- cards/questions attempted
  duration_ms    integer,
  meta           jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at     timestamptz DEFAULT now(),
  ended_at       timestamptz DEFAULT now(),
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_game_sessions_student
  ON public.game_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_student_game
  ON public.game_sessions(student_id, game_key);
CREATE INDEX IF NOT EXISTS idx_game_sessions_created
  ON public.game_sessions(created_at);

COMMIT;
