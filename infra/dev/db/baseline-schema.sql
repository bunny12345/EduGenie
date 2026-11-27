--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- (public exists)


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: orchard_assign_school_trees(uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.orchard_assign_school_trees(p_school_id uuid, p_subject_keys text[]) RETURNS TABLE(subject_key text, tree_type text)
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $_$
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
$_$;


--
-- Name: owner_delete_school(uuid, text, text[], text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.owner_delete_school(p_school_id uuid, p_confirmation text, p_student_ids text[] DEFAULT '{}'::text[], p_teacher_ids text[] DEFAULT '{}'::text[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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
$_$;


--
-- Name: school_enquiry_append(uuid, text, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.school_enquiry_append(p_enquiry_id uuid, p_session_hash text, p_message_id uuid, p_author_role text, p_content text) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  enquiry public.school_enquiries;
  existing public.school_enquiry_messages;
begin
  select * into enquiry from public.school_enquiries where id = p_enquiry_id for update;
  if not found then raise exception 'Enquiry not found'; end if;
  if p_author_role is null or p_author_role not in ('visitor', 'owner') then raise exception 'Invalid author'; end if;
  if p_author_role = 'visitor' and (enquiry.session_hash is distinct from p_session_hash or enquiry.session_expires_at <= now()) then
    raise exception 'Enquiry access denied';
  end if;
  select * into existing from public.school_enquiry_messages where id = p_message_id;
  if found then
    if existing.enquiry_id <> p_enquiry_id or existing.author_role <> p_author_role or existing.content is distinct from p_content then
      raise exception 'Message identity mismatch';
    end if;
    return p_message_id;
  end if;
  insert into public.school_enquiry_messages(id, enquiry_id, author_role, content)
  values (p_message_id, p_enquiry_id, p_author_role, p_content);
  update public.school_enquiries set updated_at = now(), status = 'open' where id = p_enquiry_id;
  return p_message_id;
end;
$$;


--
-- Name: school_enquiry_verify(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.school_enquiry_verify(p_challenge_id uuid, p_code_hash text, p_session_hash text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  challenge public.school_enquiry_challenges;
  enquiry_id uuid := gen_random_uuid();
begin
  select * into challenge from public.school_enquiry_challenges where id = p_challenge_id for update;
  if not found or challenge.consumed or challenge.expires_at <= now() or challenge.attempts >= 5 then
    return jsonb_build_object('verified', false);
  end if;
  update public.school_enquiry_challenges set attempts = attempts + 1 where id = p_challenge_id;
  if challenge.code_hash is distinct from p_code_hash then return jsonb_build_object('verified', false); end if;
  insert into public.school_enquiries(id, email, name, school_name, session_hash, session_expires_at, whatsapp_number)
  values (enquiry_id, challenge.email, challenge.name, challenge.school_name, p_session_hash,
    now() + interval '30 days', challenge.whatsapp_number);
  insert into public.school_enquiry_messages(id, enquiry_id, author_role, content)
  values (gen_random_uuid(), enquiry_id, 'visitor', challenge.message);
  update public.school_enquiry_challenges set consumed = true where id = p_challenge_id;
  return jsonb_build_object('verified', true, 'id', enquiry_id);
end;
$$;


--
-- Name: support_append_message(uuid, uuid, uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.support_append_message(p_ticket_id uuid, p_requester_id uuid, p_school_id uuid, p_message_id uuid, p_author_role text, p_content text) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  ticket public.support_tickets;
  existing public.support_messages;
begin
  select * into ticket from public.support_tickets where id = p_ticket_id for update;
  if not found then raise exception 'Ticket not found'; end if;
  if p_author_role is null or p_author_role not in ('student', 'teacher', 'school_admin', 'owner') then
    raise exception 'Invalid author';
  end if;
  if p_author_role <> 'owner' and
    (ticket.requester_id is distinct from p_requester_id
      or ticket.school_id is distinct from p_school_id
      or ticket.requester_role is distinct from p_author_role) then
    raise exception 'Ticket ownership mismatch';
  end if;
  select * into existing from public.support_messages where id = p_message_id;
  if found then
    if existing.ticket_id <> p_ticket_id or existing.author_role <> p_author_role then
      raise exception 'Message ownership mismatch';
    end if;
    return p_message_id;
  end if;
  insert into public.support_messages(id, ticket_id, author_role, content)
  values (p_message_id, ticket.id, p_author_role, p_content);
  update public.support_tickets set updated_at = now(), status = 'open' where id = p_ticket_id;
  return p_message_id;
end;
$$;


--
-- Name: support_create_ticket(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.support_create_ticket(p_ticket jsonb, p_messages jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  ticket_id uuid := (p_ticket->>'id')::uuid;
  existing public.support_tickets;
begin
  if p_ticket->>'requester_role' is null or p_ticket->>'requester_role' not in ('student', 'teacher', 'school_admin') then
    raise exception 'Invalid requester role';
  end if;
  if p_ticket->>'requester_role' = 'school_admin'
    and p_ticket->>'requester_id' is distinct from p_ticket->>'school_id' then
    raise exception 'School ownership mismatch';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_messages) m
    where m->>'author_role' is distinct from p_ticket->>'requester_role'
  ) then raise exception 'Invalid message author'; end if;
  insert into public.support_tickets(id, requester_id, requester_role, school_id, requester_name, class_name, category, subject)
  values (ticket_id, (p_ticket->>'requester_id')::uuid, p_ticket->>'requester_role',
    (p_ticket->>'school_id')::uuid, p_ticket->>'requester_name', p_ticket->>'class_name',
    p_ticket->>'category', p_ticket->>'subject')
  on conflict (id) do nothing;
  if not found then
    select * into existing from public.support_tickets where id = ticket_id;
    if existing.requester_id::text is distinct from p_ticket->>'requester_id'
      or existing.school_id::text is distinct from p_ticket->>'school_id'
      or existing.requester_role is distinct from p_ticket->>'requester_role' then
      raise exception 'Ticket ownership mismatch';
    end if;
    return ticket_id;
  end if;
  insert into public.support_messages(id, ticket_id, author_role, content, created_at)
  select (m->>'id')::uuid, ticket_id, m->>'author_role', m->>'content',
    now() + (ordinality * interval '1 microsecond')
  from jsonb_array_elements(p_messages) with ordinality as messages(m, ordinality);
  return ticket_id;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text DEFAULT 'Announcement'::text NOT NULL,
    message text DEFAULT ''::text NOT NULL,
    audience text DEFAULT 'students'::text NOT NULL,
    target_class text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    start_at timestamp with time zone,
    end_at timestamp with time zone
);


--
-- Name: COLUMN announcements.start_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.announcements.start_at IS 'Optional — announcement is hidden from students until this time.';


--
-- Name: COLUMN announcements.end_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.announcements.end_at IS 'Optional — announcement is hidden from students after this time.';


--
-- Name: chapter_growth; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chapter_growth (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    chapter_id uuid NOT NULL,
    subject_key text NOT NULL,
    stage text DEFAULT 'seed'::text NOT NULL,
    stage_index integer DEFAULT 0 NOT NULL,
    roots_pct integer DEFAULT 0 NOT NULL,
    milestones jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_golden boolean DEFAULT false NOT NULL,
    fruit_collected boolean DEFAULT false NOT NULL,
    started_at timestamp with time zone,
    stage_updated_at timestamp with time zone DEFAULT now(),
    fruit_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: class_attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_attendance (
    school_id text NOT NULL,
    class_key text NOT NULL,
    attendance_date date NOT NULL,
    student_id text NOT NULL,
    present boolean NOT NULL,
    updated_by text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: class_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id text,
    student_id uuid NOT NULL,
    teacher_id uuid,
    parent_id uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: conversation_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    conversation_id text NOT NULL,
    snapshot jsonb NOT NULL,
    turn_count integer DEFAULT 0,
    last_message_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    event jsonb,
    created_at timestamp with time zone DEFAULT now(),
    title text DEFAULT 'Untitled event'::text,
    description text,
    event_type text DEFAULT 'study'::text,
    starts_at timestamp with time zone DEFAULT now(),
    ends_at timestamp with time zone,
    all_day boolean DEFAULT false
);


--
-- Name: flashcard_chapter_completions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flashcard_chapter_completions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    deck_id uuid NOT NULL,
    subject_key text,
    chapter_title text,
    coins_awarded integer DEFAULT 0 NOT NULL,
    times_completed integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: flashcard_decks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flashcard_decks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deck_key text NOT NULL,
    subject_key text NOT NULL,
    class_name text,
    board text,
    chapter_id uuid,
    lesson_id uuid,
    chapter_number integer DEFAULT 1 NOT NULL,
    chapter_title text NOT NULL,
    source text DEFAULT 'ai'::text NOT NULL,
    card_count integer DEFAULT 0 NOT NULL,
    generated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: flashcard_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flashcard_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    flashcard_id uuid NOT NULL,
    deck_id uuid,
    subject_key text NOT NULL,
    chapter_id uuid,
    box integer DEFAULT 0 NOT NULL,
    interval_days integer DEFAULT 0 NOT NULL,
    ease integer DEFAULT 250 NOT NULL,
    due_at timestamp with time zone DEFAULT now() NOT NULL,
    last_reviewed_at timestamp with time zone,
    review_count integer DEFAULT 0 NOT NULL,
    correct_count integer DEFAULT 0 NOT NULL,
    streak integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: flashcards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flashcards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deck_id uuid NOT NULL,
    subject_key text NOT NULL,
    class_name text,
    chapter_id uuid,
    chapter_number integer DEFAULT 1 NOT NULL,
    chapter_title text NOT NULL,
    front text NOT NULL,
    back text NOT NULL,
    hint text,
    difficulty text DEFAULT 'medium'::text NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    source text DEFAULT 'ai'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: game_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.game_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    game_key text NOT NULL,
    subject_key text,
    chapter_id uuid,
    chapter_scope text DEFAULT 'all'::text NOT NULL,
    score integer DEFAULT 0 NOT NULL,
    total integer DEFAULT 0 NOT NULL,
    duration_ms integer,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    started_at timestamp with time zone DEFAULT now(),
    ended_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: homework; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.homework (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid,
    file_url text,
    ocr_text text,
    graded boolean DEFAULT false,
    score integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: homework_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.homework_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    homework_id uuid,
    attempt_data jsonb,
    created_at timestamp with time zone DEFAULT now(),
    attempt_no integer DEFAULT 1,
    answer_text text,
    score integer,
    feedback text,
    submitted_at timestamp with time zone DEFAULT now()
);


--
-- Name: lesson_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lesson_chunks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    lesson_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    chunk_text text NOT NULL,
    chunk_index integer,
    page_number integer,
    embedding public.vector(384),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: lesson_class_visibility; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lesson_class_visibility (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lesson_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    class_name text NOT NULL,
    is_visible boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: lesson_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lesson_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lesson_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    file_name text NOT NULL,
    file_url text NOT NULL,
    file_size_bytes integer,
    mime_type text DEFAULT 'application/pdf'::text,
    extraction_status text DEFAULT 'pending'::text,
    error_message text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: lesson_stories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lesson_stories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lesson_id uuid NOT NULL,
    subject_key text,
    chapter_title text,
    title text NOT NULL,
    story text NOT NULL,
    source text DEFAULT 'ai'::text NOT NULL,
    generated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: lesson_story_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lesson_story_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id text NOT NULL,
    lesson_id uuid NOT NULL,
    completed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: lessons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lessons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    teacher_id uuid NOT NULL,
    subject text NOT NULL,
    title text NOT NULL,
    description text,
    class_name text,
    order_index integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: memories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid,
    key text,
    value text,
    created_at timestamp with time zone DEFAULT now(),
    embedding_old public.vector(1536),
    embedding public.vector(1536)
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid,
    role text,
    message text,
    created_at timestamp with time zone DEFAULT now(),
    embedding public.vector(8),
    conversation_id text,
    message_metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: orchard_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orchard_activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    subject_key text NOT NULL,
    chapter_id uuid,
    activity_type text NOT NULL,
    water integer DEFAULT 0 NOT NULL,
    sunlight integer DEFAULT 0 NOT NULL,
    fertilizer integer DEFAULT 0 NOT NULL,
    correct boolean,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: orchard_chapters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orchard_chapters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject_key text NOT NULL,
    class_name text,
    board text,
    chapter_number integer DEFAULT 1 NOT NULL,
    title text NOT NULL,
    lesson_id uuid,
    order_index integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: orchard_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orchard_profile (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    water_drops integer DEFAULT 0 NOT NULL,
    sunshine integer DEFAULT 0 NOT NULL,
    gems integer DEFAULT 0 NOT NULL,
    companion_level integer DEFAULT 1 NOT NULL,
    companion_xp integer DEFAULT 0 NOT NULL,
    companion_xp_max integer DEFAULT 1200 NOT NULL,
    day_streak integer DEFAULT 0 NOT NULL,
    last_active_date date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: orchard_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orchard_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    chapter_id uuid NOT NULL,
    subject_key text NOT NULL,
    review_type text DEFAULT 'day'::text NOT NULL,
    scheduled_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone,
    passed boolean,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: orchard_school_tree_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orchard_school_tree_assignments (
    school_id uuid NOT NULL,
    subject_key text NOT NULL,
    tree_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT orchard_school_tree_assignments_subject_key_check CHECK ((subject_key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'::text)),
    CONSTRAINT orchard_school_tree_assignments_tree_type_check CHECK ((tree_type = ANY (ARRAY['oak'::text, 'crystal'::text, 'cherry_blossom'::text, 'banyan'::text, 'digital'::text, 'mango'::text, 'lemon'::text, 'peach'::text, 'plum'::text, 'coconut'::text])))
);


--
-- Name: orchard_subjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orchard_subjects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject_key text NOT NULL,
    display_name text NOT NULL,
    tree_type text NOT NULL,
    fruit_type text NOT NULL,
    fruit_emoji text DEFAULT '🍎'::text NOT NULL,
    tree_emoji text DEFAULT '🌳'::text NOT NULL,
    accent_color text DEFAULT '#22c55e'::text NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: orchard_trees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orchard_trees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    subject_key text NOT NULL,
    stage text DEFAULT 'seed'::text NOT NULL,
    level integer DEFAULT 1 NOT NULL,
    max_level integer DEFAULT 7 NOT NULL,
    total_chapters integer DEFAULT 0 NOT NULL,
    completed_chapters integer DEFAULT 0 NOT NULL,
    progress_pct integer DEFAULT 0 NOT NULL,
    roots_pct integer DEFAULT 0 NOT NULL,
    water_pct integer DEFAULT 0 NOT NULL,
    sunlight_pct integer DEFAULT 0 NOT NULL,
    fertilizer_pct integer DEFAULT 0 NOT NULL,
    health text DEFAULT 'healthy'::text NOT NULL,
    season text DEFAULT 'spring'::text NOT NULL,
    next_chapter_id uuid,
    last_activity_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: progress_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.progress_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    metric jsonb,
    created_at timestamp with time zone DEFAULT now(),
    subject text DEFAULT 'general'::text,
    metric_key text,
    metric_value numeric,
    details jsonb,
    recorded_at timestamp with time zone DEFAULT now()
);


--
-- Name: quiz_decks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quiz_decks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deck_key text NOT NULL,
    subject_key text NOT NULL,
    class_name text,
    chapter_id uuid,
    lesson_id uuid,
    chapter_number integer DEFAULT 1 NOT NULL,
    chapter_title text NOT NULL,
    source text DEFAULT 'ai'::text NOT NULL,
    question_count integer DEFAULT 0 NOT NULL,
    generated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: quiz_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quiz_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deck_id uuid NOT NULL,
    subject_key text NOT NULL,
    class_name text,
    chapter_id uuid,
    chapter_title text NOT NULL,
    question text NOT NULL,
    options jsonb NOT NULL,
    correct_index integer DEFAULT 0 NOT NULL,
    explanation text,
    difficulty text DEFAULT 'medium'::text NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    source text DEFAULT 'ai'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: redemptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.redemptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    redemption jsonb,
    created_at timestamp with time zone DEFAULT now(),
    reward_id uuid,
    amount integer DEFAULT 1,
    note text,
    redeemed_at timestamp with time zone DEFAULT now()
);


--
-- Name: registration_email_verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.registration_email_verifications (
    id uuid NOT NULL,
    school_id text NOT NULL,
    actor_id text NOT NULL,
    role text NOT NULL,
    email text NOT NULL,
    code_hash text NOT NULL,
    status text DEFAULT 'sending'::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT registration_email_verifications_attempts_check CHECK (((attempts >= 0) AND (attempts <= 5))),
    CONSTRAINT registration_email_verifications_role_check CHECK ((role = ANY (ARRAY['teacher'::text, 'student'::text]))),
    CONSTRAINT registration_email_verifications_status_check CHECK ((status = ANY (ARRAY['sending'::text, 'pending'::text, 'verified'::text, 'used'::text, 'failed'::text])))
);


--
-- Name: registration_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.registration_invites (
    token text NOT NULL,
    role text NOT NULL,
    school_id uuid NOT NULL,
    teacher_id uuid,
    created_by text,
    expires_at timestamp with time zone NOT NULL,
    consumed boolean DEFAULT false NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    revoked boolean DEFAULT false NOT NULL,
    revoked_at timestamp with time zone,
    revoked_by text,
    CONSTRAINT registration_invites_role_check CHECK ((role = ANY (ARRAY['teacher'::text, 'student'::text])))
);


--
-- Name: registration_phone_verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.registration_phone_verifications (
    id text NOT NULL,
    school_id text NOT NULL,
    actor_id text NOT NULL,
    role text NOT NULL,
    phone text NOT NULL,
    country text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT registration_phone_verifications_attempts_check CHECK (((attempts >= 0) AND (attempts <= 5))),
    CONSTRAINT registration_phone_verifications_role_check CHECK ((role = ANY (ARRAY['teacher'::text, 'student'::text]))),
    CONSTRAINT registration_phone_verifications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'verified'::text, 'used'::text])))
);


--
-- Name: report_exam_celebrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_exam_celebrations (
    exam_id uuid NOT NULL,
    student_id uuid NOT NULL,
    celebrated_at timestamp with time zone DEFAULT now()
);


--
-- Name: report_exam_marks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_exam_marks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    exam_id uuid NOT NULL,
    student_id uuid NOT NULL,
    subject text NOT NULL,
    marks numeric(6,2) NOT NULL,
    remarks text,
    teacher_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: report_exams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_exams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid,
    class_name text NOT NULL,
    name text NOT NULL,
    max_marks numeric(6,2) DEFAULT 100 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: rewards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rewards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    reward jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: school_asset_registry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.school_asset_registry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    student_id uuid,
    teacher_id uuid,
    asset_type text NOT NULL,
    file_url text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: school_enquiries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.school_enquiries (
    id uuid NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    school_name text NOT NULL,
    session_hash text NOT NULL,
    session_expires_at timestamp with time zone NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    whatsapp_number text,
    CONSTRAINT school_enquiries_session_hash_check CHECK ((session_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT school_enquiries_status_check CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text]))),
    CONSTRAINT school_enquiries_whatsapp_number_check CHECK ((whatsapp_number ~ '^\+[1-9][0-9]{7,14}$'::text))
);


--
-- Name: school_enquiry_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.school_enquiry_challenges (
    id uuid NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    school_name text NOT NULL,
    message text NOT NULL,
    code_hash text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    whatsapp_number text,
    CONSTRAINT school_enquiry_challenges_code_hash_check CHECK ((code_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT school_enquiry_challenges_message_check CHECK (((char_length(message) >= 1) AND (char_length(message) <= 4000))),
    CONSTRAINT school_enquiry_challenges_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100))),
    CONSTRAINT school_enquiry_challenges_school_name_check CHECK (((char_length(school_name) >= 1) AND (char_length(school_name) <= 160))),
    CONSTRAINT school_enquiry_challenges_whatsapp_number_check CHECK ((whatsapp_number ~ '^\+[1-9][0-9]{7,14}$'::text))
);


--
-- Name: school_enquiry_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.school_enquiry_messages (
    id uuid NOT NULL,
    enquiry_id uuid NOT NULL,
    author_role text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT school_enquiry_messages_author_role_check CHECK ((author_role = ANY (ARRAY['visitor'::text, 'owner'::text]))),
    CONSTRAINT school_enquiry_messages_content_check CHECK (((char_length(content) >= 1) AND (char_length(content) <= 4000)))
);


--
-- Name: school_profile_email_verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.school_profile_email_verifications (
    id uuid NOT NULL,
    school_id uuid NOT NULL,
    actor_id text NOT NULL,
    email text NOT NULL,
    code_hash text NOT NULL,
    status text DEFAULT 'sending'::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT school_profile_email_verifications_attempts_check CHECK (((attempts >= 0) AND (attempts <= 5))),
    CONSTRAINT school_profile_email_verifications_status_check CHECK ((status = ANY (ARRAY['sending'::text, 'pending'::text, 'verified'::text, 'used'::text, 'failed'::text])))
);


--
-- Name: school_progress_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.school_progress_periods (
    school_id uuid NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT school_progress_period_length CHECK ((((((EXTRACT(year FROM end_date) - EXTRACT(year FROM start_date)) * (12)::numeric) + EXTRACT(month FROM end_date)) - EXTRACT(month FROM start_date)) < (24)::numeric)),
    CONSTRAINT school_progress_period_order CHECK ((end_date >= start_date))
);


--
-- Name: school_registration_phone_verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.school_registration_phone_verifications (
    id text NOT NULL,
    school_id text NOT NULL,
    actor_id text NOT NULL,
    role text NOT NULL,
    phone text NOT NULL,
    country text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT school_registration_phone_verifications_attempts_check CHECK (((attempts >= 0) AND (attempts <= 5))),
    CONSTRAINT school_registration_phone_verifications_role_check CHECK ((role = 'school'::text)),
    CONSTRAINT school_registration_phone_verifications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'verified'::text, 'used'::text])))
);


