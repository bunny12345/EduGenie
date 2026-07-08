-- Migration: School -> Teacher -> Student auth hierarchy tables
-- Idempotent and safe to re-run.

BEGIN;

-- schools: school admin account + institution profile
CREATE TABLE IF NOT EXISTS public.schools (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL,
  school_name    text NOT NULL,
  branch         text NOT NULL,
  location       text NOT NULL,
  password_salt  text NOT NULL,
  password_hash  text NOT NULL,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS school_name text;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS branch text;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS password_salt text;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- teachers: login credentials + school ownership
CREATE TABLE IF NOT EXISTS public.teachers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name           text NOT NULL,
  email          text,
  subject        text,
  login_id       text NOT NULL,
  password_salt  text NOT NULL,
  password_hash  text NOT NULL,
  created_by     text,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS login_id text;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS password_salt text;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- enrich students table for ownership lineage and class_name compatibility
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS teacher_id uuid REFERENCES public.teachers(id) ON DELETE SET NULL;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS class_name text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS created_by text;

-- backfill class_name from existing "class" column if class_name is empty
UPDATE public.students
SET class_name = COALESCE(class_name, class::text)
WHERE class_name IS NULL;

-- student_accounts: credentials tied to student rows
CREATE TABLE IF NOT EXISTS public.student_accounts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  school_id      uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  teacher_id     uuid REFERENCES public.teachers(id) ON DELETE SET NULL,
  login_id       text NOT NULL,
  password_salt  text NOT NULL,
  password_hash  text NOT NULL,
  name           text,
  class_name     text,
  created_by     text,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

ALTER TABLE public.student_accounts ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES public.students(id) ON DELETE CASCADE;
ALTER TABLE public.student_accounts ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE public.student_accounts ADD COLUMN IF NOT EXISTS teacher_id uuid REFERENCES public.teachers(id) ON DELETE SET NULL;
ALTER TABLE public.student_accounts ADD COLUMN IF NOT EXISTS login_id text;
ALTER TABLE public.student_accounts ADD COLUMN IF NOT EXISTS password_salt text;
ALTER TABLE public.student_accounts ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE public.student_accounts ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.student_accounts ADD COLUMN IF NOT EXISTS class_name text;
ALTER TABLE public.student_accounts ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE public.student_accounts ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.student_accounts ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- registration_invites: link-based self-registration for teacher/student
CREATE TABLE IF NOT EXISTS public.registration_invites (
  token          text PRIMARY KEY,
  role           text NOT NULL,
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id     uuid REFERENCES public.teachers(id) ON DELETE CASCADE,
  created_by     text,
  expires_at     timestamptz NOT NULL,
  consumed       boolean NOT NULL DEFAULT false,
  consumed_at    timestamptz,
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE public.registration_invites ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.registration_invites ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.registration_invites ADD COLUMN IF NOT EXISTS teacher_id uuid REFERENCES public.teachers(id) ON DELETE CASCADE;
ALTER TABLE public.registration_invites ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE public.registration_invites ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.registration_invites ADD COLUMN IF NOT EXISTS consumed boolean DEFAULT false;
ALTER TABLE public.registration_invites ADD COLUMN IF NOT EXISTS consumed_at timestamptz;
ALTER TABLE public.registration_invites ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Constraints + indexes
DO $$ BEGIN
  ALTER TABLE public.registration_invites
    ADD CONSTRAINT registration_invites_role_check CHECK (role IN ('teacher','student'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_schools_email_lower
  ON public.schools ((lower(email)));

CREATE UNIQUE INDEX IF NOT EXISTS uq_teachers_login_id_lower
  ON public.teachers ((lower(login_id)));

CREATE UNIQUE INDEX IF NOT EXISTS uq_teachers_email_per_school_lower
  ON public.teachers (school_id, lower(email));

CREATE UNIQUE INDEX IF NOT EXISTS uq_student_accounts_login_id_lower
  ON public.student_accounts ((lower(login_id)));

CREATE INDEX IF NOT EXISTS idx_teachers_school_id
  ON public.teachers (school_id);

CREATE INDEX IF NOT EXISTS idx_students_school_id
  ON public.students (school_id);

CREATE INDEX IF NOT EXISTS idx_students_teacher_id
  ON public.students (teacher_id);

CREATE INDEX IF NOT EXISTS idx_student_accounts_student_id
  ON public.student_accounts (student_id);

CREATE INDEX IF NOT EXISTS idx_student_accounts_school_id
  ON public.student_accounts (school_id);

CREATE INDEX IF NOT EXISTS idx_student_accounts_teacher_id
  ON public.student_accounts (teacher_id);

CREATE INDEX IF NOT EXISTS idx_registration_invites_school_role
  ON public.registration_invites (school_id, role);

CREATE INDEX IF NOT EXISTS idx_registration_invites_teacher
  ON public.registration_invites (teacher_id);

CREATE INDEX IF NOT EXISTS idx_registration_invites_expires
  ON public.registration_invites (expires_at);

COMMIT;
