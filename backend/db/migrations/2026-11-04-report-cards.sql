-- Report Cards: class-wide exam results (e.g. "Annual Exam") that every subject
-- teacher of a class fills in for their own subject. A student only sees an exam
-- once marks exist for ALL of the class's subjects (enforced in the backend).
--
-- Additive only — no existing table is altered. The backend uses the service
-- role key, so RLS is enabled with no policies: anon/authenticated roles get no
-- direct access. Idempotent — safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS public.report_exams (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  class_name  text NOT NULL,
  name        text NOT NULL,
  max_marks   numeric(6,2) NOT NULL DEFAULT 100,
  created_by  uuid REFERENCES public.teachers(id) ON DELETE SET NULL, -- only this teacher may rename the exam
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- One exam template per class per school; names are unique ignoring case.
CREATE UNIQUE INDEX IF NOT EXISTS uq_report_exams_school_class_name
  ON public.report_exams (school_id, lower(class_name), lower(name));

CREATE INDEX IF NOT EXISTS idx_report_exams_school_class
  ON public.report_exams (school_id, lower(class_name));

CREATE TABLE IF NOT EXISTS public.report_exam_marks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id     uuid NOT NULL REFERENCES public.report_exams(id) ON DELETE CASCADE,
  student_id  uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject     text NOT NULL,
  marks       numeric(6,2) NOT NULL,
  remarks     text,
  teacher_id  uuid REFERENCES public.teachers(id) ON DELETE SET NULL, -- who entered it
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (exam_id, student_id, subject)
);

CREATE INDEX IF NOT EXISTS idx_report_exam_marks_exam
  ON public.report_exam_marks (exam_id);
CREATE INDEX IF NOT EXISTS idx_report_exam_marks_student
  ON public.report_exam_marks (student_id);

ALTER TABLE public.report_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_exam_marks ENABLE ROW LEVEL SECURITY;

COMMIT;
