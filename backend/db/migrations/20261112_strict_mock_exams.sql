-- Additive, service-role-only exam controls. Existing tables/policies are unchanged.
create table public.strict_test_settings (
  test_id text primary key,
  enabled boolean not null default false
);

create table public.strict_exam_sessions (
  test_id text not null,
  student_id text not null,
  attempt_id text not null unique,
  school_id text not null,
  teacher_id text not null,
  student_name text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'closed')),
  answers jsonb not null default '{}'::jsonb,
  client_id text not null,
  last_seen timestamptz not null default now(),
  incident_count integer not null default 0,
  last_reason text,
  paused_at timestamptz,
  resumed_at timestamptz,
  finalized_at timestamptz,
  revision integer not null default 0,
  primary key (test_id, student_id)
);
create index strict_exam_teacher_idx on public.strict_exam_sessions (teacher_id, school_id, test_id);
create index strict_exam_student_idx on public.strict_exam_sessions (student_id, status);

alter table public.strict_test_settings enable row level security;
alter table public.strict_exam_sessions enable row level security;
revoke all on public.strict_test_settings, public.strict_exam_sessions from anon, authenticated;
grant all on public.strict_test_settings, public.strict_exam_sessions to service_role;
