-- Bootstraps the Mock Test feature's real tables. `tests` and `test_questions`
-- were referenced throughout the backend code but never actually created in
-- Postgres — every mock test created so far has only ever lived in the
-- backend's in-memory fallback store (wiped on every restart/redeploy).
-- Also adds the scheduled attempt window (start_at/end_at) on tests, and the
-- finished_at/feedback columns the submit flow writes to on test_attempts
-- (that table exists but was missing them). Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS public.tests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text NOT NULL,
  subject          text NOT NULL DEFAULT 'General',
  class_name       text,
  school_id        uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id       uuid REFERENCES public.teachers(id) ON DELETE SET NULL,
  duration_minutes int NOT NULL DEFAULT 30,
  status           text NOT NULL DEFAULT 'draft', -- draft | assigned | completed
  start_at         timestamptz,
  end_at           timestamptz,
  created_at       timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.test_questions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id        uuid NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  text           text NOT NULL,
  options        jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct_option int,
  marks          int NOT NULL DEFAULT 1,
  created_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.test_attempts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  test_id      text,
  subject      text,
  score        int,
  max_score    int,
  answers      jsonb,
  started_at   timestamptz,
  submitted_at timestamptz DEFAULT now(),
  finished_at  timestamptz,
  feedback     text,
  created_at   timestamptz DEFAULT now()
);

-- Upgrade path, in case any of these already existed with a partial schema.
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS subject text DEFAULT 'General';
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS class_name text;
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS teacher_id uuid REFERENCES public.teachers(id) ON DELETE SET NULL;
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS duration_minutes int DEFAULT 30;
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft';
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS start_at timestamptz;
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS end_at timestamptz;
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE public.test_questions ADD COLUMN IF NOT EXISTS test_id uuid REFERENCES public.tests(id) ON DELETE CASCADE;
ALTER TABLE public.test_questions ADD COLUMN IF NOT EXISTS text text;
ALTER TABLE public.test_questions ADD COLUMN IF NOT EXISTS options jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.test_questions ADD COLUMN IF NOT EXISTS correct_option int;
ALTER TABLE public.test_questions ADD COLUMN IF NOT EXISTS marks int DEFAULT 1;
ALTER TABLE public.test_questions ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE public.test_attempts ADD COLUMN IF NOT EXISTS finished_at timestamptz;
ALTER TABLE public.test_attempts ADD COLUMN IF NOT EXISTS feedback text;
