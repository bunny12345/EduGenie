-- Approved nullable profile additions; existing rows and RLS policies are unchanged.
begin;
alter table public.schools add column if not exists phone text;
alter table public.teachers add column if not exists date_of_birth date;
alter table public.teachers add column if not exists gender text;
alter table public.students add column if not exists gender text;
alter table public.student_accounts add column if not exists gender text;

-- Owner registration has its own proof store, separate from school-admin proofs.
create table public.school_registration_phone_verifications (
  id text primary key,
  school_id text not null,
  actor_id text not null,
  role text not null check (role = 'school'),
  phone text not null,
  country text not null,
  status text not null default 'pending' check (status in ('pending', 'verified', 'used')),
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts between 0 and 5),
  created_at timestamptz not null default now()
);
create index school_registration_phone_expiry_idx on public.school_registration_phone_verifications (expires_at);
alter table public.school_registration_phone_verifications enable row level security;
revoke all on public.school_registration_phone_verifications from anon, authenticated;
grant all on public.school_registration_phone_verifications to service_role;
commit;
