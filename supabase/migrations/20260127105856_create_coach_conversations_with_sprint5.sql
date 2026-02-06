-- ============================================================================
-- COACH CONVERSATIONS TABLE WITH SPRINT 5 ENHANCEMENTS
-- Create table with all metadata columns from the start
-- ============================================================================

-- Create coach_conversations table with Sprint 5 features
CREATE TABLE IF NOT EXISTS public.coach_conversations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  session_id text NOT NULL,
  messages jsonb DEFAULT '[]'::jsonb,
  context jsonb, -- job search context, cv context, etc.

  -- Sprint 5: Metadata columns
  title text,
  is_favorite boolean DEFAULT FALSE NOT NULL,
  message_count integer GENERATED ALWAYS AS (
    CASE
      WHEN jsonb_typeof(messages) = 'array' THEN jsonb_array_length(messages)
      ELSE 0
    END
  ) STORED,
  last_message_at timestamptz,

  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS coach_conversations_user_id_idx
  ON public.coach_conversations(user_id);

CREATE INDEX IF NOT EXISTS coach_conversations_session_id_idx
  ON public.coach_conversations(session_id);

-- Sprint 5: Additional indexes
CREATE INDEX IF NOT EXISTS coach_conversations_title_gin_idx
  ON public.coach_conversations USING GIN (to_tsvector('french', COALESCE(title, '')));

CREATE INDEX IF NOT EXISTS coach_conversations_is_favorite_idx
  ON public.coach_conversations(user_id, is_favorite)
  WHERE is_favorite = TRUE;

CREATE INDEX IF NOT EXISTS coach_conversations_last_message_idx
  ON public.coach_conversations(user_id, last_message_at DESC);

-- Auto-update updated_at and last_message_at triggers
CREATE OR REPLACE FUNCTION public.update_coach_conversation_metadata()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();

  -- Update last_message_at from last message timestamp
  IF jsonb_typeof(NEW.messages) = 'array' AND jsonb_array_length(NEW.messages) > 0 THEN
    NEW.last_message_at = (NEW.messages->-1->>'timestamp')::timestamptz;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_coach_conversations_metadata
  BEFORE INSERT OR UPDATE ON public.coach_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_coach_conversation_metadata();

-- Enable Row Level Security
ALTER TABLE public.coach_conversations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own conversations"
  ON public.coach_conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conversations"
  ON public.coach_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations"
  ON public.coach_conversations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own conversations"
  ON public.coach_conversations FOR DELETE
  USING (auth.uid() = user_id);

-- Verify the migration
DO $$
BEGIN
  RAISE NOTICE 'Coach conversations table created successfully with Sprint 5 enhancements';
  RAISE NOTICE 'Columns: id, user_id, session_id, messages, context, title, is_favorite, message_count, last_message_at, created_at, updated_at';
  RAISE NOTICE 'Indexes: user_id, session_id, title (GIN), is_favorite, last_message_at';
  RAISE NOTICE 'RLS Policies: SELECT, INSERT, UPDATE, DELETE';
END $$;
