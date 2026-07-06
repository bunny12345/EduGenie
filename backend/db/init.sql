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
  created_at timestamptz DEFAULT now(),
  embedding vector(8)
);

-- Memories (key-value + vector for retrieval)
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
