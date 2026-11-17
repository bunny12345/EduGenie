-- Student mobile push notifications (Firebase Cloud Messaging). New table only:
-- existing tables and RLS policies are unchanged. One row per installed device
-- token; preferences are kept in sync across all of a student's devices.
create table if not exists public.student_push_devices (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  school_id text,
  class_name text,
  token text not null unique,
  platform text not null default 'android' check (platform in ('android', 'ios', 'web')),
  timezone text not null default 'Asia/Kolkata',
  evening_plan boolean not null default true,
  night_recap boolean not null default true,
  test_reminders boolean not null default true,
  school_updates boolean not null default true,
  last_evening_sent_on date,
  last_night_sent_on date,
  last_test_reminder_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists student_push_devices_student_idx on public.student_push_devices (student_id);
create index if not exists student_push_devices_school_idx on public.student_push_devices (school_id, class_name);
alter table public.student_push_devices enable row level security;
revoke all on public.student_push_devices from anon, authenticated;
grant all on public.student_push_devices to service_role;
