-- Additive storage for email OTPs. Existing tables and policies are unchanged.
create table public.registration_email_verifications (
  id uuid primary key,
  school_id text not null,
  actor_id text not null,
  role text not null check (role in ('teacher', 'student')),
  email text not null,
  code_hash text not null,
  status text not null default 'sending' check (status in ('sending', 'pending', 'verified', 'used', 'failed')),
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts between 0 and 5),
  created_at timestamptz not null default now()
);
create index registration_email_expiry_idx on public.registration_email_verifications (expires_at);
alter table public.registration_email_verifications enable row level security;
revoke all on public.registration_email_verifications from anon, authenticated;
grant all on public.registration_email_verifications to service_role;
