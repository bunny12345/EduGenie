-- Migration: Story Mode — cache one AI-written story per lesson (not per
-- request), and track which students have completed which lesson's story.
--
-- Mirrors the flashcards/quiz-rush "generate once, reuse forever" model, but
-- simpler: one story per lesson (no deck/question breakdown needed).
--
-- Idempotent and safe to re-run.

BEGIN;

-- ---------------------------------------------------------------------------
-- lesson_stories: the generated story text, shared across all students in the
-- lesson's class. lesson_id is UNIQUE so generation only ever happens once.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lesson_stories (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id      uuid NOT NULL UNIQUE,   -- soft ref to lessons(id)
  subject_key    text,
  chapter_title  text,
  title          text NOT NULL,
  story          text NOT NULL,
  source         text NOT NULL DEFAULT 'ai',
  generated_at   timestamptz DEFAULT now(),
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lesson_stories_lesson ON public.lesson_stories(lesson_id);

-- ---------------------------------------------------------------------------
-- lesson_story_progress: per-student "finished the story" flag for a lesson.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lesson_story_progress (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     text NOT NULL,
  lesson_id      uuid NOT NULL,          -- soft ref to lessons(id)
  completed_at   timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz DEFAULT now(),
  UNIQUE(student_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_story_progress_student ON public.lesson_story_progress(student_id);

COMMIT;
