-- Audit query: find public tables not used by current backend runtime code.
-- Run this in Supabase SQL editor.

with keep_tables(table_name) as (
  values
    ('announcements'),
    ('events'),
    ('homework'),
    ('homework_attempts'),
    ('memories'),
    ('messages'),
    ('progress_metrics'),
    ('redemptions'),
    ('registration_invites'),
    ('resources'),
    ('schools'),
    ('settings'),
    ('student_accounts'),
    ('student_rewards'),
    ('students'),
    ('teachers'),
    ('test_attempts'),
    ('test_questions'),
    ('tests')
),
public_tables as (
  select tablename as table_name
  from pg_catalog.pg_tables
  where schemaname = 'public'
)
select
  p.table_name,
  case
    when p.table_name like 'tmp_%'
      or p.table_name like 'temp_%'
      or p.table_name like 'backup_%'
      or p.table_name like 'old_%'
      or p.table_name like '%_old'
      or p.table_name like '%_backup'
    then 'high-confidence cleanup candidate (scratch/backup naming)'
    else 'review manually before drop'
  end as cleanup_hint,
  format('drop table if exists public.%I cascade;', p.table_name) as drop_sql
from public_tables p
left join keep_tables k on k.table_name = p.table_name
where k.table_name is null
order by p.table_name;
