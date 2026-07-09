-- Verify RLS setup for auth hierarchy tables
-- Targets: schools, teachers, students, student_accounts
--
-- Usage:
-- 1. Run the migration first.
-- 2. Run this script in Supabase SQL Editor.
-- 3. Replace placeholder IDs in the claim test blocks with real IDs from your project.

-- ------------------------------------------------------------
-- 1) RLS must be enabled + forced
-- ------------------------------------------------------------
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('schools', 'teachers', 'students', 'student_accounts')
ORDER BY c.relname;

-- ------------------------------------------------------------
-- 2) Policies expected on each target table
-- ------------------------------------------------------------
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('schools', 'teachers', 'students', 'student_accounts')
ORDER BY tablename, cmd, policyname;

-- ------------------------------------------------------------
-- 3) Quick policy counts by table + command
-- ------------------------------------------------------------
SELECT
  tablename,
  cmd,
  count(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('schools', 'teachers', 'students', 'student_accounts')
GROUP BY tablename, cmd
ORDER BY tablename, cmd;

-- ------------------------------------------------------------
-- 4) Claim-scoped visibility checks (manual placeholders)
--
-- IMPORTANT:
-- - These checks emulate authenticated JWT claims in SQL editor.
-- - Replace placeholders before running.
-- - You can run each block independently.
-- ------------------------------------------------------------

-- SCHOOL ADMIN scope check
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'role', 'school_admin',
    'sub', '00000000-0000-0000-0000-000000000001',
    'schoolId', 'b994994e-355c-435e-b28f-8e3d1c24d12b'
  )::text,
  true
);

SELECT 'school_admin schools visible' AS check_name, count(*) AS row_count FROM public.schools;
SELECT 'school_admin teachers visible' AS check_name, count(*) AS row_count FROM public.teachers;
SELECT 'school_admin students visible' AS check_name, count(*) AS row_count FROM public.students;
SELECT 'school_admin student_accounts visible' AS check_name, count(*) AS row_count FROM public.student_accounts;

-- TEACHER scope check
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'role', 'teacher',
    'sub', '4fae61b9-9221-436a-8003-d7fd0cc65378',
    'schoolId', 'b994994e-355c-435e-b28f-8e3d1c24d12b'
  )::text,
  true
);

SELECT 'teacher schools visible' AS check_name, count(*) AS row_count FROM public.schools;
SELECT 'teacher teachers visible' AS check_name, count(*) AS row_count FROM public.teachers;
SELECT 'teacher students visible' AS check_name, count(*) AS row_count FROM public.students;
SELECT 'teacher student_accounts visible' AS check_name, count(*) AS row_count FROM public.student_accounts;

-- STUDENT scope check
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'role', 'student',
    'sub', 'f83c44fc-d57f-48f9-9552-2ccfee4f4aed'
  )::text,
  true
);

SELECT 'student schools visible' AS check_name, count(*) AS row_count FROM public.schools;
SELECT 'student teachers visible' AS check_name, count(*) AS row_count FROM public.teachers;
SELECT 'student students visible' AS check_name, count(*) AS row_count FROM public.students;
SELECT 'student student_accounts visible' AS check_name, count(*) AS row_count FROM public.student_accounts;
-- ------------------------------------------------------------
-- 5) Optional: inspect current emulated claims in-session
-- ------------------------------------------------------------
SELECT current_setting('request.jwt.claims', true) AS active_claims;
