-- Ajout colonne applied_at (manquante dans la migration originale)
-- et index composite sur (user_id, external_job_id) pour les lookup dupliqués

ALTER TABLE saved_jobs
    ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;

-- Index composite pour le duplicate check (save_job)
CREATE INDEX IF NOT EXISTS idx_saved_jobs_user_ext_source
    ON saved_jobs(user_id, external_job_id, job_source);
