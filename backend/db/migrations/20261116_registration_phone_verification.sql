-- Teacher phone column approved for manual registration. Existing data and RLS
-- policies are unchanged; old/invite-created teacher accounts may have no phone.
alter table public.teachers add column if not exists phone text;

create table public.registration_phone_verifications (
  id text primary key,
  school_id text not null,
  actor_id text not null,
  role text not null check (role in ('teacher', 'student')),
  phone text not null,
  country text not null,
  status text not null default 'pending' check (status in ('pending', 'verified', 'used')),
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts between 0 and 5),
  created_at timestamptz not null default now()
);
create index registration_phone_expiry_idx on public.registration_phone_verifications (expires_at);
alter table public.registration_phone_verifications enable row level security;
revoke all on public.registration_phone_verifications from anon, authenticated;
grant all on public.registration_phone_verifications to service_role;
