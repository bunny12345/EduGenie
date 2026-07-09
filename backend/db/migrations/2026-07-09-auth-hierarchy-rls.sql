-- Migration: RLS policies for auth hierarchy tables
-- Targets: schools, teachers, students, student_accounts
--
-- JWT claim assumptions (from app auth service):
-- - role: 'school_admin' | 'teacher' | 'student'
-- - sub: current authenticated principal id
-- - schoolId: school id for school_admin and teacher tokens
--
-- Notes:
-- - service_role bypasses RLS automatically.
-- - this migration is idempotent via IF EXISTS / DROP POLICY IF EXISTS.

BEGIN;

-- Enable RLS
ALTER TABLE IF EXISTS public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.student_accounts ENABLE ROW LEVEL SECURITY;

-- Optional hardening: force RLS even for table owners (comment out if undesired)
ALTER TABLE IF EXISTS public.schools FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.teachers FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.students FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.student_accounts FORCE ROW LEVEL SECURITY;

-- -----------------------------
-- schools policies
-- -----------------------------
DROP POLICY IF EXISTS schools_select_own_school_admin ON public.schools;
CREATE POLICY schools_select_own_school_admin ON public.schools
  FOR SELECT
  USING (
    coalesce(auth.jwt() ->> 'role', '') = 'school_admin'
    AND id::text = coalesce(auth.jwt() ->> 'schoolId', auth.uid()::text)
  );

DROP POLICY IF EXISTS schools_select_teacher_scope ON public.schools;
CREATE POLICY schools_select_teacher_scope ON public.schools
  FOR SELECT
  USING (
    coalesce(auth.jwt() ->> 'role', '') = 'teacher'
    AND id::text = coalesce(auth.jwt() ->> 'schoolId', '')
  );

DROP POLICY IF EXISTS schools_update_own_school_admin ON public.schools;
CREATE POLICY schools_update_own_school_admin ON public.schools
  FOR UPDATE
  USING (
    coalesce(auth.jwt() ->> 'role', '') = 'school_admin'
    AND id::text = coalesce(auth.jwt() ->> 'schoolId', auth.uid()::text)
  )
  WITH CHECK (
    coalesce(auth.jwt() ->> 'role', '') = 'school_admin'
    AND id::text = coalesce(auth.jwt() ->> 'schoolId', auth.uid()::text)
  );

-- -----------------------------
-- teachers policies
-- -----------------------------
DROP POLICY IF EXISTS teachers_select_school_admin_scope ON public.teachers;
CREATE POLICY teachers_select_school_admin_scope ON public.teachers
  FOR SELECT
  USING (
    coalesce(auth.jwt() ->> 'role', '') = 'school_admin'
    AND school_id::text = coalesce(auth.jwt() ->> 'schoolId', auth.uid()::text)
  );

DROP POLICY IF EXISTS teachers_select_self_teacher ON public.teachers;
CREATE POLICY teachers_select_self_teacher ON public.teachers
  FOR SELECT
  USING (
    coalesce(auth.jwt() ->> 'role', '') = 'teacher'
    AND id::text = coalesce(auth.jwt() ->> 'sub', auth.uid()::text)
  );

DROP POLICY IF EXISTS teachers_insert_school_admin_scope ON public.teachers;
CREATE POLICY teachers_insert_school_admin_scope ON public.teachers
  FOR INSERT
  WITH CHECK (
    coalesce(auth.jwt() ->> 'role', '') = 'school_admin'
    AND school_id::text = coalesce(auth.jwt() ->> 'schoolId', auth.uid()::text)
  );

DROP POLICY IF EXISTS teachers_update_school_admin_scope ON public.teachers;
CREATE POLICY teachers_update_school_admin_scope ON public.teachers
  FOR UPDATE
  USING (
    coalesce(auth.jwt() ->> 'role', '') = 'school_admin'
    AND school_id::text = coalesce(auth.jwt() ->> 'schoolId', auth.uid()::text)
  )
  WITH CHECK (
    coalesce(auth.jwt() ->> 'role', '') = 'school_admin'
    AND school_id::text = coalesce(auth.jwt() ->> 'schoolId', auth.uid()::text)
  );

