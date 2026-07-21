-- Migration: Curriculum schema for lesson-wise PDF learning
-- Phase 0: Create tables for lessons, documents, chunks, and student progress
-- Idempotent and safe to re-run.

BEGIN;

-- lessons: individual lessons within a subject, created by teachers
CREATE TABLE IF NOT EXISTS public.lessons (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id      uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  subject         text NOT NULL,
  title           text NOT NULL,
  description     text,
  class_name      text,
  order_index     integer DEFAULT 0,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lessons_teacher_id
  ON public.lessons(teacher_id);
CREATE INDEX IF NOT EXISTS idx_lessons_subject
  ON public.lessons(subject);
CREATE INDEX IF NOT EXISTS idx_lessons_teacher_subject
  ON public.lessons(teacher_id, subject);

-- lesson_class_visibility: controls which classes can see a lesson in the student portal
CREATE TABLE IF NOT EXISTS public.lesson_class_visibility (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id       uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  teacher_id      uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  class_name      text NOT NULL,
  is_visible      boolean NOT NULL DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(lesson_id, class_name)
);

CREATE INDEX IF NOT EXISTS idx_lesson_class_visibility_lesson_id
  ON public.lesson_class_visibility(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_class_visibility_teacher_id
  ON public.lesson_class_visibility(teacher_id);
CREATE INDEX IF NOT EXISTS idx_lesson_class_visibility_class_name
  ON public.lesson_class_visibility(class_name);
CREATE INDEX IF NOT EXISTS idx_lesson_class_visibility_lookup
  ON public.lesson_class_visibility(lesson_id, class_name, is_visible);

-- lesson_documents: PDF documents uploaded for each lesson (1 or more per lesson)
CREATE TABLE IF NOT EXISTS public.lesson_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id       uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  teacher_id      uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  file_name       text NOT NULL,
  file_url        text NOT NULL,
  file_size_bytes integer,
  mime_type       text DEFAULT 'application/pdf',
  extraction_status text DEFAULT 'pending', -- pending, in_progress, completed, failed
  error_message   text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lesson_documents_lesson_id
  ON public.lesson_documents(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_documents_teacher_id
  ON public.lesson_documents(teacher_id);
CREATE INDEX IF NOT EXISTS idx_lesson_documents_status
  ON public.lesson_documents(extraction_status);

-- lesson_chunks: text chunks extracted from lesson PDFs (for RAG grounding)
CREATE TABLE IF NOT EXISTS public.lesson_chunks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     uuid NOT NULL REFERENCES public.lesson_documents(id) ON DELETE CASCADE,
  lesson_id       uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  teacher_id      uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  chunk_text      text NOT NULL,
  chunk_index     integer,
  page_number     integer,
  embedding       vector(384), -- nomic-embed-text produces 384-dim vectors; adjustable for other models
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lesson_chunks_document_id
  ON public.lesson_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_lesson_chunks_lesson_id
  ON public.lesson_chunks(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_chunks_teacher_id
  ON public.lesson_chunks(teacher_id);

-- Vector index for similarity search (pgvector HNSW for fast embedding lookup)
CREATE INDEX IF NOT EXISTS idx_lesson_chunks_embedding_hnsw
  ON public.lesson_chunks USING hnsw (embedding vector_cosine_ops);

-- student_lesson_progress: tracks which lessons students have engaged with
CREATE TABLE IF NOT EXISTS public.student_lesson_progress (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  lesson_id       uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  teacher_id      uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  status          text DEFAULT 'not_started', -- not_started, in_progress, completed
  messages_count  integer DEFAULT 0,
  first_message_at timestamptz,
  last_message_at timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(student_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_student_lesson_progress_student_id
  ON public.student_lesson_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_student_lesson_progress_lesson_id
  ON public.student_lesson_progress(lesson_id);
CREATE INDEX IF NOT EXISTS idx_student_lesson_progress_teacher_id
  ON public.student_lesson_progress(teacher_id);
CREATE INDEX IF NOT EXISTS idx_student_lesson_progress_status
  ON public.student_lesson_progress(status);

COMMIT;

-- Enable RLS on new tables
BEGIN;

ALTER TABLE IF EXISTS public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.lesson_class_visibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.lesson_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.lesson_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.student_lesson_progress ENABLE ROW LEVEL SECURITY;

-- lessons: teacher owns their lessons; students see lessons from their assigned teacher
DROP POLICY IF EXISTS "lessons_select" ON public.lessons;
CREATE POLICY "lessons_select" ON public.lessons
  FOR SELECT USING (
    -- Teachers see their own lessons
    teacher_id = auth.uid()
    OR
    -- Students see lessons only when their class is explicitly enabled
    EXISTS (
      SELECT 1
      FROM public.lesson_class_visibility lcv
      JOIN public.students s ON s.id = auth.uid()
      WHERE lcv.lesson_id = public.lessons.id
        AND lcv.class_name = s.class_name
        AND lcv.is_visible = true
    )
  );

DROP POLICY IF EXISTS "lessons_insert" ON public.lessons;
CREATE POLICY "lessons_insert" ON public.lessons
  FOR INSERT WITH CHECK (teacher_id = auth.uid());

DROP POLICY IF EXISTS "lessons_update" ON public.lessons;
CREATE POLICY "lessons_update" ON public.lessons
  FOR UPDATE USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

DROP POLICY IF EXISTS "lessons_delete" ON public.lessons;
CREATE POLICY "lessons_delete" ON public.lessons
  FOR DELETE USING (teacher_id = auth.uid());

-- lesson_class_visibility: teachers manage visibility; students can only read their enabled rows
DROP POLICY IF EXISTS "lesson_class_visibility_select" ON public.lesson_class_visibility;
CREATE POLICY "lesson_class_visibility_select" ON public.lesson_class_visibility
  FOR SELECT USING (
    teacher_id = auth.uid()
    OR (
      class_name = (
      SELECT s.class_name
      FROM public.students s
      WHERE s.id = auth.uid()
      )
      AND is_visible = true
    )
  );

DROP POLICY IF EXISTS "lesson_class_visibility_insert" ON public.lesson_class_visibility;
CREATE POLICY "lesson_class_visibility_insert" ON public.lesson_class_visibility
  FOR INSERT WITH CHECK (teacher_id = auth.uid());

DROP POLICY IF EXISTS "lesson_class_visibility_update" ON public.lesson_class_visibility;
CREATE POLICY "lesson_class_visibility_update" ON public.lesson_class_visibility
  FOR UPDATE USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

DROP POLICY IF EXISTS "lesson_class_visibility_delete" ON public.lesson_class_visibility;
CREATE POLICY "lesson_class_visibility_delete" ON public.lesson_class_visibility
  FOR DELETE USING (teacher_id = auth.uid());

-- lesson_documents: inherit access from lesson (teacher owns the lesson)
DROP POLICY IF EXISTS "lesson_documents_select" ON public.lesson_documents;
CREATE POLICY "lesson_documents_select" ON public.lesson_documents
  FOR SELECT USING (
    -- Teachers see documents for their lessons
    teacher_id = auth.uid()
    OR
    -- Students see documents only for lessons enabled for their class
    EXISTS (
      SELECT 1
      FROM public.lesson_class_visibility lcv
      JOIN public.students s ON s.id = auth.uid()
      WHERE lcv.lesson_id = public.lesson_documents.lesson_id
        AND lcv.class_name = s.class_name
        AND lcv.is_visible = true
    )
  );

DROP POLICY IF EXISTS "lesson_documents_insert" ON public.lesson_documents;
CREATE POLICY "lesson_documents_insert" ON public.lesson_documents
  FOR INSERT WITH CHECK (teacher_id = auth.uid());

DROP POLICY IF EXISTS "lesson_documents_update" ON public.lesson_documents;
CREATE POLICY "lesson_documents_update" ON public.lesson_documents
  FOR UPDATE USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

DROP POLICY IF EXISTS "lesson_documents_delete" ON public.lesson_documents;
CREATE POLICY "lesson_documents_delete" ON public.lesson_documents
  FOR DELETE USING (teacher_id = auth.uid());

-- lesson_chunks: same access pattern as lesson_documents (through lesson ownership)
DROP POLICY IF EXISTS "lesson_chunks_select" ON public.lesson_chunks;
CREATE POLICY "lesson_chunks_select" ON public.lesson_chunks
  FOR SELECT USING (
    -- Teachers see chunks for their lessons
    teacher_id = auth.uid()
    OR
    -- Students see chunks only for lessons enabled for their class
    EXISTS (
      SELECT 1
      FROM public.lesson_class_visibility lcv
      JOIN public.students s ON s.id = auth.uid()
      WHERE lcv.lesson_id = public.lesson_chunks.lesson_id
        AND lcv.class_name = s.class_name
        AND lcv.is_visible = true
    )
  );

DROP POLICY IF EXISTS "lesson_chunks_insert" ON public.lesson_chunks;
CREATE POLICY "lesson_chunks_insert" ON public.lesson_chunks
  FOR INSERT WITH CHECK (teacher_id = auth.uid());

-- lesson_chunks are typically only read (inserted by system during extraction)
-- So UPDATE/DELETE policies are restrictive

-- student_lesson_progress: students see only their own progress; teachers see their students' progress
DROP POLICY IF EXISTS "student_lesson_progress_select" ON public.student_lesson_progress;
CREATE POLICY "student_lesson_progress_select" ON public.student_lesson_progress
  FOR SELECT USING (
    -- Students see their own progress
    student_id = auth.uid()
    OR
    -- Teachers see progress on their lessons
    teacher_id = auth.uid()
  );

DROP POLICY IF EXISTS "student_lesson_progress_insert" ON public.student_lesson_progress;
CREATE POLICY "student_lesson_progress_insert" ON public.student_lesson_progress
  FOR INSERT WITH CHECK (
    -- Only teachers can insert (system inserts on first student message)
    -- Or students can create their own progress record
    teacher_id = auth.uid() OR student_id = auth.uid()
  );

DROP POLICY IF EXISTS "student_lesson_progress_update" ON public.student_lesson_progress;
CREATE POLICY "student_lesson_progress_update" ON public.student_lesson_progress
  FOR UPDATE USING (
    student_id = auth.uid() OR teacher_id = auth.uid()
  )
  WITH CHECK (
    student_id = auth.uid() OR teacher_id = auth.uid()
  );

COMMIT;
