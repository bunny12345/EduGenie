CREATE TABLE IF NOT EXISTS public.class_attendance (
  school_id text NOT NULL,
  class_key text NOT NULL,
  attendance_date date NOT NULL,
  student_id text NOT NULL,
  present boolean NOT NULL,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, class_key, attendance_date, student_id)
);

CREATE INDEX IF NOT EXISTS class_attendance_student_period_idx
  ON public.class_attendance (school_id, student_id, attendance_date);

ALTER TABLE public.class_attendance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.class_attendance FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.class_attendance TO service_role;
