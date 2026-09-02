-- Migration: Learning Games — Quiz Rush (arcade version, pre-generated MCQs)
--
-- Mirrors the flashcards content model: quiz questions are generated ONCE per
-- chapter from uploaded lesson content and shared across all students in a
-- class, so the arcade game never hits the LLM live during play (unlike the
-- AI-Tutor-embedded Quiz Rush, which generates on demand per conversation).
-- game_sessions (from the learning-games migration) already logs this game's
-- play history — no new session table needed.
--
-- Idempotent and safe to re-run.

BEGIN;

-- ---------------------------------------------------------------------------
-- quiz_decks: one deck per chapter (subject + class). Shared content.
-- deck_key makes generation idempotent (upsert on a stable slug), same scheme
-- as flashcard_decks.deck_key.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quiz_decks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_key        text NOT NULL UNIQUE,        -- '<subject_key>:<class>:<chapter-slug>'
  subject_key     text NOT NULL,
  class_name      text,
  chapter_id      uuid,                        -- optional soft ref to orchard_chapters(id)
  lesson_id       uuid,                        -- optional soft ref to lessons(id)
  chapter_number  integer NOT NULL DEFAULT 1,
  chapter_title   text NOT NULL,
  source          text NOT NULL DEFAULT 'ai',  -- 'ai' | 'seed' | 'manual'
  question_count  integer NOT NULL DEFAULT 0,
  generated_at    timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_decks_subject ON public.quiz_decks(subject_key);
CREATE INDEX IF NOT EXISTS idx_quiz_decks_subject_class ON public.quiz_decks(subject_key, class_name);
CREATE INDEX IF NOT EXISTS idx_quiz_decks_lesson ON public.quiz_decks(lesson_id);

-- ---------------------------------------------------------------------------
-- quiz_questions: the actual MCQs. Shared content (not per-student).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id         uuid NOT NULL REFERENCES public.quiz_decks(id) ON DELETE CASCADE,
  subject_key     text NOT NULL,
  class_name      text,
  chapter_id      uuid,
  chapter_title   text NOT NULL,
  question        text NOT NULL,
  options         jsonb NOT NULL,              -- string[] (typically 4 options)
  correct_index   integer NOT NULL DEFAULT 0,
  explanation     text,
  difficulty      text NOT NULL DEFAULT 'medium', -- 'easy' | 'medium' | 'hard'
  order_index     integer NOT NULL DEFAULT 0,
  source          text NOT NULL DEFAULT 'ai',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_deck ON public.quiz_questions(deck_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_subject ON public.quiz_questions(subject_key);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_chapter ON public.quiz_questions(chapter_id);

COMMIT;
