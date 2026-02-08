-- Migration: Add assistant_type to coach_conversations
-- Sprint 1: Multi-Assistant System
-- Permet de différencier les conversations par type d'assistant

-- Add assistant_type column to coach_conversations
ALTER TABLE coach_conversations
ADD COLUMN IF NOT EXISTS assistant_type TEXT DEFAULT 'career-coach';

-- Add index for faster filtering by assistant_type
CREATE INDEX IF NOT EXISTS idx_coach_conversations_assistant_type
ON coach_conversations(assistant_type);

-- Add check constraint for valid assistant types
ALTER TABLE coach_conversations
ADD CONSTRAINT check_valid_assistant_type
CHECK (assistant_type IN (
  'career-coach',
  'job-scout',
  'cv-analyzer',
  'cv-adapter',
  'interview-sim'
));

-- Add comment for documentation
COMMENT ON COLUMN coach_conversations.assistant_type IS
'Type of assistant for this conversation: career-coach, job-scout, cv-analyzer, cv-adapter, or interview-sim';