--
-- Name: schools; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schools (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    school_name text NOT NULL,
    branch text NOT NULL,
    location text NOT NULL,
    password_salt text NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    phone text
);

ALTER TABLE ONLY public.schools FORCE ROW LEVEL SECURITY;


--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    settings jsonb,
    created_at timestamp with time zone DEFAULT now(),
    ai_persona text DEFAULT 'friendly'::text,
    language text DEFAULT 'en'::text,
    theme text DEFAULT 'light'::text,
    tts_enabled boolean DEFAULT false,
    stt_enabled boolean DEFAULT false,
    preferences jsonb,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: strict_exam_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.strict_exam_sessions (
    test_id text NOT NULL,
    student_id text NOT NULL,
    attempt_id text NOT NULL,
    school_id text NOT NULL,
    teacher_id text NOT NULL,
    student_name text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    answers jsonb DEFAULT '{}'::jsonb NOT NULL,
    client_id text NOT NULL,
    last_seen timestamp with time zone DEFAULT now() NOT NULL,
    incident_count integer DEFAULT 0 NOT NULL,
    last_reason text,
    paused_at timestamp with time zone,
    resumed_at timestamp with time zone,
    finalized_at timestamp with time zone,
    revision integer DEFAULT 0 NOT NULL,
    CONSTRAINT strict_exam_sessions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'closed'::text])))
);


--
-- Name: strict_test_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.strict_test_settings (
    test_id text NOT NULL,
    enabled boolean DEFAULT false NOT NULL
);


--
-- Name: student_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    school_id uuid,
    teacher_id uuid,
    login_id text NOT NULL,
    password_salt text NOT NULL,
    password_hash text NOT NULL,
    name text,
    class_name text,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    date_of_birth date,
    phone text,
    email text,
    gender text
);

ALTER TABLE ONLY public.student_accounts FORCE ROW LEVEL SECURITY;