DROP POLICY IF EXISTS teachers_update_self_teacher ON public.teachers;
CREATE POLICY teachers_update_self_teacher ON public.teachers
  FOR UPDATE
  USING (
    coalesce(auth.jwt() ->> 'role', '') = 'teacher'
    AND id::text = coalesce(auth.jwt() ->> 'sub', auth.uid()::text)
  )
  WITH CHECK (
    coalesce(auth.jwt() ->> 'role', '') = 'teacher'
    AND id::text = coalesce(auth.jwt() ->> 'sub', auth.uid()::text)
  );

-- -----------------------------
-- students policies
-- -----------------------------
DROP POLICY IF EXISTS students_select_school_admin_scope ON public.students;
CREATE POLICY students_select_school_admin_scope ON public.students
  FOR SELECT
  USING (
    coalesce(auth.jwt() ->> 'role', '') = 'school_admin'
    AND school_id::text = coalesce(auth.jwt() ->> 'schoolId', auth.uid()::text)
  );

DROP POLICY IF EXISTS students_select_teacher_scope ON public.students;
CREATE POLICY students_select_teacher_scope ON public.students
  FOR SELECT
  USING (
    coalesce(auth.jwt() ->> 'role', '') = 'teacher'
    AND (
      teacher_id::text = coalesce(auth.jwt() ->> 'sub', auth.uid()::text)
      OR school_id::text = coalesce(auth.jwt() ->> 'schoolId', '')
    )
  );

DROP POLICY IF EXISTS students_select_self_student ON public.students;
CREATE POLICY students_select_self_student ON public.students
  FOR SELECT
  USING (
    coalesce(auth.jwt() ->> 'role', '') = 'student'
    AND id::text = coalesce(auth.jwt() ->> 'sub', auth.uid()::text)
  );

DROP POLICY IF EXISTS students_insert_school_admin_or_teacher_scope ON public.students;
CREATE POLICY students_insert_school_admin_or_teacher_scope ON public.students
  FOR INSERT
  WITH CHECK (
    (
      coalesce(auth.jwt() ->> 'role', '') = 'school_admin'
      AND school_id::text = coalesce(auth.jwt() ->> 'schoolId', auth.uid()::text)
    )
    OR
    (
      coalesce(auth.jwt() ->> 'role', '') = 'teacher'
      AND school_id::text = coalesce(auth.jwt() ->> 'schoolId', '')
      AND (
        teacher_id IS NULL
        OR teacher_id::text = coalesce(auth.jwt() ->> 'sub', auth.uid()::text)
      )
    )
  );

DROP POLICY IF EXISTS students_update_school_admin_or_teacher_scope ON public.students;
CREATE POLICY students_update_school_admin_or_teacher_scope ON public.students
  FOR UPDATE
  USING (
    (
      coalesce(auth.jwt() ->> 'role', '') = 'school_admin'
      AND school_id::text = coalesce(auth.jwt() ->> 'schoolId', auth.uid()::text)
    )
    OR
    (
      coalesce(auth.jwt() ->> 'role', '') = 'teacher'
      AND school_id::text = coalesce(auth.jwt() ->> 'schoolId', '')
      AND (
        teacher_id::text = coalesce(auth.jwt() ->> 'sub', auth.uid()::text)
        OR teacher_id IS NULL
      )
    )
  )
  WITH CHECK (
    (
      coalesce(auth.jwt() ->> 'role', '') = 'school_admin'
      AND school_id::text = coalesce(auth.jwt() ->> 'schoolId', auth.uid()::text)
    )
    OR
    (
      coalesce(auth.jwt() ->> 'role', '') = 'teacher'
      AND school_id::text = coalesce(auth.jwt() ->> 'schoolId', '')
      AND (
        teacher_id::text = coalesce(auth.jwt() ->> 'sub', auth.uid()::text)
        OR teacher_id IS NULL
      )
    )
  );

