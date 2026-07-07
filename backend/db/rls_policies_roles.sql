-- RLS policies with Teacher/Parent role variants
-- Assumes a mapping table `class_members` linking students to teachers and parents.
-- Create mapping table (run as admin):
CREATE TABLE IF NOT EXISTS public.class_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id text,
  student_id uuid NOT NULL,
  teacher_id uuid,
  parent_id uuid,
  created_at timestamptz DEFAULT now()
);

-- Example: allow teachers or parents to SELECT rows for students they are mapped to
-- Pattern used below: rows are accessible when
-- 1) the student's own UID matches auth.uid(), OR
-- 2) there exists a class_members row mapping that student to the authenticated teacher/parent

-- memories: allow teacher/parent access to student memories
DROP POLICY IF EXISTS "memories_select_with_staff" ON public.memories;
CREATE POLICY "memories_select_with_staff" ON public.memories
  FOR SELECT USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.class_members cm
      WHERE cm.student_id = public.memories.student_id
        AND (cm.teacher_id = auth.uid() OR cm.parent_id = auth.uid())
    )
  );

-- homework: teacher should be able to view homework for students they teach
DROP POLICY IF EXISTS "homework_select_with_staff" ON public.homework;
CREATE POLICY "homework_select_with_staff" ON public.homework
  FOR SELECT USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.class_members cm
      WHERE cm.student_id = public.homework.student_id
        AND (cm.teacher_id = auth.uid() OR cm.parent_id = auth.uid())
    )
  );

-- progress_metrics: teachers can read student progress
DROP POLICY IF EXISTS "progress_metrics_select_with_staff" ON public.progress_metrics;
CREATE POLICY "progress_metrics_select_with_staff" ON public.progress_metrics
  FOR SELECT USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.class_members cm
      WHERE cm.student_id = public.progress_metrics.student_id
        AND (cm.teacher_id = auth.uid() OR cm.parent_id = auth.uid())
    )
  );

-- events: teachers/parents can view/create events for students they are mapped to
DROP POLICY IF EXISTS "events_select_with_staff" ON public.events;
CREATE POLICY "events_select_with_staff" ON public.events
  FOR SELECT USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.class_members cm
      WHERE cm.student_id = public.events.student_id
        AND (cm.teacher_id = auth.uid() OR cm.parent_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "events_insert_with_staff" ON public.events;
CREATE POLICY "events_insert_with_staff" ON public.events
  FOR INSERT WITH CHECK (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.class_members cm
      WHERE cm.student_id = NEW.student_id
        AND (cm.teacher_id = auth.uid() OR cm.parent_id = auth.uid())
    )
  );

-- settings: allow parents/teachers to read settings but restrict updates to owner or admins
DROP POLICY IF EXISTS "settings_select_with_staff" ON public.settings;
CREATE POLICY "settings_select_with_staff" ON public.settings
  FOR SELECT USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.class_members cm
      WHERE cm.student_id = public.settings.student_id
        AND (cm.teacher_id = auth.uid() OR cm.parent_id = auth.uid())
    )
  );

-- For UPDATE/INSERT on sensitive tables prefer stricter checks:
-- Only the student (or service role) should update sensitive personal data.

-- Notes:
-- - `auth.uid()` returns the authenticated user's uid from the JWT.
-- - Keep `class_members` maintenance in your application or admin UI.
-- - For teacher/parent roles backed by Supabase Auth, ensure teachers/parents have their own accounts and their UIDs are stored in `class_members.teacher_id` / `parent_id`.
-- - Service role keys bypass RLS and should be used only server-side for admin tasks.