--
-- Name: student_lesson_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_lesson_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    lesson_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    status text DEFAULT 'not_started'::text,
    messages_count integer DEFAULT 0,
    first_message_at timestamp with time zone,
    last_message_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    overall_confidence text DEFAULT 'building'::text,
    mastery_summary text,
    next_recommended_subtopic text,
    strengths jsonb DEFAULT '[]'::jsonb NOT NULL,
    needs_support jsonb DEFAULT '[]'::jsonb NOT NULL,
    subtopics jsonb DEFAULT '[]'::jsonb NOT NULL,
    source_conversation_id text,
    last_mastery_update_at timestamp with time zone
);


--
-- Name: student_push_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_push_devices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id text NOT NULL,
    school_id text,
    class_name text,
    token text NOT NULL,
    platform text DEFAULT 'android'::text NOT NULL,
    timezone text DEFAULT 'Asia/Kolkata'::text NOT NULL,
    evening_plan boolean DEFAULT true NOT NULL,
    night_recap boolean DEFAULT true NOT NULL,
    test_reminders boolean DEFAULT true NOT NULL,
    school_updates boolean DEFAULT true NOT NULL,
    last_evening_sent_on date,
    last_night_sent_on date,
    last_test_reminder_on date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT student_push_devices_platform_check CHECK ((platform = ANY (ARRAY['android'::text, 'ios'::text, 'web'::text])))
);


--
-- Name: student_rewards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_rewards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    reward jsonb,
    created_at timestamp with time zone DEFAULT now(),
    reward_type text DEFAULT 'coin'::text,
    label text,
    amount integer DEFAULT 1,
    reason text,
    awarded_at timestamp with time zone DEFAULT now()
);


--
-- Name: students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.students (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text,
    age integer,
    class text,
    board text,
    created_at timestamp with time zone DEFAULT now(),
    school_id uuid,
    teacher_id uuid,
    class_name text,
    created_by text,
    date_of_birth date,
    phone text,
    email text,
    gender text
);

ALTER TABLE ONLY public.students FORCE ROW LEVEL SECURITY;


--
-- Name: support_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_messages (
    id uuid NOT NULL,
    ticket_id uuid NOT NULL,
    author_role text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT support_messages_author_role_check CHECK ((author_role = ANY (ARRAY['student'::text, 'teacher'::text, 'school_admin'::text, 'bot'::text, 'owner'::text]))),
    CONSTRAINT support_messages_content_check CHECK (((char_length(content) >= 1) AND (char_length(content) <= 4000)))
);


--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_tickets (
    id uuid NOT NULL,
    requester_id uuid NOT NULL,
    requester_role text NOT NULL,
    school_id uuid NOT NULL,
    requester_name text NOT NULL,
    class_name text DEFAULT ''::text NOT NULL,
    category text NOT NULL,
    subject text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT support_tickets_category_check CHECK ((category = ANY (ARRAY['glitch'::text, 'technician'::text]))),
    CONSTRAINT support_tickets_requester_role_check CHECK ((requester_role = ANY (ARRAY['student'::text, 'teacher'::text, 'school_admin'::text]))),
    CONSTRAINT support_tickets_status_check CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text]))),
    CONSTRAINT support_tickets_subject_check CHECK (((char_length(subject) >= 1) AND (char_length(subject) <= 120)))
);


--
-- Name: teachers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teachers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    name text NOT NULL,
    email text,
    subject text,
    login_id text NOT NULL,
    password_salt text NOT NULL,
    password_hash text NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    grades text[] DEFAULT '{}'::text[] NOT NULL,
    phone text,
    date_of_birth date,
    gender text
);

ALTER TABLE ONLY public.teachers FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN teachers.grades; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.teachers.grades IS 'Canonical class names this teacher handles, e.g. {"Class 5","Class 9"}. Used to scope the students a teacher can view.';


--
-- Name: test_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    test_data jsonb,
    created_at timestamp with time zone DEFAULT now(),
    test_id text,
    subject text,
    score integer,
    max_score integer,
    answers jsonb,
    started_at timestamp with time zone,
    submitted_at timestamp with time zone DEFAULT now(),
    finished_at timestamp with time zone,
    feedback text
);


--
-- Name: test_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    test_id uuid NOT NULL,
    text text NOT NULL,
    options jsonb DEFAULT '[]'::jsonb NOT NULL,
    correct_option integer,
    marks integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: tests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    subject text DEFAULT 'General'::text NOT NULL,
    class_name text,
    school_id uuid,
    teacher_id uuid,
    duration_minutes integer DEFAULT 30 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    start_at timestamp with time zone,
    end_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);


--
-- Name: chapter_growth chapter_growth_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chapter_growth
    ADD CONSTRAINT chapter_growth_pkey PRIMARY KEY (id);


--
-- Name: chapter_growth chapter_growth_student_id_chapter_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chapter_growth
    ADD CONSTRAINT chapter_growth_student_id_chapter_id_key UNIQUE (student_id, chapter_id);


--
-- Name: class_attendance class_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_attendance
    ADD CONSTRAINT class_attendance_pkey PRIMARY KEY (school_id, class_key, attendance_date, student_id);


--
-- Name: class_members class_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_members
    ADD CONSTRAINT class_members_pkey PRIMARY KEY (id);


--
-- Name: conversation_snapshots conversation_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_snapshots
    ADD CONSTRAINT conversation_snapshots_pkey PRIMARY KEY (id);


