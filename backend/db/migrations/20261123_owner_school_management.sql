begin;

create table if not exists public.school_profile_email_verifications (
  id uuid primary key,
  school_id uuid not null,
  actor_id text not null,
  email text not null,
  code_hash text not null,
  status text not null default 'sending'
    check (status in ('sending', 'pending', 'verified', 'used', 'failed')),
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts between 0 and 5),
  created_at timestamptz not null default now()
);

create index if not exists school_profile_email_verifications_expiry_idx
  on public.school_profile_email_verifications (expires_at);

alter table public.school_profile_email_verifications enable row level security;
revoke all on public.school_profile_email_verifications from anon, authenticated;
grant all on public.school_profile_email_verifications to service_role;

create table if not exists public.school_asset_registry (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  student_id uuid,
  teacher_id uuid,
  asset_type text not null,
  file_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists school_asset_registry_school_idx
  on public.school_asset_registry (school_id);
create index if not exists school_asset_registry_file_idx
  on public.school_asset_registry (file_url);

alter table public.school_asset_registry enable row level security;
revoke all on public.school_asset_registry from anon, authenticated;
grant all on public.school_asset_registry to service_role;

create or replace function public.owner_delete_school(
  p_school_id uuid,
  p_confirmation text,
  p_student_ids text[] default '{}'::text[],
  p_teacher_ids text[] default '{}'::text[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school record;
  v_student_ids uuid[];
  v_teacher_ids uuid[];
  v_test_ids uuid[];
  v_exam_ids uuid[];
  v_lesson_ids uuid[];
  v_ticket_ids uuid[];
  v_flashcard_deck_ids uuid[];
  v_quiz_deck_ids uuid[];
  v_student_id_text text[];
  v_teacher_id_text text[];
  v_test_id_text text[];
  v_lesson_id_text text[];
  v_exam_id_text text[];
  v_table text;
  v_exists boolean;
  v_deleted jsonb;
begin
  select * into v_school
  from public.schools
  where id = p_school_id
  for update;

  if not found then
    raise exception 'School not found';
  end if;

  if trim(coalesce(p_confirmation, '')) <> ('delete ' || trim(coalesce(v_school.school_name, '')) || ' permanently') then
    raise exception 'Confirmation phrase does not match';
  end if;

  select coalesce(array_agg(id), '{}'::uuid[])
  into v_student_ids
  from public.students
  where school_id = p_school_id;

  if coalesce(array_length(p_student_ids, 1), 0) > 0 then
    select coalesce(array_agg(distinct id), '{}'::uuid[])
    into v_student_ids
    from (
      select id
      from public.students
      where school_id = p_school_id
      union
      select id_text::uuid
      from unnest(p_student_ids) id_text
      where id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and not exists (
          select 1
          from public.students existing
          where existing.id::text = id_text
            and existing.school_id is distinct from p_school_id
        )
    ) ids;
  end if;

  select coalesce(array_agg(id), '{}'::uuid[])
  into v_teacher_ids
  from public.teachers
  where school_id = p_school_id;

  if coalesce(array_length(p_teacher_ids, 1), 0) > 0 then
    select coalesce(array_agg(distinct id), '{}'::uuid[])
    into v_teacher_ids
    from (
      select id
      from public.teachers
      where school_id = p_school_id
      union
      select id_text::uuid
      from unnest(p_teacher_ids) id_text
      where id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and not exists (
          select 1
          from public.teachers existing
          where existing.id::text = id_text
            and existing.school_id is distinct from p_school_id
        )
    ) ids;
  end if;

  if to_regclass('public.tests') is not null then
    select coalesce(array_agg(id), '{}'::uuid[])
    into v_test_ids
    from public.tests
    where school_id = p_school_id;
  end if;

  if to_regclass('public.report_exams') is not null then
    select coalesce(array_agg(id), '{}'::uuid[])
    into v_exam_ids
    from public.report_exams
    where school_id = p_school_id;
  end if;

  if to_regclass('public.support_tickets') is not null then
    select coalesce(array_agg(id), '{}'::uuid[])
    into v_ticket_ids
    from public.support_tickets
    where school_id = p_school_id;
  end if;

  if to_regclass('public.lessons') is not null
     and coalesce(array_length(v_teacher_ids, 1), 0) > 0 then
    select coalesce(array_agg(id), '{}'::uuid[])
    into v_lesson_ids
    from public.lessons
    where teacher_id = any(v_teacher_ids);
  end if;

  if to_regclass('public.flashcard_decks') is not null
     and coalesce(array_length(v_lesson_ids, 1), 0) > 0 then
    select coalesce(array_agg(id), '{}'::uuid[])
    into v_flashcard_deck_ids
    from public.flashcard_decks
    where lesson_id = any(v_lesson_ids);
  end if;

  if to_regclass('public.quiz_decks') is not null
     and coalesce(array_length(v_lesson_ids, 1), 0) > 0 then
    select coalesce(array_agg(id), '{}'::uuid[])
    into v_quiz_deck_ids
    from public.quiz_decks
    where lesson_id = any(v_lesson_ids);
  end if;

  select coalesce(array_agg(id::text), '{}'::text[])
  into v_student_id_text
  from unnest(v_student_ids) id;

  select coalesce(array_agg(id::text), '{}'::text[])
  into v_teacher_id_text
  from unnest(v_teacher_ids) id;

  select coalesce(array_agg(id::text), '{}'::text[])
  into v_test_id_text
  from unnest(v_test_ids) id;

  select coalesce(array_agg(id::text), '{}'::text[])
  into v_lesson_id_text
  from unnest(v_lesson_ids) id;

  select coalesce(array_agg(id::text), '{}'::text[])
  into v_exam_id_text
  from unnest(v_exam_ids) id;

  if to_regclass('public.support_messages') is not null
     and coalesce(array_length(v_ticket_ids, 1), 0) > 0 then
    execute 'delete from public.support_messages where ticket_id = any($1)'
      using v_ticket_ids;
  end if;

  for v_table in select name from unnest(ARRAY[
    'support_tickets',
    'tests',
    'report_exams',
    'strict_exam_sessions',
    'student_push_devices',
    'class_attendance',
    'registration_invites',
    'registration_phone_verifications',
    'registration_email_verifications',
    'school_registration_phone_verifications',
    'school_profile_email_verifications',
    'school_progress_periods',
    'orchard_school_tree_assignments'
  ]::text[]) as name_loop(name) loop

    if to_regclass('public.' || v_table) is not null
       and exists (
         select 1
         from information_schema.columns
         where table_schema = 'public'
           and table_name = v_table
           and column_name = 'school_id'
       ) then
      execute format(
        'delete from public.%I where school_id::text = $1',
        v_table
      ) using p_school_id::text;
    end if;
  end loop;

  for v_table in select name from unnest(ARRAY[
    'orchard_reviews',
    'chapter_growth',
    'orchard_activity',
    'orchard_trees',
    'orchard_profile',
    'student_lesson_progress',
    'lesson_story_progress',
    'messages',
    'conversation_snapshots',
    'memories',
    'homework_attempts',
    'homework',
    'progress_metrics',
    'student_rewards',
    'redemptions',
    'settings',
    'flashcard_progress',
    'flashcard_chapter_completions',
    'game_sessions',
    'events',
    'report_exam_marks',
    'report_exam_celebrations',
    'student_accounts',
    'test_attempts',
    'class_members',
    'strict_exam_sessions',
    'student_push_devices',
    'class_attendance'
  ]::text[]) as name_loop(name) loop

    if to_regclass('public.' || v_table) is not null
       and exists (
         select 1
         from information_schema.columns
         where table_schema = 'public'
           and table_name = v_table
           and column_name = 'student_id'
       ) then
      execute format(
        'delete from public.%I where student_id::text = any($1)',
        v_table
      ) using v_student_id_text;
    end if;
  end loop;

  for v_table in select name from unnest(ARRAY[
    'test_attempts',
    'test_questions',
    'strict_test_settings',
    'strict_exam_sessions'
  ]::text[]) as name_loop(name) loop

    if to_regclass('public.' || v_table) is not null
       and exists (
         select 1
         from information_schema.columns
         where table_schema = 'public'
           and table_name = v_table
           and column_name = 'test_id'
       ) then
      execute format(
        'delete from public.%I where test_id::text = any($1)',
        v_table
      ) using v_test_id_text;
    end if;
  end loop;

  for v_table in select name from unnest(ARRAY[
    'report_exam_marks',
    'report_exam_celebrations'
  ]::text[]) as name_loop(name) loop

    if to_regclass('public.' || v_table) is not null
       and exists (
         select 1
         from information_schema.columns
         where table_schema = 'public'
           and table_name = v_table
           and column_name = 'exam_id'
       ) then
      execute format(
        'delete from public.%I where exam_id::text = any($1)',
        v_table
      ) using v_exam_id_text;
    end if;
  end loop;

  if to_regclass('public.flashcard_progress') is not null
     and coalesce(array_length(v_lesson_ids, 1), 0) > 0 then
    execute 'delete from public.flashcard_progress
             where chapter_id::text = any($1)'
      using v_lesson_id_text;
  end if;

  if coalesce(array_length(v_flashcard_deck_ids, 1), 0) > 0 then
    if to_regclass('public.flashcards') is not null then
      execute 'delete from public.flashcards where deck_id = any($1)'
        using v_flashcard_deck_ids;
    end if;
  end if;

  if coalesce(array_length(v_quiz_deck_ids, 1), 0) > 0 then
    if to_regclass('public.quiz_questions') is not null then
      execute 'delete from public.quiz_questions where deck_id = any($1)'
        using v_quiz_deck_ids;
    end if;
  end if;

  for v_table in select name from unnest(ARRAY[
    'lesson_story_progress',
    'lesson_stories',
    'student_lesson_progress',
    'lesson_chunks',
    'lesson_documents',
    'lesson_class_visibility',
    'flashcard_decks',
    'quiz_decks',
    'lessons'
  ]::text[]) as name_loop(name) loop

    if to_regclass('public.' || v_table) is not null
       and exists (
         select 1
         from information_schema.columns
         where table_schema = 'public'
           and table_name = v_table
           and column_name = 'lesson_id'
       ) then
      execute format(
        'delete from public.%I where lesson_id::text = any($1)',
        v_table
      ) using v_lesson_id_text;
    end if;
  end loop;

  if to_regclass('public.lessons') is not null
     and coalesce(array_length(v_teacher_ids, 1), 0) > 0 then
    execute 'delete from public.lessons where teacher_id = any($1)'
      using v_teacher_ids;
  end if;

  for v_table in select name from unnest(ARRAY[
    'lesson_chunks',
    'lesson_documents',
    'lesson_class_visibility',
    'student_lesson_progress',
    'class_members',
    'strict_exam_sessions',
    'tests'
  ]::text[]) as name_loop(name) loop

    if to_regclass('public.' || v_table) is not null
       and exists (
         select 1
         from information_schema.columns
         where table_schema = 'public'
           and table_name = v_table
           and column_name = 'teacher_id'
       ) then
      execute format(
        'delete from public.%I where teacher_id::text = any($1)',
        v_table
      ) using v_teacher_id_text;
    end if;
  end loop;

  if to_regclass('public.announcements') is not null then
    execute 'delete from public.announcements
             where created_by::text = $1
                or ($2 <> ''{}''::text[] and created_by::text = any($2))'
      using p_school_id::text, v_teacher_id_text;
  end if;

  if to_regclass('public.student_accounts') is not null then
    execute 'delete from public.student_accounts
             where school_id::text = $1
                or ($2 <> ''{}''::text[] and student_id::text = any($2))'
      using p_school_id::text, v_student_id_text;
  end if;

  if to_regclass('public.students') is not null then
    execute 'delete from public.students where school_id::text = $1'
      using p_school_id::text;
  end if;

  if to_regclass('public.teachers') is not null then
    execute 'delete from public.teachers where school_id::text = $1'
      using p_school_id::text;
  end if;

  execute 'delete from public.schools where id = $1'
    using p_school_id;

  if exists (select 1 from public.schools where id = p_school_id) then
    raise exception 'School teardown verification failed';
  end if;
  if exists (select 1 from public.teachers where school_id = p_school_id) then
    raise exception 'Teacher teardown verification failed';
  end if;
  if exists (select 1 from public.students where school_id = p_school_id) then
    raise exception 'Student teardown verification failed';
  end if;
  if to_regclass('public.student_accounts') is not null
     and exists (select 1 from public.student_accounts where school_id = p_school_id) then
    raise exception 'Student account teardown verification failed';
  end if;

  for v_table in select name from unnest(ARRAY[
    'orchard_reviews',
    'chapter_growth',
    'orchard_activity',
    'orchard_trees',
    'orchard_profile',
    'student_lesson_progress',
    'lesson_story_progress',
    'messages',
    'conversation_snapshots',
    'memories',
    'homework_attempts',
    'homework',
    'progress_metrics',
    'student_rewards',
    'redemptions',
    'settings',
    'flashcard_progress',
    'flashcard_chapter_completions',
    'game_sessions',
    'events',
    'report_exam_marks',
    'report_exam_celebrations',
    'test_attempts',
    'class_members'
  ]::text[]) as name_loop(name) loop

    if to_regclass('public.' || v_table) is not null
       and exists (
         select 1
         from information_schema.columns
         where table_schema = 'public'
           and table_name = v_table
           and column_name = 'student_id'
       ) then
      execute format(
        'select exists(select 1 from public.%I where student_id::text = any($1))',
        v_table
      ) into v_exists using v_student_id_text;
      if v_exists then
        raise exception 'Student data teardown verification failed for %', v_table;
      end if;
    end if;
  end loop;

  for v_table in select name from unnest(ARRAY[
    'support_tickets',
    'tests',
    'report_exams',
    'strict_exam_sessions',
    'student_push_devices',
    'class_attendance',
    'registration_invites',
    'registration_phone_verifications',
    'registration_email_verifications',
    'school_registration_phone_verifications',
    'school_profile_email_verifications',
    'school_progress_periods',
    'orchard_school_tree_assignments'
  ]::text[]) as name_loop(name) loop

    if to_regclass('public.' || v_table) is not null
       and exists (
         select 1
         from information_schema.columns
         where table_schema = 'public'
           and table_name = v_table
           and column_name = 'school_id'
       ) then
      execute format(
        'select exists(select 1 from public.%I where school_id::text = $1)',
        v_table
      ) into v_exists using p_school_id::text;
      if v_exists then
        raise exception 'School data teardown verification failed for %', v_table;
      end if;
    end if;
  end loop;

  v_deleted := jsonb_build_object(
    'success', true,
    'schoolId', p_school_id,
    'teachersDeleted', coalesce(array_length(v_teacher_ids, 1), 0),
    'studentsDeleted', coalesce(array_length(v_student_ids, 1), 0),
    'testsDeleted', coalesce(array_length(v_test_ids, 1), 0),
    'examsDeleted', coalesce(array_length(v_exam_ids, 1), 0),
    'deletedAt', now()
  );
  return v_deleted;
end;
$$;

revoke all on function public.owner_delete_school(uuid, text, text[], text[]) from public, anon, authenticated;
grant execute on function public.owner_delete_school(uuid, text, text[], text[]) to service_role;

commit;
