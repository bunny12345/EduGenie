BEGIN;

ALTER TABLE IF EXISTS public.student_lesson_progress
ADD COLUMN IF NOT EXISTS overall_confidence text DEFAULT 'building';

ALTER TABLE IF EXISTS public.student_lesson_progress
ADD COLUMN IF NOT EXISTS mastery_summary text;

ALTER TABLE IF EXISTS public.student_lesson_progress
ADD COLUMN IF NOT EXISTS next_recommended_subtopic text;

ALTER TABLE IF EXISTS public.student_lesson_progress
ADD COLUMN IF NOT EXISTS strengths jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS public.student_lesson_progress
ADD COLUMN IF NOT EXISTS needs_support jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS public.student_lesson_progress
ADD COLUMN IF NOT EXISTS subtopics jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS public.student_lesson_progress
ADD COLUMN IF NOT EXISTS source_conversation_id text;

ALTER TABLE IF EXISTS public.student_lesson_progress
ADD COLUMN IF NOT EXISTS last_mastery_update_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_student_lesson_progress_last_mastery_update_at
  ON public.student_lesson_progress(last_mastery_update_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_lesson_progress_source_conversation_id
  ON public.student_lesson_progress(source_conversation_id);

COMMIT;