--
-- Name: conversation_snapshots conversation_snapshots_student_id_conversation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_snapshots
    ADD CONSTRAINT conversation_snapshots_student_id_conversation_id_key UNIQUE (student_id, conversation_id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: flashcard_chapter_completions flashcard_chapter_completions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flashcard_chapter_completions
    ADD CONSTRAINT flashcard_chapter_completions_pkey PRIMARY KEY (id);


--
-- Name: flashcard_chapter_completions flashcard_chapter_completions_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flashcard_chapter_completions
    ADD CONSTRAINT flashcard_chapter_completions_uniq UNIQUE (student_id, deck_id);


--
-- Name: flashcard_decks flashcard_decks_deck_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flashcard_decks
    ADD CONSTRAINT flashcard_decks_deck_key_key UNIQUE (deck_key);


--
-- Name: flashcard_decks flashcard_decks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flashcard_decks
    ADD CONSTRAINT flashcard_decks_pkey PRIMARY KEY (id);


--
-- Name: flashcard_progress flashcard_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flashcard_progress
    ADD CONSTRAINT flashcard_progress_pkey PRIMARY KEY (id);


--
-- Name: flashcard_progress flashcard_progress_student_id_flashcard_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flashcard_progress
    ADD CONSTRAINT flashcard_progress_student_id_flashcard_id_key UNIQUE (student_id, flashcard_id);


--
-- Name: flashcards flashcards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flashcards
    ADD CONSTRAINT flashcards_pkey PRIMARY KEY (id);


--
-- Name: game_sessions game_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_sessions
    ADD CONSTRAINT game_sessions_pkey PRIMARY KEY (id);


--
-- Name: homework_attempts homework_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.homework_attempts
    ADD CONSTRAINT homework_attempts_pkey PRIMARY KEY (id);


--
-- Name: homework homework_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.homework
    ADD CONSTRAINT homework_pkey PRIMARY KEY (id);


--
-- Name: lesson_chunks lesson_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_chunks
    ADD CONSTRAINT lesson_chunks_pkey PRIMARY KEY (id);


--
-- Name: lesson_class_visibility lesson_class_visibility_lesson_id_class_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_class_visibility
    ADD CONSTRAINT lesson_class_visibility_lesson_id_class_name_key UNIQUE (lesson_id, class_name);


--
-- Name: lesson_class_visibility lesson_class_visibility_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_class_visibility
    ADD CONSTRAINT lesson_class_visibility_pkey PRIMARY KEY (id);


--
-- Name: lesson_documents lesson_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_documents
    ADD CONSTRAINT lesson_documents_pkey PRIMARY KEY (id);


--
-- Name: lesson_stories lesson_stories_lesson_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_stories
    ADD CONSTRAINT lesson_stories_lesson_id_key UNIQUE (lesson_id);


--
-- Name: lesson_stories lesson_stories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_stories
    ADD CONSTRAINT lesson_stories_pkey PRIMARY KEY (id);


--
-- Name: lesson_story_progress lesson_story_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_story_progress
    ADD CONSTRAINT lesson_story_progress_pkey PRIMARY KEY (id);


--
-- Name: lesson_story_progress lesson_story_progress_student_id_lesson_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_story_progress
    ADD CONSTRAINT lesson_story_progress_student_id_lesson_id_key UNIQUE (student_id, lesson_id);


--
-- Name: lessons lessons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_pkey PRIMARY KEY (id);


--
-- Name: memories memories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memories
    ADD CONSTRAINT memories_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: orchard_activity orchard_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchard_activity
    ADD CONSTRAINT orchard_activity_pkey PRIMARY KEY (id);


--
-- Name: orchard_chapters orchard_chapters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchard_chapters
    ADD CONSTRAINT orchard_chapters_pkey PRIMARY KEY (id);


--
-- Name: orchard_profile orchard_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchard_profile
    ADD CONSTRAINT orchard_profile_pkey PRIMARY KEY (id);


--
-- Name: orchard_profile orchard_profile_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchard_profile
    ADD CONSTRAINT orchard_profile_student_id_key UNIQUE (student_id);


--
-- Name: orchard_reviews orchard_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchard_reviews
    ADD CONSTRAINT orchard_reviews_pkey PRIMARY KEY (id);


--
-- Name: orchard_school_tree_assignments orchard_school_tree_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchard_school_tree_assignments
    ADD CONSTRAINT orchard_school_tree_assignments_pkey PRIMARY KEY (school_id, subject_key);


--
-- Name: orchard_subjects orchard_subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchard_subjects
    ADD CONSTRAINT orchard_subjects_pkey PRIMARY KEY (id);


--
-- Name: orchard_subjects orchard_subjects_subject_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchard_subjects
    ADD CONSTRAINT orchard_subjects_subject_key_key UNIQUE (subject_key);


--
-- Name: orchard_trees orchard_trees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchard_trees
    ADD CONSTRAINT orchard_trees_pkey PRIMARY KEY (id);


--
-- Name: orchard_trees orchard_trees_student_id_subject_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchard_trees
    ADD CONSTRAINT orchard_trees_student_id_subject_key_key UNIQUE (student_id, subject_key);


--
-- Name: progress_metrics progress_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.progress_metrics
    ADD CONSTRAINT progress_metrics_pkey PRIMARY KEY (id);


--
-- Name: quiz_decks quiz_decks_deck_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_decks
    ADD CONSTRAINT quiz_decks_deck_key_key UNIQUE (deck_key);


--
-- Name: quiz_decks quiz_decks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_decks
    ADD CONSTRAINT quiz_decks_pkey PRIMARY KEY (id);


--
-- Name: quiz_questions quiz_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_questions
    ADD CONSTRAINT quiz_questions_pkey PRIMARY KEY (id);


--
-- Name: redemptions redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redemptions
    ADD CONSTRAINT redemptions_pkey PRIMARY KEY (id);


--
-- Name: registration_email_verifications registration_email_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration_email_verifications
    ADD CONSTRAINT registration_email_verifications_pkey PRIMARY KEY (id);


--
-- Name: registration_invites registration_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration_invites
    ADD CONSTRAINT registration_invites_pkey PRIMARY KEY (token);


--
-- Name: registration_phone_verifications registration_phone_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration_phone_verifications
    ADD CONSTRAINT registration_phone_verifications_pkey PRIMARY KEY (id);


--
-- Name: report_exam_celebrations report_exam_celebrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_exam_celebrations
    ADD CONSTRAINT report_exam_celebrations_pkey PRIMARY KEY (exam_id, student_id);


--
-- Name: report_exam_marks report_exam_marks_exam_id_student_id_subject_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_exam_marks
    ADD CONSTRAINT report_exam_marks_exam_id_student_id_subject_key UNIQUE (exam_id, student_id, subject);


--
-- Name: report_exam_marks report_exam_marks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_exam_marks
    ADD CONSTRAINT report_exam_marks_pkey PRIMARY KEY (id);


--
-- Name: report_exams report_exams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_exams
    ADD CONSTRAINT report_exams_pkey PRIMARY KEY (id);


--
-- Name: rewards rewards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rewards
    ADD CONSTRAINT rewards_pkey PRIMARY KEY (id);


--
-- Name: school_asset_registry school_asset_registry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_asset_registry
    ADD CONSTRAINT school_asset_registry_pkey PRIMARY KEY (id);


--
-- Name: school_enquiries school_enquiries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_enquiries
    ADD CONSTRAINT school_enquiries_pkey PRIMARY KEY (id);


--
-- Name: school_enquiries school_enquiries_session_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_enquiries
    ADD CONSTRAINT school_enquiries_session_hash_key UNIQUE (session_hash);


--
-- Name: school_enquiry_challenges school_enquiry_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_enquiry_challenges
    ADD CONSTRAINT school_enquiry_challenges_pkey PRIMARY KEY (id);


--
-- Name: school_enquiry_messages school_enquiry_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_enquiry_messages
    ADD CONSTRAINT school_enquiry_messages_pkey PRIMARY KEY (id);


--
-- Name: school_profile_email_verifications school_profile_email_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_profile_email_verifications
    ADD CONSTRAINT school_profile_email_verifications_pkey PRIMARY KEY (id);


--
-- Name: school_progress_periods school_progress_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_progress_periods
    ADD CONSTRAINT school_progress_periods_pkey PRIMARY KEY (school_id);


--
-- Name: school_registration_phone_verifications school_registration_phone_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_registration_phone_verifications
    ADD CONSTRAINT school_registration_phone_verifications_pkey PRIMARY KEY (id);


--
-- Name: schools schools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_pkey PRIMARY KEY (id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);


--
-- Name: strict_exam_sessions strict_exam_sessions_attempt_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strict_exam_sessions
    ADD CONSTRAINT strict_exam_sessions_attempt_id_key UNIQUE (attempt_id);


--
-- Name: strict_exam_sessions strict_exam_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strict_exam_sessions
    ADD CONSTRAINT strict_exam_sessions_pkey PRIMARY KEY (test_id, student_id);


--
-- Name: strict_test_settings strict_test_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strict_test_settings
    ADD CONSTRAINT strict_test_settings_pkey PRIMARY KEY (test_id);


--
-- Name: student_accounts student_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_accounts
    ADD CONSTRAINT student_accounts_pkey PRIMARY KEY (id);


--
-- Name: student_lesson_progress student_lesson_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_lesson_progress
    ADD CONSTRAINT student_lesson_progress_pkey PRIMARY KEY (id);


--
-- Name: student_lesson_progress student_lesson_progress_student_id_lesson_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_lesson_progress
    ADD CONSTRAINT student_lesson_progress_student_id_lesson_id_key UNIQUE (student_id, lesson_id);


--
-- Name: student_push_devices student_push_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_push_devices
    ADD CONSTRAINT student_push_devices_pkey PRIMARY KEY (id);


--
-- Name: student_push_devices student_push_devices_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_push_devices
    ADD CONSTRAINT student_push_devices_token_key UNIQUE (token);


--
-- Name: student_rewards student_rewards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_rewards
    ADD CONSTRAINT student_rewards_pkey PRIMARY KEY (id);


--
-- Name: students students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_pkey PRIMARY KEY (id);


--
-- Name: support_messages support_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- Name: teachers teachers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_pkey PRIMARY KEY (id);


--
-- Name: test_attempts test_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_attempts
    ADD CONSTRAINT test_attempts_pkey PRIMARY KEY (id);


--
-- Name: test_questions test_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_questions
    ADD CONSTRAINT test_questions_pkey PRIMARY KEY (id);


--
-- Name: tests tests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tests
    ADD CONSTRAINT tests_pkey PRIMARY KEY (id);


--
-- Name: class_attendance_student_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX class_attendance_student_period_idx ON public.class_attendance USING btree (school_id, student_id, attendance_date);


--
-- Name: idx_chapter_growth_chapter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chapter_growth_chapter ON public.chapter_growth USING btree (chapter_id);


--
-- Name: idx_chapter_growth_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chapter_growth_stage ON public.chapter_growth USING btree (stage);


--
-- Name: idx_chapter_growth_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chapter_growth_student ON public.chapter_growth USING btree (student_id);


--
-- Name: idx_chapter_growth_student_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chapter_growth_student_subject ON public.chapter_growth USING btree (student_id, subject_key);


--
-- Name: idx_chapter_growth_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chapter_growth_subject ON public.chapter_growth USING btree (subject_key);


--
-- Name: idx_conversation_snapshots_student_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_snapshots_student_conv ON public.conversation_snapshots USING btree (student_id, conversation_id);


--
-- Name: idx_conversation_snapshots_student_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_snapshots_student_updated ON public.conversation_snapshots USING btree (student_id, updated_at DESC);


--
-- Name: idx_conversation_snapshots_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_conversation_snapshots_unique ON public.conversation_snapshots USING btree (student_id, conversation_id);


--
-- Name: idx_conversation_snapshots_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_snapshots_updated_at ON public.conversation_snapshots USING btree (updated_at DESC);


--
-- Name: idx_events_student_starts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_student_starts ON public.events USING btree (student_id, starts_at);


--
-- Name: idx_fc_completions_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fc_completions_student ON public.flashcard_chapter_completions USING btree (student_id);


--
-- Name: idx_flashcard_decks_lesson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flashcard_decks_lesson ON public.flashcard_decks USING btree (lesson_id);


--
-- Name: idx_flashcard_decks_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flashcard_decks_subject ON public.flashcard_decks USING btree (subject_key);


--
-- Name: idx_flashcard_decks_subject_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flashcard_decks_subject_class ON public.flashcard_decks USING btree (subject_key, class_name);


--
-- Name: idx_flashcard_progress_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flashcard_progress_student ON public.flashcard_progress USING btree (student_id);


--
-- Name: idx_flashcard_progress_student_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flashcard_progress_student_due ON public.flashcard_progress USING btree (student_id, due_at);


--
-- Name: idx_flashcard_progress_student_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flashcard_progress_student_subject ON public.flashcard_progress USING btree (student_id, subject_key);


--
-- Name: idx_flashcards_chapter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flashcards_chapter ON public.flashcards USING btree (chapter_id);


--
-- Name: idx_flashcards_deck; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flashcards_deck ON public.flashcards USING btree (deck_id);


--
-- Name: idx_flashcards_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flashcards_subject ON public.flashcards USING btree (subject_key);


--
-- Name: idx_game_sessions_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_game_sessions_created ON public.game_sessions USING btree (created_at);


--
-- Name: idx_game_sessions_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_game_sessions_student ON public.game_sessions USING btree (student_id);


--
-- Name: idx_game_sessions_student_game; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_game_sessions_student_game ON public.game_sessions USING btree (student_id, game_key);


--
-- Name: idx_homework_attempts_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_homework_attempts_student ON public.homework_attempts USING btree (student_id);


--
-- Name: idx_lesson_chunks_document_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lesson_chunks_document_id ON public.lesson_chunks USING btree (document_id);


--
-- Name: idx_lesson_chunks_embedding_hnsw; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lesson_chunks_embedding_hnsw ON public.lesson_chunks USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: idx_lesson_chunks_lesson_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lesson_chunks_lesson_id ON public.lesson_chunks USING btree (lesson_id);


--
-- Name: idx_lesson_chunks_teacher_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lesson_chunks_teacher_id ON public.lesson_chunks USING btree (teacher_id);


--
-- Name: idx_lesson_class_visibility_class_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lesson_class_visibility_class_name ON public.lesson_class_visibility USING btree (class_name);


--
-- Name: idx_lesson_class_visibility_lesson_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lesson_class_visibility_lesson_id ON public.lesson_class_visibility USING btree (lesson_id);


--
-- Name: idx_lesson_class_visibility_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lesson_class_visibility_lookup ON public.lesson_class_visibility USING btree (lesson_id, class_name, is_visible);


--
-- Name: idx_lesson_class_visibility_teacher_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lesson_class_visibility_teacher_id ON public.lesson_class_visibility USING btree (teacher_id);


--
-- Name: idx_lesson_documents_lesson_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lesson_documents_lesson_id ON public.lesson_documents USING btree (lesson_id);


--
-- Name: idx_lesson_documents_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lesson_documents_status ON public.lesson_documents USING btree (extraction_status);


--
-- Name: idx_lesson_documents_teacher_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lesson_documents_teacher_id ON public.lesson_documents USING btree (teacher_id);


--
-- Name: idx_lesson_stories_lesson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lesson_stories_lesson ON public.lesson_stories USING btree (lesson_id);


--
-- Name: idx_lesson_story_progress_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lesson_story_progress_student ON public.lesson_story_progress USING btree (student_id);


--
-- Name: idx_lessons_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lessons_subject ON public.lessons USING btree (subject);


--
-- Name: idx_lessons_teacher_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lessons_teacher_id ON public.lessons USING btree (teacher_id);


--
-- Name: idx_lessons_teacher_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lessons_teacher_subject ON public.lessons USING btree (teacher_id, subject);


--
-- Name: idx_messages_conversation_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_conversation_created_at ON public.messages USING btree (student_id, conversation_id, created_at DESC);


--
-- Name: idx_messages_student_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_student_conversation ON public.messages USING btree (student_id, conversation_id, created_at DESC);


--
-- Name: idx_orchard_activity_chapter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orchard_activity_chapter ON public.orchard_activity USING btree (chapter_id);


--
-- Name: idx_orchard_activity_occurred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orchard_activity_occurred ON public.orchard_activity USING btree (occurred_at);


--
-- Name: idx_orchard_activity_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orchard_activity_student ON public.orchard_activity USING btree (student_id);


--
-- Name: idx_orchard_activity_student_occurred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orchard_activity_student_occurred ON public.orchard_activity USING btree (student_id, occurred_at);


--
-- Name: idx_orchard_activity_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orchard_activity_subject ON public.orchard_activity USING btree (subject_key);


--
-- Name: idx_orchard_chapters_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orchard_chapters_class ON public.orchard_chapters USING btree (class_name);


--
-- Name: idx_orchard_chapters_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orchard_chapters_subject ON public.orchard_chapters USING btree (subject_key);


--
-- Name: idx_orchard_chapters_subject_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orchard_chapters_subject_class ON public.orchard_chapters USING btree (subject_key, class_name);


--
-- Name: idx_orchard_profile_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orchard_profile_student ON public.orchard_profile USING btree (student_id);


--
-- Name: idx_orchard_reviews_chapter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orchard_reviews_chapter ON public.orchard_reviews USING btree (chapter_id);


--
-- Name: idx_orchard_reviews_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orchard_reviews_due ON public.orchard_reviews USING btree (student_id, scheduled_at) WHERE (completed_at IS NULL);


--
-- Name: idx_orchard_reviews_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orchard_reviews_scheduled ON public.orchard_reviews USING btree (scheduled_at);


--
-- Name: idx_orchard_reviews_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orchard_reviews_student ON public.orchard_reviews USING btree (student_id);


--
-- Name: idx_orchard_subjects_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orchard_subjects_order ON public.orchard_subjects USING btree (order_index);


--
-- Name: idx_orchard_trees_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orchard_trees_student ON public.orchard_trees USING btree (student_id);


--
-- Name: idx_orchard_trees_student_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orchard_trees_student_subject ON public.orchard_trees USING btree (student_id, subject_key);


--
-- Name: idx_orchard_trees_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orchard_trees_subject ON public.orchard_trees USING btree (subject_key);


--
-- Name: idx_progress_metrics_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_progress_metrics_student ON public.progress_metrics USING btree (student_id);


--
-- Name: idx_quiz_decks_lesson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quiz_decks_lesson ON public.quiz_decks USING btree (lesson_id);


--
-- Name: idx_quiz_decks_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quiz_decks_subject ON public.quiz_decks USING btree (subject_key);


--
-- Name: idx_quiz_decks_subject_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quiz_decks_subject_class ON public.quiz_decks USING btree (subject_key, class_name);


--
-- Name: idx_quiz_questions_chapter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quiz_questions_chapter ON public.quiz_questions USING btree (chapter_id);


--
-- Name: idx_quiz_questions_deck; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quiz_questions_deck ON public.quiz_questions USING btree (deck_id);


--
-- Name: idx_quiz_questions_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quiz_questions_subject ON public.quiz_questions USING btree (subject_key);


--
-- Name: idx_redemptions_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_redemptions_student ON public.redemptions USING btree (student_id);


--
-- Name: idx_registration_invites_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registration_invites_expires ON public.registration_invites USING btree (expires_at);


--
-- Name: idx_registration_invites_revoked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registration_invites_revoked ON public.registration_invites USING btree (revoked, created_at DESC);


--
-- Name: idx_registration_invites_school_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registration_invites_school_role ON public.registration_invites USING btree (school_id, role);


--
-- Name: idx_registration_invites_teacher; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registration_invites_teacher ON public.registration_invites USING btree (teacher_id);


--
-- Name: idx_report_exam_marks_exam; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_report_exam_marks_exam ON public.report_exam_marks USING btree (exam_id);


--
-- Name: idx_report_exam_marks_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_report_exam_marks_student ON public.report_exam_marks USING btree (student_id);


--
-- Name: idx_report_exams_school_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_report_exams_school_class ON public.report_exams USING btree (school_id, lower(class_name));


--
-- Name: idx_student_accounts_school_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_accounts_school_id ON public.student_accounts USING btree (school_id);


--
-- Name: idx_student_accounts_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_accounts_student_id ON public.student_accounts USING btree (student_id);


--
-- Name: idx_student_accounts_teacher_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_accounts_teacher_id ON public.student_accounts USING btree (teacher_id);


--
-- Name: idx_student_lesson_progress_last_mastery_update_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_lesson_progress_last_mastery_update_at ON public.student_lesson_progress USING btree (last_mastery_update_at DESC);


--
-- Name: idx_student_lesson_progress_lesson_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_lesson_progress_lesson_id ON public.student_lesson_progress USING btree (lesson_id);


--
-- Name: idx_student_lesson_progress_source_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_lesson_progress_source_conversation_id ON public.student_lesson_progress USING btree (source_conversation_id);


--
-- Name: idx_student_lesson_progress_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_lesson_progress_status ON public.student_lesson_progress USING btree (status);


--
-- Name: idx_student_lesson_progress_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_lesson_progress_student_id ON public.student_lesson_progress USING btree (student_id);


--
-- Name: idx_student_lesson_progress_teacher_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_lesson_progress_teacher_id ON public.student_lesson_progress USING btree (teacher_id);


--
-- Name: idx_student_rewards_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_rewards_student ON public.student_rewards USING btree (student_id);


--
-- Name: idx_students_school_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_students_school_id ON public.students USING btree (school_id);


--
-- Name: idx_students_teacher_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_students_teacher_id ON public.students USING btree (teacher_id);


--
-- Name: idx_teachers_school_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_teachers_school_id ON public.teachers USING btree (school_id);


--
-- Name: idx_test_attempts_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_attempts_student ON public.test_attempts USING btree (student_id);


--
-- Name: registration_email_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX registration_email_expiry_idx ON public.registration_email_verifications USING btree (expires_at);


--
-- Name: registration_phone_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX registration_phone_expiry_idx ON public.registration_phone_verifications USING btree (expires_at);


--
-- Name: school_asset_registry_file_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX school_asset_registry_file_idx ON public.school_asset_registry USING btree (file_url);


--
-- Name: school_asset_registry_school_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX school_asset_registry_school_idx ON public.school_asset_registry USING btree (school_id);


--
-- Name: school_enquiries_inbox_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX school_enquiries_inbox_idx ON public.school_enquiries USING btree (updated_at DESC, id);


--
-- Name: school_enquiry_messages_thread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX school_enquiry_messages_thread_idx ON public.school_enquiry_messages USING btree (enquiry_id, created_at, id);


--
-- Name: school_profile_email_verifications_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX school_profile_email_verifications_expiry_idx ON public.school_profile_email_verifications USING btree (expires_at);


--
-- Name: school_registration_phone_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX school_registration_phone_expiry_idx ON public.school_registration_phone_verifications USING btree (expires_at);


--
-- Name: strict_exam_student_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX strict_exam_student_idx ON public.strict_exam_sessions USING btree (student_id, status);


--
-- Name: strict_exam_teacher_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX strict_exam_teacher_idx ON public.strict_exam_sessions USING btree (teacher_id, school_id, test_id);


--
-- Name: student_push_devices_school_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX student_push_devices_school_idx ON public.student_push_devices USING btree (school_id, class_name);


--
-- Name: student_push_devices_student_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX student_push_devices_student_idx ON public.student_push_devices USING btree (student_id);


--
-- Name: support_messages_ticket_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX support_messages_ticket_idx ON public.support_messages USING btree (ticket_id, created_at);


--
-- Name: support_tickets_inbox_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX support_tickets_inbox_idx ON public.support_tickets USING btree (updated_at DESC);


--
-- Name: support_tickets_requester_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX support_tickets_requester_idx ON public.support_tickets USING btree (requester_id, school_id, updated_at DESC);


--
-- Name: uq_report_exams_school_class_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_report_exams_school_class_name ON public.report_exams USING btree (school_id, lower(class_name), lower(name));


--
-- Name: uq_schools_email_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_schools_email_lower ON public.schools USING btree (lower(email));


--
-- Name: uq_student_accounts_login_id_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_student_accounts_login_id_lower ON public.student_accounts USING btree (lower(login_id));


--
-- Name: uq_teachers_email_per_school_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_teachers_email_per_school_lower ON public.teachers USING btree (school_id, lower(email));


--
-- Name: uq_teachers_login_id_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_teachers_login_id_lower ON public.teachers USING btree (lower(login_id));


--
-- Name: chapter_growth chapter_growth_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chapter_growth
    ADD CONSTRAINT chapter_growth_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.orchard_chapters(id) ON DELETE CASCADE;


--
-- Name: chapter_growth chapter_growth_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chapter_growth
    ADD CONSTRAINT chapter_growth_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: chapter_growth chapter_growth_subject_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chapter_growth
    ADD CONSTRAINT chapter_growth_subject_key_fkey FOREIGN KEY (subject_key) REFERENCES public.orchard_subjects(subject_key) ON DELETE CASCADE;


--
-- Name: conversation_snapshots conversation_snapshots_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_snapshots
    ADD CONSTRAINT conversation_snapshots_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: flashcard_progress flashcard_progress_flashcard_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flashcard_progress
    ADD CONSTRAINT flashcard_progress_flashcard_id_fkey FOREIGN KEY (flashcard_id) REFERENCES public.flashcards(id) ON DELETE CASCADE;


--
-- Name: flashcard_progress flashcard_progress_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flashcard_progress
    ADD CONSTRAINT flashcard_progress_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: flashcards flashcards_deck_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flashcards
    ADD CONSTRAINT flashcards_deck_id_fkey FOREIGN KEY (deck_id) REFERENCES public.flashcard_decks(id) ON DELETE CASCADE;


--
-- Name: game_sessions game_sessions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_sessions
    ADD CONSTRAINT game_sessions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: homework homework_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.homework
    ADD CONSTRAINT homework_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE SET NULL;


--
-- Name: lesson_chunks lesson_chunks_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_chunks
    ADD CONSTRAINT lesson_chunks_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.lesson_documents(id) ON DELETE CASCADE;


--
-- Name: lesson_chunks lesson_chunks_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_chunks
    ADD CONSTRAINT lesson_chunks_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;


--
-- Name: lesson_chunks lesson_chunks_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_chunks
    ADD CONSTRAINT lesson_chunks_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE;


--
-- Name: lesson_class_visibility lesson_class_visibility_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_class_visibility
    ADD CONSTRAINT lesson_class_visibility_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;


--
-- Name: lesson_class_visibility lesson_class_visibility_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_class_visibility
    ADD CONSTRAINT lesson_class_visibility_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE;


--
-- Name: lesson_documents lesson_documents_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_documents
    ADD CONSTRAINT lesson_documents_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;


--
-- Name: lesson_documents lesson_documents_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_documents
    ADD CONSTRAINT lesson_documents_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE;


--
-- Name: lessons lessons_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE;


--
-- Name: memories memories_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memories
    ADD CONSTRAINT memories_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: messages messages_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE SET NULL;


--
-- Name: orchard_activity orchard_activity_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchard_activity
    ADD CONSTRAINT orchard_activity_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.orchard_chapters(id) ON DELETE SET NULL;


--
-- Name: orchard_activity orchard_activity_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchard_activity
    ADD CONSTRAINT orchard_activity_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: orchard_activity orchard_activity_subject_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchard_activity
    ADD CONSTRAINT orchard_activity_subject_key_fkey FOREIGN KEY (subject_key) REFERENCES public.orchard_subjects(subject_key) ON DELETE CASCADE;


--
-- Name: orchard_chapters orchard_chapters_subject_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchard_chapters
    ADD CONSTRAINT orchard_chapters_subject_key_fkey FOREIGN KEY (subject_key) REFERENCES public.orchard_subjects(subject_key) ON DELETE CASCADE;


--
-- Name: orchard_profile orchard_profile_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchard_profile
    ADD CONSTRAINT orchard_profile_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: orchard_reviews orchard_reviews_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchard_reviews
    ADD CONSTRAINT orchard_reviews_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.orchard_chapters(id) ON DELETE CASCADE;


--
-- Name: orchard_reviews orchard_reviews_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchard_reviews
    ADD CONSTRAINT orchard_reviews_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: orchard_reviews orchard_reviews_subject_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchard_reviews
    ADD CONSTRAINT orchard_reviews_subject_key_fkey FOREIGN KEY (subject_key) REFERENCES public.orchard_subjects(subject_key) ON DELETE CASCADE;


--
-- Name: orchard_school_tree_assignments orchard_school_tree_assignments_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchard_school_tree_assignments
    ADD CONSTRAINT orchard_school_tree_assignments_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: orchard_trees orchard_trees_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchard_trees
    ADD CONSTRAINT orchard_trees_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: orchard_trees orchard_trees_subject_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchard_trees
    ADD CONSTRAINT orchard_trees_subject_key_fkey FOREIGN KEY (subject_key) REFERENCES public.orchard_subjects(subject_key) ON DELETE CASCADE;


--
-- Name: quiz_questions quiz_questions_deck_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_questions
    ADD CONSTRAINT quiz_questions_deck_id_fkey FOREIGN KEY (deck_id) REFERENCES public.quiz_decks(id) ON DELETE CASCADE;


--
-- Name: registration_invites registration_invites_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration_invites
    ADD CONSTRAINT registration_invites_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: registration_invites registration_invites_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration_invites
    ADD CONSTRAINT registration_invites_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE;


--
-- Name: report_exam_celebrations report_exam_celebrations_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_exam_celebrations
    ADD CONSTRAINT report_exam_celebrations_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.report_exams(id) ON DELETE CASCADE;


--
-- Name: report_exam_celebrations report_exam_celebrations_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_exam_celebrations
    ADD CONSTRAINT report_exam_celebrations_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: report_exam_marks report_exam_marks_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_exam_marks
    ADD CONSTRAINT report_exam_marks_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.report_exams(id) ON DELETE CASCADE;


--
-- Name: report_exam_marks report_exam_marks_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_exam_marks
    ADD CONSTRAINT report_exam_marks_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: report_exam_marks report_exam_marks_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_exam_marks
    ADD CONSTRAINT report_exam_marks_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE SET NULL;


--
-- Name: report_exams report_exams_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_exams
    ADD CONSTRAINT report_exams_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.teachers(id) ON DELETE SET NULL;


--
-- Name: report_exams report_exams_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_exams
    ADD CONSTRAINT report_exams_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: school_enquiry_messages school_enquiry_messages_enquiry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_enquiry_messages
    ADD CONSTRAINT school_enquiry_messages_enquiry_id_fkey FOREIGN KEY (enquiry_id) REFERENCES public.school_enquiries(id) ON DELETE CASCADE;


--
-- Name: school_progress_periods school_progress_periods_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_progress_periods
    ADD CONSTRAINT school_progress_periods_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: student_accounts student_accounts_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_accounts
    ADD CONSTRAINT student_accounts_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;


--
-- Name: student_accounts student_accounts_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_accounts
    ADD CONSTRAINT student_accounts_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_accounts student_accounts_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_accounts
    ADD CONSTRAINT student_accounts_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE SET NULL;


--
-- Name: student_lesson_progress student_lesson_progress_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_lesson_progress
    ADD CONSTRAINT student_lesson_progress_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;


--
-- Name: student_lesson_progress student_lesson_progress_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_lesson_progress
    ADD CONSTRAINT student_lesson_progress_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_lesson_progress student_lesson_progress_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_lesson_progress
    ADD CONSTRAINT student_lesson_progress_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE;


--
-- Name: students students_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;


--
-- Name: students students_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE SET NULL;


--
-- Name: support_messages support_messages_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- Name: teachers teachers_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: test_questions test_questions_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_questions
    ADD CONSTRAINT test_questions_test_id_fkey FOREIGN KEY (test_id) REFERENCES public.tests(id) ON DELETE CASCADE;


--
-- Name: tests tests_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tests
    ADD CONSTRAINT tests_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: tests tests_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tests
    ADD CONSTRAINT tests_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE SET NULL;


--
-- Name: announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

--
-- Name: announcements announcements_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY announcements_select_authenticated ON public.announcements FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: chapter_growth; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chapter_growth ENABLE ROW LEVEL SECURITY;

--
-- Name: chapter_growth chapter_growth_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chapter_growth_all ON public.chapter_growth USING ((student_id = auth.uid())) WITH CHECK ((student_id = auth.uid()));


--
-- Name: class_attendance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.class_attendance ENABLE ROW LEVEL SECURITY;

--
-- Name: class_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.class_members ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: events events_delete_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY events_delete_owner ON public.events FOR DELETE USING ((student_id = auth.uid()));


--
-- Name: events events_insert_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY events_insert_owner ON public.events FOR INSERT WITH CHECK ((student_id = auth.uid()));


--
-- Name: events events_insert_with_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY events_insert_with_staff ON public.events FOR INSERT WITH CHECK (((student_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.class_members cm
  WHERE ((cm.student_id = events.student_id) AND ((cm.teacher_id = auth.uid()) OR (cm.parent_id = auth.uid())))))));


