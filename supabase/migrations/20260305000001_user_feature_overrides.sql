-- Migration: user_feature_overrides
-- Feature flags par utilisateur (overrides individuels)

CREATE TABLE IF NOT EXISTS user_feature_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  feature_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id),
  UNIQUE(user_id, feature_name)
);

CREATE INDEX IF NOT EXISTS idx_user_feature_overrides_user_id ON user_feature_overrides(user_id);

-- RLS
ALTER TABLE user_feature_overrides ENABLE ROW LEVEL SECURITY;

-- Seuls les admins peuvent lire/écrire (via service role key côté backend)
CREATE POLICY "Service role full access" ON user_feature_overrides
  USING (true)
  WITH CHECK (true);
