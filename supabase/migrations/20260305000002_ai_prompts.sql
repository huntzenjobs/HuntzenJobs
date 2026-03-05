-- Migration: ai_prompts
-- Éditeur de prompts IA — permet de modifier les prompts sans redéployer

CREATE TABLE IF NOT EXISTS ai_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_ai_prompts_name ON ai_prompts(name);

-- RLS
ALTER TABLE ai_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON ai_prompts
  USING (true)
  WITH CHECK (true);
