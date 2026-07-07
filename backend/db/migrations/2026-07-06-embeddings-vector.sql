-- Migration: enlarge embeddings vector dimension to 1536
-- WARNING: Run this when you are ready and have a backup.
BEGIN;
-- Ensure the vector extension exists (Supabase typically has it)
CREATE EXTENSION IF NOT EXISTS vector;

-- Alter column type from vector(<old>) to vector(1536).
-- If current column is jsonb or float[], adjust accordingly. This tries to cast where possible.
ALTER TABLE public.memories
  ALTER COLUMN embedding TYPE vector(1536)
  USING (
    CASE
      WHEN pg_typeof(embedding) = 'vector'::regtype THEN embedding::vector(1536)
      WHEN pg_typeof(embedding) = 'numeric[]'::regtype OR pg_typeof(embedding) = 'double precision[]'::regtype THEN (embedding::double precision[] )::vector(1536)
      WHEN pg_typeof(embedding) = 'jsonb'::regtype THEN (
        (SELECT array_agg((elem->>0)::double precision) FROM jsonb_array_elements(embedding) WITH ORDINALITY AS elem)
      )::vector(1536)
      ELSE NULL
    END
  );

COMMIT;
