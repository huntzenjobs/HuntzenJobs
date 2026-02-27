-- CV Profiles: reusable structured CV data for manual CV creation flow
-- Separate from user_documents (which stores job-specific generated PDFs)

CREATE TABLE IF NOT EXISTS cv_profiles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT 'Mon CV',
  cv_data    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cv_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cv_profiles"
  ON cv_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cv_profiles"
  ON cv_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own cv_profiles"
  ON cv_profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own cv_profiles"
  ON cv_profiles FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_cv_profiles_user_id ON cv_profiles(user_id);
CREATE INDEX idx_cv_profiles_updated_at ON cv_profiles(updated_at DESC);

-- Auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION update_cv_profiles_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cv_profiles_updated_at
  BEFORE UPDATE ON cv_profiles
  FOR EACH ROW EXECUTE FUNCTION update_cv_profiles_updated_at();
