-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- Students table
CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  age int,
  class text,
  board text,
  created_at timestamptz DEFAULT now()
);

-- Messages (chat) table
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id) ON DELETE SET NULL,
  role text,
  message text,
  message_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  conversation_id text,
  created_at timestamptz DEFAULT now(),
  embedding vector(8)
);

-- Conversation snapshots (persistent memory across restarts)
CREATE TABLE IF NOT EXISTS conversation_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  conversation_id text NOT NULL,
  snapshot jsonb NOT NULL,
  turn_count int DEFAULT 0,
  last_message_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(student_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_snapshots_student_conv 
  ON conversation_snapshots(student_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_snapshots_updated_at 
  ON conversation_snapshots(updated_at DESC);
CREATE TABLE IF NOT EXISTS memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  key text,
  value text,
  embedding vector(8),
  created_at timestamptz DEFAULT now()
);

-- Homework uploads
CREATE TABLE IF NOT EXISTS homework (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id) ON DELETE SET NULL,
  file_url text,
  ocr_text text,
  graded boolean DEFAULT false,
  score int,
  created_at timestamptz DEFAULT now()
);

-- Example seed (safe to remove later)
INSERT INTO students (name, age, class, board)
SELECT 'Test Student', 10, '5', 'CBSE'
WHERE NOT EXISTS (SELECT 1 FROM students WHERE name='Test Student');
