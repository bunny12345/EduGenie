-- RLS policies for EduGenie (Supabase)
-- Run these in Supabase SQL editor or via psql as a privileged user.
-- Policies assume authenticated JWTs where auth.uid() returns the student's id.

-- Enable RLS on tables
ALTER TABLE IF EXISTS public.memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.homework ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.homework_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.progress_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.student_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.test_attempts ENABLE ROW LEVEL SECURITY;

-- Generic pattern: allow SELECT only for rows where student_id = auth.uid()
-- Allow INSERT/UPDATE/DELETE only when student_id matches auth.uid()

-- memories
DROP POLICY IF EXISTS "memories_select_by_owner" ON public.memories;
CREATE POLICY "memories_select_by_owner" ON public.memories
  FOR SELECT USING (student_id = auth.uid());
DROP POLICY IF EXISTS "memories_insert_owner" ON public.memories;
CREATE POLICY "memories_insert_owner" ON public.memories
  FOR INSERT WITH CHECK (student_id = auth.uid());
DROP POLICY IF EXISTS "memories_update_owner" ON public.memories;
CREATE POLICY "memories_update_owner" ON public.memories
  FOR UPDATE USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());
DROP POLICY IF EXISTS "memories_delete_owner" ON public.memories;
CREATE POLICY "memories_delete_owner" ON public.memories
  FOR DELETE USING (student_id = auth.uid());

-- homework
DROP POLICY IF EXISTS "homework_select_by_owner" ON public.homework;
CREATE POLICY "homework_select_by_owner" ON public.homework
  FOR SELECT USING (student_id = auth.uid());
DROP POLICY IF EXISTS "homework_insert_owner" ON public.homework;
CREATE POLICY "homework_insert_owner" ON public.homework
  FOR INSERT WITH CHECK (student_id = auth.uid());
DROP POLICY IF EXISTS "homework_update_owner" ON public.homework;
CREATE POLICY "homework_update_owner" ON public.homework
  FOR UPDATE USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());
DROP POLICY IF EXISTS "homework_delete_owner" ON public.homework;
CREATE POLICY "homework_delete_owner" ON public.homework
  FOR DELETE USING (student_id = auth.uid());

-- homework_attempts
DROP POLICY IF EXISTS "homework_attempts_select_owner" ON public.homework_attempts;
CREATE POLICY "homework_attempts_select_owner" ON public.homework_attempts
  FOR SELECT USING (student_id = auth.uid());
DROP POLICY IF EXISTS "homework_attempts_insert_owner" ON public.homework_attempts;
CREATE POLICY "homework_attempts_insert_owner" ON public.homework_attempts
  FOR INSERT WITH CHECK (student_id = auth.uid());
DROP POLICY IF EXISTS "homework_attempts_update_owner" ON public.homework_attempts;
CREATE POLICY "homework_attempts_update_owner" ON public.homework_attempts
  FOR UPDATE USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());

-- progress_metrics (read-only for owner)
DROP POLICY IF EXISTS "progress_metrics_select_owner" ON public.progress_metrics;
CREATE POLICY "progress_metrics_select_owner" ON public.progress_metrics
  FOR SELECT USING (student_id = auth.uid());

-- events (calendar)
DROP POLICY IF EXISTS "events_select_owner" ON public.events;
CREATE POLICY "events_select_owner" ON public.events
  FOR SELECT USING (student_id = auth.uid());
DROP POLICY IF EXISTS "events_insert_owner" ON public.events;
CREATE POLICY "events_insert_owner" ON public.events
  FOR INSERT WITH CHECK (student_id = auth.uid());
DROP POLICY IF EXISTS "events_update_owner" ON public.events;
CREATE POLICY "events_update_owner" ON public.events
  FOR UPDATE USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());
DROP POLICY IF EXISTS "events_delete_owner" ON public.events;
CREATE POLICY "events_delete_owner" ON public.events
  FOR DELETE USING (student_id = auth.uid());

-- student_rewards & redemptions
DROP POLICY IF EXISTS "student_rewards_select_owner" ON public.student_rewards;
CREATE POLICY "student_rewards_select_owner" ON public.student_rewards
  FOR SELECT USING (student_id = auth.uid());
DROP POLICY IF EXISTS "redemptions_select_owner" ON public.redemptions;
CREATE POLICY "redemptions_select_owner" ON public.redemptions
  FOR SELECT USING (student_id = auth.uid());
DROP POLICY IF EXISTS "redemptions_insert_owner" ON public.redemptions;
CREATE POLICY "redemptions_insert_owner" ON public.redemptions
  FOR INSERT WITH CHECK (student_id = auth.uid());

-- settings
DROP POLICY IF EXISTS "settings_select_owner" ON public.settings;
CREATE POLICY "settings_select_owner" ON public.settings
  FOR SELECT USING (student_id = auth.uid());
DROP POLICY IF EXISTS "settings_insert_owner" ON public.settings;
CREATE POLICY "settings_insert_owner" ON public.settings
  FOR INSERT WITH CHECK (student_id = auth.uid());
DROP POLICY IF EXISTS "settings_update_owner" ON public.settings;
CREATE POLICY "settings_update_owner" ON public.settings
  FOR UPDATE USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());

-- test_attempts
DROP POLICY IF EXISTS "test_attempts_select_owner" ON public.test_attempts;
CREATE POLICY "test_attempts_select_owner" ON public.test_attempts
  FOR SELECT USING (student_id = auth.uid());
DROP POLICY IF EXISTS "test_attempts_insert_owner" ON public.test_attempts;
CREATE POLICY "test_attempts_insert_owner" ON public.test_attempts
  FOR INSERT WITH CHECK (student_id = auth.uid());
DROP POLICY IF EXISTS "test_attempts_update_owner" ON public.test_attempts;
CREATE POLICY "test_attempts_update_owner" ON public.test_attempts
  FOR UPDATE USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());

-- Note: service_role key bypasses RLS. Use server-side service role for admin operations.
