-- Migration: The Knowledge Orchard
-- Phase 1: Gamified subject-tree growth model (seed -> golden fruit), health
--          mechanics (water/sunlight/fertilizer/roots), spaced-repetition
--          review scheduling, and per-student orchard currencies.
-- Idempotent and safe to re-run.

BEGIN;

-- ---------------------------------------------------------------------------
-- orchard_subjects: catalog mapping each subject to its tree + fruit identity.
-- One row per subject (shared across all students). Static reference data.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orchard_subjects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_key     text NOT NULL UNIQUE,      -- e.g. 'mathematics'
  display_name    text NOT NULL,             -- e.g. 'Mathematics'
  tree_type       text NOT NULL,             -- e.g. 'oak', 'crystal', 'cherry_blossom', 'banyan', 'digital', 'mango'
  fruit_type      text NOT NULL,             -- e.g. 'golden_apple', 'blue_crystal', 'pink_cherry', 'wisdom_fruit', 'pixel_fruit', 'mango'
  fruit_emoji     text NOT NULL DEFAULT '🍎',
  tree_emoji      text NOT NULL DEFAULT '🌳',
  accent_color    text NOT NULL DEFAULT '#22c55e',
  order_index     integer NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orchard_subjects_order
  ON public.orchard_subjects(order_index);

