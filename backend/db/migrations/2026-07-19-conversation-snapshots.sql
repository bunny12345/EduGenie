-- Migration: add conversation snapshots table for persistent conversation context
-- Snapshots survive backend restarts and serve as fallback when message inserts fail
-- Idempotent (uses IF NOT EXISTS). Safe to re-run.

BEGIN;

-- Ensure messages table has conversation_id column for proper conversation scoping
ALTER TABLE IF EXISTS public.messages
ADD COLUMN IF NOT EXISTS conversation_id text DEFAULT 'conv-' || student_id::text;

-- Create indexes for messages conversation_id lookups
CREATE INDEX IF NOT EXISTS idx_messages_student_conversation
ON public.messages(student_id, conversation_id, created_at DESC);

-- Conversation snapshots: JSON snapshots of last N turns per (student, conversation)
-- Stores up to 60 most recent turns per conversation in JSON array format
-- Updated on each new message, acts as fallback context when DB messages table is empty/unavailable
CREATE TABLE IF NOT EXISTS public.conversation_snapshots (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  conversation_id text    NOT NULL,
  snapshot    jsonb       NOT NULL DEFAULT '[]', -- Array of { role: 'user'|'assistant', content: string, ts: string }
  turn_count  int         NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- Ensure one snapshot per (student_id, conversation_id) pair
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_snapshots_unique
ON public.conversation_snapshots(student_id, conversation_id);

-- Index for quick lookup + ordering by update time for cache invalidation
CREATE INDEX IF NOT EXISTS idx_conversation_snapshots_student_updated
ON public.conversation_snapshots(student_id, updated_at DESC);

COMMIT;
