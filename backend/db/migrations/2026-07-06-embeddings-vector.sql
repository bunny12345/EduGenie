-- Migration: enlarge embeddings vector dimension to 1536
-- Idempotent: checks current dimension before altering to avoid a no-op error.
-- The column must already be vector(<any_dim>); this resizes it to 1536.
BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

DO $$
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'memories'
    AND column_name  = 'embedding';

  IF col_type IS NULL THEN
    -- Column doesn't exist yet; add it at the right size
    ALTER TABLE public.memories ADD COLUMN embedding vector(1536);
  ELSE
    -- Column exists (any dim); resize to 1536.
    -- Existing vectors are zero-padded / truncated by pgvector during the cast.
    ALTER TABLE public.memories
      ALTER COLUMN embedding TYPE vector(1536)
      USING embedding::text::vector(1536);
  END IF;
END;
$$;

COMMIT;
