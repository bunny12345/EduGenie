-- Optional student contact/profile fields
-- Adds nullable date_of_birth, phone and email columns to students (and the
-- mirrored student_accounts row) so a school admin can optionally capture
-- them during manual student registration. All optional — existing rows and
-- registrations that omit them are unaffected.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE public.student_accounts
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text;
