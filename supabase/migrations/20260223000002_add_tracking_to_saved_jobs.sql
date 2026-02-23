ALTER TABLE saved_jobs
  ADD COLUMN IF NOT EXISTS applied_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cv_document_id UUID REFERENCES user_documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_saved_jobs_cv_document_id
  ON saved_jobs(cv_document_id);
