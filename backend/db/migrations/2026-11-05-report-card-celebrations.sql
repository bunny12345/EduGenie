-- Remembers which students have already seen the top-3 rank celebration for an
-- exam, so it plays once when results are announced and never again.
-- Additive only; service-role access (RLS on, no policies). Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS public.report_exam_celebrations (
  exam_id       uuid NOT NULL REFERENCES public.report_exams(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  celebrated_at timestamptz DEFAULT now(),
  PRIMARY KEY (exam_id, student_id)
);

ALTER TABLE public.report_exam_celebrations ENABLE ROW LEVEL SECURITY;

COMMIT;