-- -----------------------------
-- student_accounts policies
-- -----------------------------
DROP POLICY IF EXISTS student_accounts_select_school_admin_scope ON public.student_accounts;
CREATE POLICY student_accounts_select_school_admin_scope ON public.student_accounts
  FOR SELECT
  USING (
    coalesce(auth.jwt() ->> 'role', '') = 'school_admin'
    AND school_id::text = coalesce(auth.jwt() ->> 'schoolId', auth.uid()::text)
  );

DROP POLICY IF EXISTS student_accounts_select_teacher_scope ON public.student_accounts;
CREATE POLICY student_accounts_select_teacher_scope ON public.student_accounts
  FOR SELECT
  USING (
    coalesce(auth.jwt() ->> 'role', '') = 'teacher'
    AND school_id::text = coalesce(auth.jwt() ->> 'schoolId', '')
    AND (
      teacher_id::text = coalesce(auth.jwt() ->> 'sub', auth.uid()::text)
      OR teacher_id IS NULL
    )
  );

DROP POLICY IF EXISTS student_accounts_select_self_student ON public.student_accounts;
CREATE POLICY student_accounts_select_self_student ON public.student_accounts
  FOR SELECT
  USING (
    coalesce(auth.jwt() ->> 'role', '') = 'student'
    AND student_id::text = coalesce(auth.jwt() ->> 'sub', auth.uid()::text)
  );

DROP POLICY IF EXISTS student_accounts_insert_school_admin_or_teacher_scope ON public.student_accounts;
CREATE POLICY student_accounts_insert_school_admin_or_teacher_scope ON public.student_accounts
  FOR INSERT
  WITH CHECK (
    (
      coalesce(auth.jwt() ->> 'role', '') = 'school_admin'
      AND school_id::text = coalesce(auth.jwt() ->> 'schoolId', auth.uid()::text)
    )
    OR
    (
      coalesce(auth.jwt() ->> 'role', '') = 'teacher'
      AND school_id::text = coalesce(auth.jwt() ->> 'schoolId', '')
      AND (
        teacher_id::text = coalesce(auth.jwt() ->> 'sub', auth.uid()::text)
        OR teacher_id IS NULL
      )
    )
  );

DROP POLICY IF EXISTS student_accounts_update_school_admin_or_teacher_scope ON public.student_accounts;
CREATE POLICY student_accounts_update_school_admin_or_teacher_scope ON public.student_accounts
  FOR UPDATE
  USING (
    (
      coalesce(auth.jwt() ->> 'role', '') = 'school_admin'
      AND school_id::text = coalesce(auth.jwt() ->> 'schoolId', auth.uid()::text)
    )
    OR
    (
      coalesce(auth.jwt() ->> 'role', '') = 'teacher'
      AND school_id::text = coalesce(auth.jwt() ->> 'schoolId', '')
      AND (
        teacher_id::text = coalesce(auth.jwt() ->> 'sub', auth.uid()::text)
        OR teacher_id IS NULL
      )
    )
  )
  WITH CHECK (
    (
      coalesce(auth.jwt() ->> 'role', '') = 'school_admin'
      AND school_id::text = coalesce(auth.jwt() ->> 'schoolId', auth.uid()::text)
    )
    OR
    (
      coalesce(auth.jwt() ->> 'role', '') = 'teacher'
      AND school_id::text = coalesce(auth.jwt() ->> 'schoolId', '')
      AND (
        teacher_id::text = coalesce(auth.jwt() ->> 'sub', auth.uid()::text)
        OR teacher_id IS NULL
      )
    )
  );

COMMIT;