--
-- Name: events events_select_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY events_select_owner ON public.events FOR SELECT USING ((student_id = auth.uid()));


--
-- Name: events events_select_with_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY events_select_with_staff ON public.events FOR SELECT USING (((student_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.class_members cm
  WHERE ((cm.student_id = events.student_id) AND ((cm.teacher_id = auth.uid()) OR (cm.parent_id = auth.uid())))))));


--
-- Name: events events_update_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY events_update_owner ON public.events FOR UPDATE USING ((student_id = auth.uid())) WITH CHECK ((student_id = auth.uid()));


--
-- Name: flashcard_chapter_completions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.flashcard_chapter_completions ENABLE ROW LEVEL SECURITY;

--
-- Name: flashcard_decks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.flashcard_decks ENABLE ROW LEVEL SECURITY;

--
-- Name: flashcard_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.flashcard_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: flashcards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;

--
-- Name: game_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: homework; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.homework ENABLE ROW LEVEL SECURITY;

--
-- Name: homework_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.homework_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: homework_attempts homework_attempts_insert_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY homework_attempts_insert_owner ON public.homework_attempts FOR INSERT WITH CHECK ((student_id = auth.uid()));


--
-- Name: homework_attempts homework_attempts_select_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY homework_attempts_select_owner ON public.homework_attempts FOR SELECT USING ((student_id = auth.uid()));