-- ---------------------------------------------------------------------------
-- orchard_chapters: each chapter is one seed. Scoped by subject + class/board.
-- Optionally linked to a teacher lesson later (lesson_id nullable for now).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orchard_chapters (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_key     text NOT NULL REFERENCES public.orchard_subjects(subject_key) ON DELETE CASCADE,
  class_name      text,
  board           text,
  chapter_number  integer NOT NULL DEFAULT 1,
  title           text NOT NULL,
  lesson_id       uuid,                        -- optional link to public.lessons(id), soft reference
  order_index     integer NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orchard_chapters_subject
  ON public.orchard_chapters(subject_key);
CREATE INDEX IF NOT EXISTS idx_orchard_chapters_class
  ON public.orchard_chapters(class_name);
CREATE INDEX IF NOT EXISTS idx_orchard_chapters_subject_class
  ON public.orchard_chapters(subject_key, class_name);

-- ---------------------------------------------------------------------------
-- orchard_profile: per-student orchard currencies + companion + streak.
-- Maps to the top bar (Water Drops / Sunshine / Gems) and companion widget.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orchard_profile (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      uuid NOT NULL UNIQUE REFERENCES public.students(id) ON DELETE CASCADE,
  water_drops     integer NOT NULL DEFAULT 0,
  sunshine        integer NOT NULL DEFAULT 0,
  gems            integer NOT NULL DEFAULT 0,
  companion_level integer NOT NULL DEFAULT 1,
  companion_xp    integer NOT NULL DEFAULT 0,
  companion_xp_max integer NOT NULL DEFAULT 1200,
  day_streak      integer NOT NULL DEFAULT 0,
  last_active_date date,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orchard_profile_student
  ON public.orchard_profile(student_id);

-- ---------------------------------------------------------------------------
-- orchard_trees: one tree per student per subject. Aggregated tree-level state
-- derived from its chapters, cached here for fast overview rendering.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orchard_trees (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id         uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_key        text NOT NULL REFERENCES public.orchard_subjects(subject_key) ON DELETE CASCADE,
  stage              text NOT NULL DEFAULT 'seed',   -- seed, sprout, young_plant, growing_tree, mature_tree, blossom, fruit, golden_fruit
  level              integer NOT NULL DEFAULT 1,      -- growth level (image shows "Level 4 of 7")
  max_level          integer NOT NULL DEFAULT 7,
  total_chapters     integer NOT NULL DEFAULT 0,
  completed_chapters integer NOT NULL DEFAULT 0,
  progress_pct       integer NOT NULL DEFAULT 0,      -- 0..100 overall subject progress
  roots_pct          integer NOT NULL DEFAULT 0,      -- understanding depth 0..100
  water_pct          integer NOT NULL DEFAULT 0,      -- 0..100
  sunlight_pct       integer NOT NULL DEFAULT 0,      -- 0..100
  fertilizer_pct     integer NOT NULL DEFAULT 0,      -- 0..100
  health             text NOT NULL DEFAULT 'healthy', -- healthy, thirsty, wilting
  season             text NOT NULL DEFAULT 'spring',  -- spring, summer, autumn, winter
  next_chapter_id    uuid,                            -- soft ref to orchard_chapters(id)
  last_activity_at   timestamptz,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now(),
  UNIQUE(student_id, subject_key)
);

CREATE INDEX IF NOT EXISTS idx_orchard_trees_student
  ON public.orchard_trees(student_id);
CREATE INDEX IF NOT EXISTS idx_orchard_trees_subject
  ON public.orchard_trees(subject_key);
CREATE INDEX IF NOT EXISTS idx_orchard_trees_student_subject
  ON public.orchard_trees(student_id, subject_key);

-- ---------------------------------------------------------------------------
-- chapter_growth: per-student per-chapter growth tracking. The core of the
-- seed -> golden fruit lifecycle. milestones jsonb records which learning
-- requirements have been met for each growth stage.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chapter_growth (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  chapter_id       uuid NOT NULL REFERENCES public.orchard_chapters(id) ON DELETE CASCADE,
  subject_key      text NOT NULL REFERENCES public.orchard_subjects(subject_key) ON DELETE CASCADE,
  stage            text NOT NULL DEFAULT 'seed',  -- seed, sprout, young_plant, growing_tree, mature_tree, blossom, fruit, golden_fruit
  stage_index      integer NOT NULL DEFAULT 0,    -- 0..7 matching stage order
  roots_pct        integer NOT NULL DEFAULT 0,    -- understanding for this chapter 0..100
  -- milestones: {lesson_watched, question_asked, story_done, homework, quiz,
  --  flashcards, active_recall, explain_back, memory_challenge, word_problems,
  --  real_life, projects, week_retention, month_retention}
  milestones       jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_golden        boolean NOT NULL DEFAULT false,
  fruit_collected  boolean NOT NULL DEFAULT false,
  started_at       timestamptz,
  stage_updated_at timestamptz DEFAULT now(),
  fruit_at         timestamptz,                   -- when fruit finally appeared
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  UNIQUE(student_id, chapter_id)
);

CREATE INDEX IF NOT EXISTS idx_chapter_growth_student
  ON public.chapter_growth(student_id);
CREATE INDEX IF NOT EXISTS idx_chapter_growth_chapter
  ON public.chapter_growth(chapter_id);
CREATE INDEX IF NOT EXISTS idx_chapter_growth_subject
  ON public.chapter_growth(subject_key);
CREATE INDEX IF NOT EXISTS idx_chapter_growth_student_subject
  ON public.chapter_growth(student_id, subject_key);
CREATE INDEX IF NOT EXISTS idx_chapter_growth_stage
  ON public.chapter_growth(stage);

-- ---------------------------------------------------------------------------
-- orchard_reviews: spaced-repetition schedule. Fruit only appears after the
-- 1-week and 1-month retention checks are passed. Rows drive "AI checks memory
-- again next week / next month" behaviour.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orchard_reviews (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  chapter_id     uuid NOT NULL REFERENCES public.orchard_chapters(id) ON DELETE CASCADE,
  subject_key    text NOT NULL REFERENCES public.orchard_subjects(subject_key) ON DELETE CASCADE,
  review_type    text NOT NULL DEFAULT 'day',  -- day, week, month
  scheduled_at   timestamptz NOT NULL,
  completed_at   timestamptz,
  passed         boolean,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orchard_reviews_student
  ON public.orchard_reviews(student_id);
CREATE INDEX IF NOT EXISTS idx_orchard_reviews_chapter
  ON public.orchard_reviews(chapter_id);
CREATE INDEX IF NOT EXISTS idx_orchard_reviews_scheduled
  ON public.orchard_reviews(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_orchard_reviews_due
  ON public.orchard_reviews(student_id, scheduled_at)
  WHERE completed_at IS NULL;

-- ---------------------------------------------------------------------------
-- orchard_activity: append-only log of learning actions that feed the growth
-- engine. occurred_at is caller-supplied so historical/month-wise data can be
-- seeded for testing tree growth over time.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orchard_activity (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_key    text NOT NULL REFERENCES public.orchard_subjects(subject_key) ON DELETE CASCADE,
  chapter_id     uuid REFERENCES public.orchard_chapters(id) ON DELETE SET NULL,
  -- activity_type: lesson, question, story, homework, quiz, flashcards,
  --  revision, mock_test, active_recall, explain_back, memory_challenge,
  --  word_problem, real_life, project, review
  activity_type  text NOT NULL,
  water          integer NOT NULL DEFAULT 0,     -- water drops added
  sunlight       integer NOT NULL DEFAULT 0,     -- sunlight added (confidence/correct answers)
  fertilizer     integer NOT NULL DEFAULT 0,     -- fertilizer added (curiosity/questions)
  correct        boolean,                        -- for graded activities
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orchard_activity_student
  ON public.orchard_activity(student_id);
CREATE INDEX IF NOT EXISTS idx_orchard_activity_subject
  ON public.orchard_activity(subject_key);
CREATE INDEX IF NOT EXISTS idx_orchard_activity_chapter
  ON public.orchard_activity(chapter_id);
CREATE INDEX IF NOT EXISTS idx_orchard_activity_occurred
  ON public.orchard_activity(occurred_at);
CREATE INDEX IF NOT EXISTS idx_orchard_activity_student_occurred
  ON public.orchard_activity(student_id, occurred_at);

COMMIT;

-- ---------------------------------------------------------------------------
-- Seed the subject catalog (idempotent upsert on subject_key).
-- ---------------------------------------------------------------------------
BEGIN;

INSERT INTO public.orchard_subjects
  (subject_key, display_name, tree_type, fruit_type, fruit_emoji, tree_emoji, accent_color, order_index)
VALUES
  ('mathematics',   'Mathematics',    'oak',            'golden_apple', '🍎', '🌳', '#7c3aed', 1),
  ('science',       'Science',        'crystal',        'blue_crystal', '💎', '🌲', '#0ea5e9', 2),
  ('english',       'English',        'cherry_blossom', 'pink_cherry',  '🍒', '🌸', '#ec4899', 3),
  ('social',        'Social Studies', 'banyan',         'wisdom_fruit', '🟠', '🌳', '#f59e0b', 4),
  ('computer',      'Computer',       'digital',        'pixel_fruit',  '🟢', '🌲', '#10b981', 5),
  ('hindi',         'Hindi',          'mango',          'mango',        '🥭', '🌳', '#eab308', 6)
ON CONFLICT (subject_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  tree_type    = EXCLUDED.tree_type,
  fruit_type   = EXCLUDED.fruit_type,
  fruit_emoji  = EXCLUDED.fruit_emoji,
  tree_emoji   = EXCLUDED.tree_emoji,
  accent_color = EXCLUDED.accent_color,
  order_index  = EXCLUDED.order_index,
  updated_at   = now();

COMMIT;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
BEGIN;

ALTER TABLE IF EXISTS public.orchard_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.orchard_chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.orchard_profile  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.orchard_trees    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chapter_growth   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.orchard_reviews  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.orchard_activity ENABLE ROW LEVEL SECURITY;

-- Catalog tables: readable by any authenticated user; writes are service-role only.
DROP POLICY IF EXISTS "orchard_subjects_select" ON public.orchard_subjects;
CREATE POLICY "orchard_subjects_select" ON public.orchard_subjects
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "orchard_chapters_select" ON public.orchard_chapters;
CREATE POLICY "orchard_chapters_select" ON public.orchard_chapters
  FOR SELECT USING (auth.role() = 'authenticated');

-- Per-student tables: a student can only see and mutate their own rows.
DROP POLICY IF EXISTS "orchard_profile_all" ON public.orchard_profile;
CREATE POLICY "orchard_profile_all" ON public.orchard_profile
  FOR ALL USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "orchard_trees_all" ON public.orchard_trees;
CREATE POLICY "orchard_trees_all" ON public.orchard_trees
  FOR ALL USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "chapter_growth_all" ON public.chapter_growth;
CREATE POLICY "chapter_growth_all" ON public.chapter_growth
  FOR ALL USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "orchard_reviews_all" ON public.orchard_reviews;
CREATE POLICY "orchard_reviews_all" ON public.orchard_reviews
  FOR ALL USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "orchard_activity_all" ON public.orchard_activity;
CREATE POLICY "orchard_activity_all" ON public.orchard_activity
  FOR ALL USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());

COMMIT;
