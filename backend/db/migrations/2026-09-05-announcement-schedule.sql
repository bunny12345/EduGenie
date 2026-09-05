-- Announcements table + scheduling
-- The `announcements` table was referenced by the backend but never actually
-- created in Supabase (posts silently fell back to the in-memory local feed).
-- This creates it with the columns the backend already reads/writes, plus
-- optional start/end timestamps so a teacher can schedule an announcement to
-- only be visible to students during a specific time window. The schedule
-- columns are nullable — an announcement with no schedule stays visible
-- immediately and indefinitely, same as before.

CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'Announcement',
  message text NOT NULL DEFAULT '',
  audience text NOT NULL DEFAULT 'students',
  target_class text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS start_at timestamptz,
  ADD COLUMN IF NOT EXISTS end_at timestamptz;

COMMENT ON COLUMN public.announcements.start_at IS
  'Optional — announcement is hidden from students until this time.';
COMMENT ON COLUMN public.announcements.end_at IS
  'Optional — announcement is hidden from students after this time.';

-- Backend always writes/reads via the service role key (bypasses RLS), so a
-- permissive read-only policy here is only a safety net for any future direct
-- client query — announcement content is broadcast, not per-user sensitive data.
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "announcements_select_authenticated" ON public.announcements;
CREATE POLICY "announcements_select_authenticated" ON public.announcements
  FOR SELECT USING (auth.role() = 'authenticated');