--
-- Name: homework_attempts homework_attempts_update_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY homework_attempts_update_owner ON public.homework_attempts FOR UPDATE USING ((student_id = auth.uid())) WITH CHECK ((student_id = auth.uid()));


--
-- Name: homework homework_delete_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY homework_delete_owner ON public.homework FOR DELETE USING ((student_id = auth.uid()));


--
-- Name: homework homework_insert_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY homework_insert_owner ON public.homework FOR INSERT WITH CHECK ((student_id = auth.uid()));


--
-- Name: homework homework_select_by_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY homework_select_by_owner ON public.homework FOR SELECT USING ((student_id = auth.uid()));


--
-- Name: homework homework_select_with_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY homework_select_with_staff ON public.homework FOR SELECT USING (((student_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.class_members cm
  WHERE ((cm.student_id = homework.student_id) AND ((cm.teacher_id = auth.uid()) OR (cm.parent_id = auth.uid())))))));


--
-- Name: homework homework_update_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY homework_update_owner ON public.homework FOR UPDATE USING ((student_id = auth.uid())) WITH CHECK ((student_id = auth.uid()));


--
-- Name: lesson_chunks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lesson_chunks ENABLE ROW LEVEL SECURITY;

--
-- Name: lesson_chunks lesson_chunks_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lesson_chunks_insert ON public.lesson_chunks FOR INSERT WITH CHECK ((teacher_id = auth.uid()));


--
-- Name: lesson_chunks lesson_chunks_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lesson_chunks_select ON public.lesson_chunks FOR SELECT USING (((teacher_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (public.lesson_class_visibility lcv
     JOIN public.students s ON ((s.id = auth.uid())))
  WHERE ((lcv.lesson_id = lesson_chunks.lesson_id) AND (lcv.class_name = s.class_name) AND (lcv.is_visible = true))))));


--
-- Name: lesson_class_visibility; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lesson_class_visibility ENABLE ROW LEVEL SECURITY;

--
-- Name: lesson_class_visibility lesson_class_visibility_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lesson_class_visibility_delete ON public.lesson_class_visibility FOR DELETE USING ((teacher_id = auth.uid()));


--
-- Name: lesson_class_visibility lesson_class_visibility_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lesson_class_visibility_insert ON public.lesson_class_visibility FOR INSERT WITH CHECK ((teacher_id = auth.uid()));


--
-- Name: lesson_class_visibility lesson_class_visibility_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lesson_class_visibility_select ON public.lesson_class_visibility FOR SELECT USING (((teacher_id = auth.uid()) OR ((class_name = ( SELECT s.class_name
   FROM public.students s
  WHERE (s.id = auth.uid()))) AND (is_visible = true))));


--
-- Name: lesson_class_visibility lesson_class_visibility_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lesson_class_visibility_update ON public.lesson_class_visibility FOR UPDATE USING ((teacher_id = auth.uid())) WITH CHECK ((teacher_id = auth.uid()));


--
-- Name: lesson_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lesson_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: lesson_documents lesson_documents_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lesson_documents_delete ON public.lesson_documents FOR DELETE USING ((teacher_id = auth.uid()));


--
-- Name: lesson_documents lesson_documents_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lesson_documents_insert ON public.lesson_documents FOR INSERT WITH CHECK ((teacher_id = auth.uid()));


--
-- Name: lesson_documents lesson_documents_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lesson_documents_select ON public.lesson_documents FOR SELECT USING (((teacher_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (public.lesson_class_visibility lcv
     JOIN public.students s ON ((s.id = auth.uid())))
  WHERE ((lcv.lesson_id = lesson_documents.lesson_id) AND (lcv.class_name = s.class_name) AND (lcv.is_visible = true))))));


--
-- Name: lesson_documents lesson_documents_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lesson_documents_update ON public.lesson_documents FOR UPDATE USING ((teacher_id = auth.uid())) WITH CHECK ((teacher_id = auth.uid()));


--
-- Name: lesson_stories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lesson_stories ENABLE ROW LEVEL SECURITY;

--
-- Name: lesson_story_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lesson_story_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: lessons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

--
-- Name: lessons lessons_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lessons_delete ON public.lessons FOR DELETE USING ((teacher_id = auth.uid()));


--
-- Name: lessons lessons_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lessons_insert ON public.lessons FOR INSERT WITH CHECK ((teacher_id = auth.uid()));


--
-- Name: lessons lessons_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lessons_select ON public.lessons FOR SELECT USING (((teacher_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (public.lesson_class_visibility lcv
     JOIN public.students s ON ((s.id = auth.uid())))
  WHERE ((lcv.lesson_id = lessons.id) AND (lcv.class_name = s.class_name) AND (lcv.is_visible = true))))));


--
-- Name: lessons lessons_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lessons_update ON public.lessons FOR UPDATE USING ((teacher_id = auth.uid())) WITH CHECK ((teacher_id = auth.uid()));


--
-- Name: memories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;

--
-- Name: memories memories_delete_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY memories_delete_owner ON public.memories FOR DELETE USING ((student_id = auth.uid()));


--
-- Name: memories memories_insert_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY memories_insert_owner ON public.memories FOR INSERT WITH CHECK ((student_id = auth.uid()));


--
-- Name: memories memories_select_by_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY memories_select_by_owner ON public.memories FOR SELECT USING ((student_id = auth.uid()));


--
-- Name: memories memories_select_with_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY memories_select_with_staff ON public.memories FOR SELECT USING (((student_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.class_members cm
  WHERE ((cm.student_id = memories.student_id) AND ((cm.teacher_id = auth.uid()) OR (cm.parent_id = auth.uid())))))));


--
-- Name: memories memories_update_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY memories_update_owner ON public.memories FOR UPDATE USING ((student_id = auth.uid())) WITH CHECK ((student_id = auth.uid()));


--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: orchard_activity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orchard_activity ENABLE ROW LEVEL SECURITY;

--
-- Name: orchard_activity orchard_activity_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orchard_activity_all ON public.orchard_activity USING ((student_id = auth.uid())) WITH CHECK ((student_id = auth.uid()));


--
-- Name: orchard_chapters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orchard_chapters ENABLE ROW LEVEL SECURITY;

--
-- Name: orchard_chapters orchard_chapters_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orchard_chapters_select ON public.orchard_chapters FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: orchard_profile; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orchard_profile ENABLE ROW LEVEL SECURITY;

--
-- Name: orchard_profile orchard_profile_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orchard_profile_all ON public.orchard_profile USING ((student_id = auth.uid())) WITH CHECK ((student_id = auth.uid()));


--
-- Name: orchard_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orchard_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: orchard_reviews orchard_reviews_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orchard_reviews_all ON public.orchard_reviews USING ((student_id = auth.uid())) WITH CHECK ((student_id = auth.uid()));


--
-- Name: orchard_school_tree_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orchard_school_tree_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: orchard_subjects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orchard_subjects ENABLE ROW LEVEL SECURITY;

--
-- Name: orchard_subjects orchard_subjects_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orchard_subjects_select ON public.orchard_subjects FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: orchard_trees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orchard_trees ENABLE ROW LEVEL SECURITY;

--
-- Name: orchard_trees orchard_trees_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orchard_trees_all ON public.orchard_trees USING ((student_id = auth.uid())) WITH CHECK ((student_id = auth.uid()));


--
-- Name: progress_metrics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.progress_metrics ENABLE ROW LEVEL SECURITY;

--
-- Name: progress_metrics progress_metrics_select_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY progress_metrics_select_owner ON public.progress_metrics FOR SELECT USING ((student_id = auth.uid()));


--
-- Name: progress_metrics progress_metrics_select_with_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY progress_metrics_select_with_staff ON public.progress_metrics FOR SELECT USING (((student_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.class_members cm
  WHERE ((cm.student_id = progress_metrics.student_id) AND ((cm.teacher_id = auth.uid()) OR (cm.parent_id = auth.uid())))))));


