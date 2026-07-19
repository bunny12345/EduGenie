-- Migration: persist AI tutor image metadata per message row
-- Adds jsonb metadata column to messages and backfills defaults.
-- Idempotent and safe to re-run.

BEGIN;

ALTER TABLE IF EXISTS public.messages
ADD COLUMN IF NOT EXISTS conversation_id text;

ALTER TABLE IF EXISTS public.messages
ADD COLUMN IF NOT EXISTS message_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at
ON public.messages(student_id, conversation_id, created_at DESC);

COMMIT;
