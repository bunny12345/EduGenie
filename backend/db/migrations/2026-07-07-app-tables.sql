-- Migration: create all EduGenie app tables
-- Idempotent (uses IF NOT EXISTS). Safe to re-run.
-- Run after init.sql which creates students, messages, memories, homework.

BEGIN;

-- homework_attempts: tracks each student's submission against a homework assignment
CREATE TABLE IF NOT EXISTS public.homework_attempts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  homework_id uuid        REFERENCES public.homework(id) ON DELETE SET NULL,
  attempt_no  int         NOT NULL DEFAULT 1,
  answer_text text,
  score       int,
  feedback    text,
  submitted_at timestamptz DEFAULT now(),
  created_at  timestamptz DEFAULT now()
);

-- progress_metrics: stores aggregated learning metrics per student per subject
CREATE TABLE IF NOT EXISTS public.progress_metrics (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject     text        NOT NULL DEFAULT 'general',
  metric_key  text        NOT NULL,
  metric_value numeric,
  details     jsonb,
  recorded_at timestamptz DEFAULT now(),
  created_at  timestamptz DEFAULT now()
);

-- events: calendar / scheduled study events for a student
CREATE TABLE IF NOT EXISTS public.events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  title       text        NOT NULL,
  description text,
  event_type  text        NOT NULL DEFAULT 'study',  -- study | exam | reminder | holiday
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz,
  all_day     boolean     NOT NULL DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

-- student_rewards: coins / badges awarded to a student
CREATE TABLE IF NOT EXISTS public.student_rewards (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  reward_type text        NOT NULL DEFAULT 'coin',   -- coin | badge | streak
  label       text,
  amount      int         NOT NULL DEFAULT 1,
  reason      text,
  awarded_at  timestamptz DEFAULT now(),
  created_at  timestamptz DEFAULT now()
);

-- redemptions: records when a student redeems coins or rewards
CREATE TABLE IF NOT EXISTS public.redemptions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  reward_id   uuid        REFERENCES public.student_rewards(id) ON DELETE SET NULL,
  amount      int         NOT NULL DEFAULT 1,
  note        text,
  redeemed_at timestamptz DEFAULT now(),
  created_at  timestamptz DEFAULT now()
);

-- settings: per-student app preferences
CREATE TABLE IF NOT EXISTS public.settings (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid        NOT NULL UNIQUE REFERENCES public.students(id) ON DELETE CASCADE,
  ai_persona  text        NOT NULL DEFAULT 'friendly',  -- friendly | strict | story | exam_coach
  language    text        NOT NULL DEFAULT 'en',
  theme       text        NOT NULL DEFAULT 'light',
  tts_enabled boolean     NOT NULL DEFAULT false,
  stt_enabled boolean     NOT NULL DEFAULT false,
  preferences jsonb,
  updated_at  timestamptz DEFAULT now(),
  created_at  timestamptz DEFAULT now()
);

-- test_attempts: quiz / test submissions
CREATE TABLE IF NOT EXISTS public.test_attempts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  test_id     text,
  subject     text,
  score       int,
  max_score   int,
  answers     jsonb,
  started_at  timestamptz,
  submitted_at timestamptz DEFAULT now(),
  created_at  timestamptz DEFAULT now()
);

-- class_members: maps students to teachers / parents (used by RLS role policies)
CREATE TABLE IF NOT EXISTS public.class_members (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id    text,
  student_id  uuid        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  teacher_id  uuid,
  parent_id   uuid,
  created_at  timestamptz DEFAULT now()
);

-- Useful indexes
CREATE INDEX IF NOT EXISTS idx_homework_attempts_student  ON public.homework_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_progress_metrics_student   ON public.progress_metrics(student_id);
CREATE INDEX IF NOT EXISTS idx_events_student_starts      ON public.events(student_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_student_rewards_student    ON public.student_rewards(student_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_student        ON public.redemptions(student_id);
CREATE INDEX IF NOT EXISTS idx_test_attempts_student      ON public.test_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_class_members_student      ON public.class_members(student_id);
CREATE INDEX IF NOT EXISTS idx_class_members_teacher      ON public.class_members(teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_members_parent       ON public.class_members(parent_id);

COMMIT;
