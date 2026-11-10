-- Metadata only: no application records or secrets are returned.
WITH flagged(table_name) AS (
  VALUES ('rewards'), ('registration_invites'), ('conversation_snapshots'),
    ('tests'), ('test_questions'), ('flashcard_decks'), ('flashcards'),
    ('flashcard_progress'), ('game_sessions'), ('flashcard_chapter_completions'),
    ('class_members'), ('quiz_decks'), ('quiz_questions'),
    ('lesson_stories'), ('lesson_story_progress')
)
SELECT f.table_name,
  c.oid IS NOT NULL AS table_exists,
  c.relrowsecurity AS rls_enabled,
  has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES') AS anon_access,
  has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_any_column_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES') AS authenticated_access,
  has_table_privilege('service_role', c.oid, 'SELECT')
    AND has_table_privilege('service_role', c.oid, 'INSERT')
    AND has_table_privilege('service_role', c.oid, 'UPDATE')
    AND has_table_privilege('service_role', c.oid, 'DELETE') AS backend_access,
  (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS existing_policy_count
FROM flagged f
LEFT JOIN pg_namespace n ON n.nspname = 'public'
LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = f.table_name
ORDER BY f.table_name;
