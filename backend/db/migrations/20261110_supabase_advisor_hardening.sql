-- Backend-only tables: preserve existing policies, data and service-role access.
-- Confirm the deployed backend has SUPABASE_SERVICE_ROLE_KEY before applying.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $hardening$
DECLARE
  table_name text;
  table_oid regclass;
  column_names text;
  client_role text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role' AND rolbypassrls) THEN
    RAISE EXCEPTION 'Expected Supabase service_role with BYPASSRLS';
  END IF;

  FOREACH table_name IN ARRAY ARRAY[
    'rewards', 'registration_invites', 'conversation_snapshots',
    'tests', 'test_questions', 'flashcard_decks', 'flashcards',
    'flashcard_progress', 'game_sessions', 'flashcard_chapter_completions',
    'class_members', 'quiz_decks', 'quiz_questions',
    'lesson_stories', 'lesson_story_progress'
  ] LOOP
    table_oid := to_regclass(format('public.%I', table_name));
    IF table_oid IS NULL THEN
      RAISE EXCEPTION 'Expected flagged table public.% is missing; inspect the target project', table_name;
    END IF;
    IF NOT has_table_privilege('service_role', table_oid, 'SELECT')
      OR NOT has_table_privilege('service_role', table_oid, 'INSERT')
      OR NOT has_table_privilege('service_role', table_oid, 'UPDATE')
      OR NOT has_table_privilege('service_role', table_oid, 'DELETE') THEN
      RAISE EXCEPTION 'service_role lacks backend privileges on public.%', table_name;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);

    -- Table-level REVOKE does not remove previously granted column privileges.
    SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum)
      INTO column_names
      FROM pg_attribute
      WHERE attrelid = table_oid AND attnum > 0 AND NOT attisdropped;
    EXECUTE format(
      'REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM PUBLIC, anon, authenticated',
      column_names, table_name
    );

    FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_table_privilege(client_role, table_oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        OR has_any_column_privilege(client_role, table_oid, 'SELECT,INSERT,UPDATE,REFERENCES') THEN
        RAISE EXCEPTION 'Inherited privileges still expose public.% to %; inspect role memberships', table_name, client_role;
      END IF;
    END LOOP;
  END LOOP;
END
$hardening$;

COMMIT;
