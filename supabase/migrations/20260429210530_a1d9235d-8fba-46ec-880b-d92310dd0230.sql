-- Add 'context' to the conversation_type enum
ALTER TYPE public.conversation_type ADD VALUE IF NOT EXISTS 'context';

-- Add external_context_id column for embed widget
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS external_context_id text;

-- Unique per workspace + external_context_id (only when set)
CREATE UNIQUE INDEX IF NOT EXISTS conversations_workspace_context_unique
  ON public.conversations (workspace_id, external_context_id)
  WHERE external_context_id IS NOT NULL;