CREATE TABLE IF NOT EXISTS user_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_title       TEXT NOT NULL,
  company         TEXT NOT NULL DEFAULT '',
  match_score     INTEGER,
  cv_data         JSONB NOT NULL DEFAULT '{}'::jsonb,
  cv_pdf_url      TEXT,
  lm_pdf_url      TEXT,
  language        TEXT NOT NULL DEFAULT 'fr',
  saved_job_id    UUID REFERENCES saved_jobs(id) ON DELETE SET NULL,
  job_url         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own documents"
  ON user_documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own documents"
  ON user_documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents"
  ON user_documents FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_user_documents_user_id ON user_documents(user_id);
CREATE INDEX idx_user_documents_created_at ON user_documents(created_at DESC);
CREATE INDEX idx_user_documents_saved_job_id ON user_documents(saved_job_id);