--
-- Name: quiz_decks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quiz_decks ENABLE ROW LEVEL SECURITY;

--
-- Name: quiz_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: redemptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;

--
-- Name: redemptions redemptions_insert_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY redemptions_insert_owner ON public.redemptions FOR INSERT WITH CHECK ((student_id = auth.uid()));


--
-- Name: redemptions redemptions_select_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY redemptions_select_owner ON public.redemptions FOR SELECT USING ((student_id = auth.uid()));


--
-- Name: registration_email_verifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.registration_email_verifications ENABLE ROW LEVEL SECURITY;

--
-- Name: registration_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.registration_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: registration_phone_verifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.registration_phone_verifications ENABLE ROW LEVEL SECURITY;

--
-- Name: report_exam_celebrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.report_exam_celebrations ENABLE ROW LEVEL SECURITY;

--
-- Name: report_exam_marks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.report_exam_marks ENABLE ROW LEVEL SECURITY;

--
-- Name: report_exams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.report_exams ENABLE ROW LEVEL SECURITY;

--
-- Name: rewards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;

--
-- Name: school_asset_registry; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.school_asset_registry ENABLE ROW LEVEL SECURITY;

--
-- Name: school_enquiries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.school_enquiries ENABLE ROW LEVEL SECURITY;

--
-- Name: school_enquiry_challenges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.school_enquiry_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: school_enquiry_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.school_enquiry_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: school_profile_email_verifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.school_profile_email_verifications ENABLE ROW LEVEL SECURITY;

--
-- Name: school_progress_periods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.school_progress_periods ENABLE ROW LEVEL SECURITY;

--
-- Name: school_registration_phone_verifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.school_registration_phone_verifications ENABLE ROW LEVEL SECURITY;

--
-- Name: schools; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

--
-- Name: schools schools_select_own_school_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY schools_select_own_school_admin ON public.schools FOR SELECT USING (((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'school_admin'::text) AND ((id)::text = COALESCE((auth.jwt() ->> 'schoolId'::text), (auth.uid())::text))));


--
-- Name: schools schools_select_teacher_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY schools_select_teacher_scope ON public.schools FOR SELECT USING (((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'teacher'::text) AND ((id)::text = COALESCE((auth.jwt() ->> 'schoolId'::text), ''::text))));


--
-- Name: schools schools_update_own_school_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY schools_update_own_school_admin ON public.schools FOR UPDATE USING (((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'school_admin'::text) AND ((id)::text = COALESCE((auth.jwt() ->> 'schoolId'::text), (auth.uid())::text)))) WITH CHECK (((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'school_admin'::text) AND ((id)::text = COALESCE((auth.jwt() ->> 'schoolId'::text), (auth.uid())::text))));


--
-- Name: settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

--
-- Name: settings settings_insert_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY settings_insert_owner ON public.settings FOR INSERT WITH CHECK ((student_id = auth.uid()));


--
-- Name: settings settings_select_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY settings_select_owner ON public.settings FOR SELECT USING ((student_id = auth.uid()));


--
-- Name: settings settings_select_with_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY settings_select_with_staff ON public.settings FOR SELECT USING (((student_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.class_members cm
  WHERE ((cm.student_id = settings.student_id) AND ((cm.teacher_id = auth.uid()) OR (cm.parent_id = auth.uid())))))));


--
-- Name: settings settings_update_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY settings_update_owner ON public.settings FOR UPDATE USING ((student_id = auth.uid())) WITH CHECK ((student_id = auth.uid()));


--
-- Name: strict_exam_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.strict_exam_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: strict_test_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.strict_test_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: student_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: student_accounts student_accounts_insert_school_admin_or_teacher_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_accounts_insert_school_admin_or_teacher_scope ON public.student_accounts FOR INSERT WITH CHECK ((((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'school_admin'::text) AND ((school_id)::text = COALESCE((auth.jwt() ->> 'schoolId'::text), (auth.uid())::text))) OR ((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'teacher'::text) AND ((school_id)::text = COALESCE((auth.jwt() ->> 'schoolId'::text), ''::text)) AND (((teacher_id)::text = COALESCE((auth.jwt() ->> 'sub'::text), (auth.uid())::text)) OR (teacher_id IS NULL)))));


--
-- Name: student_accounts student_accounts_select_school_admin_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_accounts_select_school_admin_scope ON public.student_accounts FOR SELECT USING (((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'school_admin'::text) AND ((school_id)::text = COALESCE((auth.jwt() ->> 'schoolId'::text), (auth.uid())::text))));


--
-- Name: student_accounts student_accounts_select_self_student; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_accounts_select_self_student ON public.student_accounts FOR SELECT USING (((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'student'::text) AND ((student_id)::text = COALESCE((auth.jwt() ->> 'sub'::text), (auth.uid())::text))));


--
-- Name: student_accounts student_accounts_select_teacher_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_accounts_select_teacher_scope ON public.student_accounts FOR SELECT USING (((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'teacher'::text) AND ((school_id)::text = COALESCE((auth.jwt() ->> 'schoolId'::text), ''::text)) AND (((teacher_id)::text = COALESCE((auth.jwt() ->> 'sub'::text), (auth.uid())::text)) OR (teacher_id IS NULL))));


--
-- Name: student_accounts student_accounts_update_school_admin_or_teacher_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_accounts_update_school_admin_or_teacher_scope ON public.student_accounts FOR UPDATE USING ((((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'school_admin'::text) AND ((school_id)::text = COALESCE((auth.jwt() ->> 'schoolId'::text), (auth.uid())::text))) OR ((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'teacher'::text) AND ((school_id)::text = COALESCE((auth.jwt() ->> 'schoolId'::text), ''::text)) AND (((teacher_id)::text = COALESCE((auth.jwt() ->> 'sub'::text), (auth.uid())::text)) OR (teacher_id IS NULL))))) WITH CHECK ((((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'school_admin'::text) AND ((school_id)::text = COALESCE((auth.jwt() ->> 'schoolId'::text), (auth.uid())::text))) OR ((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'teacher'::text) AND ((school_id)::text = COALESCE((auth.jwt() ->> 'schoolId'::text), ''::text)) AND (((teacher_id)::text = COALESCE((auth.jwt() ->> 'sub'::text), (auth.uid())::text)) OR (teacher_id IS NULL)))));


--
-- Name: student_lesson_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_lesson_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: student_lesson_progress student_lesson_progress_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_lesson_progress_insert ON public.student_lesson_progress FOR INSERT WITH CHECK (((teacher_id = auth.uid()) OR (student_id = auth.uid())));


--
-- Name: student_lesson_progress student_lesson_progress_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_lesson_progress_select ON public.student_lesson_progress FOR SELECT USING (((student_id = auth.uid()) OR (teacher_id = auth.uid())));


--
-- Name: student_lesson_progress student_lesson_progress_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_lesson_progress_update ON public.student_lesson_progress FOR UPDATE USING (((student_id = auth.uid()) OR (teacher_id = auth.uid()))) WITH CHECK (((student_id = auth.uid()) OR (teacher_id = auth.uid())));


--
-- Name: student_push_devices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_push_devices ENABLE ROW LEVEL SECURITY;

--
-- Name: student_rewards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_rewards ENABLE ROW LEVEL SECURITY;

--
-- Name: student_rewards student_rewards_select_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_rewards_select_owner ON public.student_rewards FOR SELECT USING ((student_id = auth.uid()));


--
-- Name: students; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

--
-- Name: students students_insert_school_admin_or_teacher_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY students_insert_school_admin_or_teacher_scope ON public.students FOR INSERT WITH CHECK ((((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'school_admin'::text) AND ((school_id)::text = COALESCE((auth.jwt() ->> 'schoolId'::text), (auth.uid())::text))) OR ((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'teacher'::text) AND ((school_id)::text = COALESCE((auth.jwt() ->> 'schoolId'::text), ''::text)) AND ((teacher_id IS NULL) OR ((teacher_id)::text = COALESCE((auth.jwt() ->> 'sub'::text), (auth.uid())::text))))));


--
-- Name: students students_select_school_admin_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY students_select_school_admin_scope ON public.students FOR SELECT USING (((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'school_admin'::text) AND ((school_id)::text = COALESCE((auth.jwt() ->> 'schoolId'::text), (auth.uid())::text))));


--
-- Name: students students_select_self_student; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY students_select_self_student ON public.students FOR SELECT USING (((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'student'::text) AND ((id)::text = COALESCE((auth.jwt() ->> 'sub'::text), (auth.uid())::text))));


--
-- Name: students students_select_teacher_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY students_select_teacher_scope ON public.students FOR SELECT USING (((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'teacher'::text) AND (((teacher_id)::text = COALESCE((auth.jwt() ->> 'sub'::text), (auth.uid())::text)) OR ((school_id)::text = COALESCE((auth.jwt() ->> 'schoolId'::text), ''::text)))));


--
-- Name: students students_update_school_admin_or_teacher_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY students_update_school_admin_or_teacher_scope ON public.students FOR UPDATE USING ((((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'school_admin'::text) AND ((school_id)::text = COALESCE((auth.jwt() ->> 'schoolId'::text), (auth.uid())::text))) OR ((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'teacher'::text) AND ((school_id)::text = COALESCE((auth.jwt() ->> 'schoolId'::text), ''::text)) AND (((teacher_id)::text = COALESCE((auth.jwt() ->> 'sub'::text), (auth.uid())::text)) OR (teacher_id IS NULL))))) WITH CHECK ((((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'school_admin'::text) AND ((school_id)::text = COALESCE((auth.jwt() ->> 'schoolId'::text), (auth.uid())::text))) OR ((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'teacher'::text) AND ((school_id)::text = COALESCE((auth.jwt() ->> 'schoolId'::text), ''::text)) AND (((teacher_id)::text = COALESCE((auth.jwt() ->> 'sub'::text), (auth.uid())::text)) OR (teacher_id IS NULL)))));


--
-- Name: support_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: support_messages support_student_read_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY support_student_read_messages ON public.support_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.support_tickets t
  WHERE (t.id = support_messages.ticket_id))));


--
-- Name: support_tickets support_student_read_ticket; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY support_student_read_ticket ON public.support_tickets FOR SELECT TO authenticated USING (((requester_role = 'student'::text) AND ((auth.jwt() ->> 'role'::text) = 'student'::text) AND ((requester_id)::text = (auth.jwt() ->> 'sub'::text)) AND ((school_id)::text = (auth.jwt() ->> 'schoolId'::text))));


--
-- Name: support_tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: teachers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;

--
-- Name: teachers teachers_insert_school_admin_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teachers_insert_school_admin_scope ON public.teachers FOR INSERT WITH CHECK (((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'school_admin'::text) AND ((school_id)::text = COALESCE((auth.jwt() ->> 'schoolId'::text), (auth.uid())::text))));


--
-- Name: teachers teachers_select_school_admin_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teachers_select_school_admin_scope ON public.teachers FOR SELECT USING (((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'school_admin'::text) AND ((school_id)::text = COALESCE((auth.jwt() ->> 'schoolId'::text), (auth.uid())::text))));


--
-- Name: teachers teachers_select_self_teacher; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teachers_select_self_teacher ON public.teachers FOR SELECT USING (((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'teacher'::text) AND ((id)::text = COALESCE((auth.jwt() ->> 'sub'::text), (auth.uid())::text))));


--
-- Name: teachers teachers_update_school_admin_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teachers_update_school_admin_scope ON public.teachers FOR UPDATE USING (((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'school_admin'::text) AND ((school_id)::text = COALESCE((auth.jwt() ->> 'schoolId'::text), (auth.uid())::text)))) WITH CHECK (((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'school_admin'::text) AND ((school_id)::text = COALESCE((auth.jwt() ->> 'schoolId'::text), (auth.uid())::text))));


