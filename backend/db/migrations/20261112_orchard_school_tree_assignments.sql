begin;

create table public.orchard_school_tree_assignments (
  school_id uuid not null references public.schools(id) on delete cascade,
  subject_key text not null check (subject_key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  tree_type text not null check (tree_type in (
    'oak', 'crystal', 'cherry_blossom', 'banyan', 'digital', 'mango',
    'lemon', 'peach', 'plum', 'coconut'
  )),
  created_at timestamptz not null default now(),
  primary key (school_id, subject_key)
);

alter table public.orchard_school_tree_assignments enable row level security;
revoke all on public.orchard_school_tree_assignments from anon, authenticated;
grant all on public.orchard_school_tree_assignments to service_role;

-- Backend-only: the school comes from the verified student profile. A school
-- lock serializes first assignments across students and server instances.
create function public.orchard_assign_school_trees(p_school_id uuid, p_subject_keys text[])
returns table(subject_key text, tree_type text)
language plpgsql security invoker set search_path = public as $$
declare
  k text;
  preferred text;
  chosen text;
  types text[] := array['lemon', 'peach', 'plum', 'coconut',
    'oak', 'crystal', 'cherry_blossom', 'banyan', 'digital', 'mango'];
begin
  if p_school_id is null or p_subject_keys is null
    or exists (select 1 from unnest(p_subject_keys) s where s is null or s !~ '^[a-z0-9]+(_[a-z0-9]+)*$')
  then raise exception 'Invalid Orchard assignment request'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_school_id::text, 0));
  -- Allocate registered built-ins first, then additional subjects.
  for k in
    select s from (select distinct unnest(p_subject_keys) as s) keys
    order by case s when 'mathematics' then 1 when 'science' then 2
      when 'english' then 3 when 'social' then 4 when 'computer' then 5
      when 'hindi' then 6 else 100 end, s collate "C"
  loop
    if exists (select 1 from public.orchard_school_tree_assignments a
      where a.school_id = p_school_id and a.subject_key = k) then continue; end if;

    preferred := case k when 'mathematics' then 'oak' when 'science' then 'crystal'
      when 'english' then 'cherry_blossom' when 'social' then 'banyan'
      when 'computer' then 'digital' when 'hindi' then 'mango' else null end;
    if preferred is not null and not exists (
      select 1 from public.orchard_school_tree_assignments a
      where a.school_id = p_school_id and a.tree_type = preferred
    ) then chosen := preferred;
    else
      select t into chosen from unnest(types) with ordinality as pool(t, n)
      order by (select count(*) from public.orchard_school_tree_assignments a
        where a.school_id = p_school_id and a.tree_type = t), n limit 1;
    end if;
    insert into public.orchard_school_tree_assignments(school_id, subject_key, tree_type)
    values (p_school_id, k, chosen);
  end loop;
  return query select a.subject_key, a.tree_type from public.orchard_school_tree_assignments a
    where a.school_id = p_school_id and a.subject_key = any(p_subject_keys);
end;
$$;

revoke all on function public.orchard_assign_school_trees(uuid, text[]) from public, anon, authenticated;
grant execute on function public.orchard_assign_school_trees(uuid, text[]) to service_role;

commit;
