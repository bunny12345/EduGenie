-- Invite management enhancements: revoke and status tracking

alter table if exists registration_invites
  add column if not exists revoked boolean not null default false;

alter table if exists registration_invites
  add column if not exists revoked_at timestamptz;

alter table if exists registration_invites
  add column if not exists revoked_by text;

create index if not exists idx_registration_invites_revoked
  on registration_invites (revoked, created_at desc);
