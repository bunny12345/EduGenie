-- Teacher grade assignments
-- Adds a `grades` array column to teachers so a school admin can assign the
-- classes (e.g. "Class 5" .. "Class 12") a teacher is responsible for. Teachers
-- then see the students registered in those classes within their school.

ALTER TABLE public.teachers
  ADD COLUMN IF NOT EXISTS grades text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.teachers.grades IS
  'Canonical class names this teacher handles, e.g. {"Class 5","Class 9"}. Used to scope the students a teacher can view.';