--
-- Name: teachers teachers_update_self_teacher; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teachers_update_self_teacher ON public.teachers FOR UPDATE USING (((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'teacher'::text) AND ((id)::text = COALESCE((auth.jwt() ->> 'sub'::text), (auth.uid())::text)))) WITH CHECK (((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'teacher'::text) AND ((id)::text = COALESCE((auth.jwt() ->> 'sub'::text), (auth.uid())::text))));


--
-- Name: test_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.test_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: test_attempts test_attempts_insert_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY test_attempts_insert_owner ON public.test_attempts FOR INSERT WITH CHECK ((student_id = auth.uid()));


--
-- Name: test_attempts test_attempts_select_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY test_attempts_select_owner ON public.test_attempts FOR SELECT USING ((student_id = auth.uid()));


--
-- Name: test_attempts test_attempts_update_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY test_attempts_update_owner ON public.test_attempts FOR UPDATE USING ((student_id = auth.uid())) WITH CHECK ((student_id = auth.uid()));


--
-- Name: test_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.test_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: tests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION orchard_assign_school_trees(p_school_id uuid, p_subject_keys text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.orchard_assign_school_trees(p_school_id uuid, p_subject_keys text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.orchard_assign_school_trees(p_school_id uuid, p_subject_keys text[]) TO service_role;


--
-- Name: FUNCTION owner_delete_school(p_school_id uuid, p_confirmation text, p_student_ids text[], p_teacher_ids text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.owner_delete_school(p_school_id uuid, p_confirmation text, p_student_ids text[], p_teacher_ids text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.owner_delete_school(p_school_id uuid, p_confirmation text, p_student_ids text[], p_teacher_ids text[]) TO service_role;


--
-- Name: FUNCTION school_enquiry_append(p_enquiry_id uuid, p_session_hash text, p_message_id uuid, p_author_role text, p_content text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.school_enquiry_append(p_enquiry_id uuid, p_session_hash text, p_message_id uuid, p_author_role text, p_content text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.school_enquiry_append(p_enquiry_id uuid, p_session_hash text, p_message_id uuid, p_author_role text, p_content text) TO service_role;


--
-- Name: FUNCTION school_enquiry_verify(p_challenge_id uuid, p_code_hash text, p_session_hash text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.school_enquiry_verify(p_challenge_id uuid, p_code_hash text, p_session_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.school_enquiry_verify(p_challenge_id uuid, p_code_hash text, p_session_hash text) TO service_role;


--
-- Name: FUNCTION support_append_message(p_ticket_id uuid, p_requester_id uuid, p_school_id uuid, p_message_id uuid, p_author_role text, p_content text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.support_append_message(p_ticket_id uuid, p_requester_id uuid, p_school_id uuid, p_message_id uuid, p_author_role text, p_content text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.support_append_message(p_ticket_id uuid, p_requester_id uuid, p_school_id uuid, p_message_id uuid, p_author_role text, p_content text) TO service_role;


--
-- Name: FUNCTION support_create_ticket(p_ticket jsonb, p_messages jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.support_create_ticket(p_ticket jsonb, p_messages jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.support_create_ticket(p_ticket jsonb, p_messages jsonb) TO service_role;


--
-- Name: TABLE announcements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.announcements TO anon;
GRANT ALL ON TABLE public.announcements TO authenticated;
GRANT ALL ON TABLE public.announcements TO service_role;


--
-- Name: TABLE chapter_growth; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chapter_growth TO anon;
GRANT ALL ON TABLE public.chapter_growth TO authenticated;
GRANT ALL ON TABLE public.chapter_growth TO service_role;


--
-- Name: TABLE class_attendance; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.class_attendance TO service_role;


--
-- Name: TABLE class_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.class_members TO service_role;


--
-- Name: TABLE conversation_snapshots; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.conversation_snapshots TO service_role;


--
-- Name: TABLE events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.events TO anon;
GRANT ALL ON TABLE public.events TO authenticated;
GRANT ALL ON TABLE public.events TO service_role;


--
-- Name: TABLE flashcard_chapter_completions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.flashcard_chapter_completions TO service_role;


--
-- Name: TABLE flashcard_decks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.flashcard_decks TO service_role;


--
-- Name: TABLE flashcard_progress; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.flashcard_progress TO service_role;


--
-- Name: TABLE flashcards; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.flashcards TO service_role;


--
-- Name: TABLE game_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.game_sessions TO service_role;


--
-- Name: TABLE homework; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.homework TO anon;
GRANT ALL ON TABLE public.homework TO authenticated;
GRANT ALL ON TABLE public.homework TO service_role;


--
-- Name: TABLE homework_attempts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.homework_attempts TO anon;
GRANT ALL ON TABLE public.homework_attempts TO authenticated;
GRANT ALL ON TABLE public.homework_attempts TO service_role;


--
-- Name: TABLE lesson_chunks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lesson_chunks TO anon;
GRANT ALL ON TABLE public.lesson_chunks TO authenticated;
GRANT ALL ON TABLE public.lesson_chunks TO service_role;


--
-- Name: TABLE lesson_class_visibility; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lesson_class_visibility TO anon;
GRANT ALL ON TABLE public.lesson_class_visibility TO authenticated;
GRANT ALL ON TABLE public.lesson_class_visibility TO service_role;


--
-- Name: TABLE lesson_documents; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lesson_documents TO anon;
GRANT ALL ON TABLE public.lesson_documents TO authenticated;
GRANT ALL ON TABLE public.lesson_documents TO service_role;


--
-- Name: TABLE lesson_stories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lesson_stories TO service_role;


--
-- Name: TABLE lesson_story_progress; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lesson_story_progress TO service_role;


--
-- Name: TABLE lessons; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lessons TO anon;
GRANT ALL ON TABLE public.lessons TO authenticated;
GRANT ALL ON TABLE public.lessons TO service_role;


--
-- Name: TABLE memories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.memories TO anon;
GRANT ALL ON TABLE public.memories TO authenticated;
GRANT ALL ON TABLE public.memories TO service_role;


--
-- Name: TABLE messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.messages TO anon;
GRANT ALL ON TABLE public.messages TO authenticated;
GRANT ALL ON TABLE public.messages TO service_role;


--
-- Name: TABLE orchard_activity; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.orchard_activity TO anon;
GRANT ALL ON TABLE public.orchard_activity TO authenticated;
GRANT ALL ON TABLE public.orchard_activity TO service_role;


--
-- Name: TABLE orchard_chapters; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.orchard_chapters TO anon;
GRANT ALL ON TABLE public.orchard_chapters TO authenticated;
GRANT ALL ON TABLE public.orchard_chapters TO service_role;


--
-- Name: TABLE orchard_profile; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.orchard_profile TO anon;
GRANT ALL ON TABLE public.orchard_profile TO authenticated;
GRANT ALL ON TABLE public.orchard_profile TO service_role;


--
-- Name: TABLE orchard_reviews; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.orchard_reviews TO anon;
GRANT ALL ON TABLE public.orchard_reviews TO authenticated;
GRANT ALL ON TABLE public.orchard_reviews TO service_role;


--
-- Name: TABLE orchard_school_tree_assignments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.orchard_school_tree_assignments TO service_role;


--
-- Name: TABLE orchard_subjects; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.orchard_subjects TO anon;
GRANT ALL ON TABLE public.orchard_subjects TO authenticated;
GRANT ALL ON TABLE public.orchard_subjects TO service_role;


--
-- Name: TABLE orchard_trees; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.orchard_trees TO anon;
GRANT ALL ON TABLE public.orchard_trees TO authenticated;
GRANT ALL ON TABLE public.orchard_trees TO service_role;


--
-- Name: TABLE progress_metrics; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.progress_metrics TO anon;
GRANT ALL ON TABLE public.progress_metrics TO authenticated;
GRANT ALL ON TABLE public.progress_metrics TO service_role;


--
-- Name: TABLE quiz_decks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.quiz_decks TO service_role;


--
-- Name: TABLE quiz_questions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.quiz_questions TO service_role;


--
-- Name: TABLE redemptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.redemptions TO anon;
GRANT ALL ON TABLE public.redemptions TO authenticated;
GRANT ALL ON TABLE public.redemptions TO service_role;


--
-- Name: TABLE registration_email_verifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.registration_email_verifications TO service_role;


--
-- Name: TABLE registration_invites; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.registration_invites TO service_role;


--
-- Name: TABLE registration_phone_verifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.registration_phone_verifications TO service_role;


--
-- Name: TABLE report_exam_celebrations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.report_exam_celebrations TO anon;
GRANT ALL ON TABLE public.report_exam_celebrations TO authenticated;
GRANT ALL ON TABLE public.report_exam_celebrations TO service_role;


--
-- Name: TABLE report_exam_marks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.report_exam_marks TO anon;
GRANT ALL ON TABLE public.report_exam_marks TO authenticated;
GRANT ALL ON TABLE public.report_exam_marks TO service_role;


--
-- Name: TABLE report_exams; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.report_exams TO anon;
GRANT ALL ON TABLE public.report_exams TO authenticated;
GRANT ALL ON TABLE public.report_exams TO service_role;


--
-- Name: TABLE rewards; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.rewards TO service_role;


--
-- Name: TABLE school_asset_registry; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.school_asset_registry TO service_role;


--
-- Name: TABLE school_enquiries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.school_enquiries TO service_role;


--
-- Name: TABLE school_enquiry_challenges; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.school_enquiry_challenges TO service_role;


--
-- Name: TABLE school_enquiry_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.school_enquiry_messages TO service_role;


--
-- Name: TABLE school_profile_email_verifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.school_profile_email_verifications TO service_role;


--
-- Name: TABLE school_progress_periods; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.school_progress_periods TO service_role;


--
-- Name: TABLE school_registration_phone_verifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.school_registration_phone_verifications TO service_role;


--
-- Name: TABLE schools; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.schools TO anon;
GRANT ALL ON TABLE public.schools TO authenticated;
GRANT ALL ON TABLE public.schools TO service_role;


--
-- Name: TABLE settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.settings TO anon;
GRANT ALL ON TABLE public.settings TO authenticated;
GRANT ALL ON TABLE public.settings TO service_role;


--
-- Name: TABLE strict_exam_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.strict_exam_sessions TO service_role;


--
-- Name: TABLE strict_test_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.strict_test_settings TO service_role;


--
-- Name: TABLE student_accounts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.student_accounts TO anon;
GRANT ALL ON TABLE public.student_accounts TO authenticated;
GRANT ALL ON TABLE public.student_accounts TO service_role;


--
-- Name: TABLE student_lesson_progress; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.student_lesson_progress TO anon;
GRANT ALL ON TABLE public.student_lesson_progress TO authenticated;
GRANT ALL ON TABLE public.student_lesson_progress TO service_role;


--
-- Name: TABLE student_push_devices; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.student_push_devices TO service_role;


--
-- Name: TABLE student_rewards; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.student_rewards TO anon;
GRANT ALL ON TABLE public.student_rewards TO authenticated;
GRANT ALL ON TABLE public.student_rewards TO service_role;


--
-- Name: TABLE students; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.students TO anon;
GRANT ALL ON TABLE public.students TO authenticated;
GRANT ALL ON TABLE public.students TO service_role;


--
-- Name: TABLE support_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.support_messages TO service_role;
GRANT SELECT ON TABLE public.support_messages TO authenticated;


--
-- Name: TABLE support_tickets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.support_tickets TO service_role;
GRANT SELECT ON TABLE public.support_tickets TO authenticated;


--
-- Name: TABLE teachers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.teachers TO anon;
GRANT ALL ON TABLE public.teachers TO authenticated;
GRANT ALL ON TABLE public.teachers TO service_role;


--
-- Name: TABLE test_attempts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.test_attempts TO anon;
GRANT ALL ON TABLE public.test_attempts TO authenticated;
GRANT ALL ON TABLE public.test_attempts TO service_role;


--
-- Name: TABLE test_questions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.test_questions TO service_role;


--
-- Name: TABLE tests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tests TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--


