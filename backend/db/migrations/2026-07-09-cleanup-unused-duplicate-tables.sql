-- Cleanup proposal: remove unused/duplicate app tables from public schema
-- Generated from current backend code references on 2026-07-09.
-- IMPORTANT:
-- 1) Review candidate tables before running.
-- 2) Run in Supabase SQL editor (or psql) in a transaction.
-- 3) Keep a backup/snapshot before destructive changes.

begin;

-- Tables actively referenced by backend code and should be kept:
-- announcements
-- events
-- homework
-- homework_attempts
-- memories
-- messages
-- progress_metrics
-- redemptions
-- registration_invites
-- resources
-- schools
-- settings
-- student_accounts
-- student_rewards
-- students
-- teachers
-- test_attempts
-- test_questions
-- tests

-- --------------------------------------------------------------------------
-- Candidate drop set (currently not referenced by backend runtime code)
-- --------------------------------------------------------------------------

-- Candidate 1: class_members
-- Created early for RLS hierarchy but not used by current controllers/services.
-- Drop only if you are sure no external admin reports/policies still depend on it.
drop table if exists public.class_members cascade;

-- --------------------------------------------------------------------------
-- Optional dynamic cleanup block for prefixed scratch tables
-- --------------------------------------------------------------------------
-- Uncomment only if your project previously created temporary duplicate tables
-- with these prefixes and you want them removed automatically.
--
-- do $$
-- declare
--   rec record;
-- begin
--   for rec in
--     select tablename
--     from pg_catalog.pg_tables
--     where schemaname = 'public'
--       and (
--         tablename like 'tmp_%'
--         or tablename like 'temp_%'
--         or tablename like 'backup_%'
--         or tablename like 'old_%'
--         or tablename like '%_old'
--         or tablename like '%_backup'
--       )
--   loop
--     execute format('drop table if exists public.%I cascade', rec.tablename);
--   end loop;
-- end $$;

commit;
