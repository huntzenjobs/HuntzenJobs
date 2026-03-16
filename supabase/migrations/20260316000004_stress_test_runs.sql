-- Migration: stress_test_runs
-- Historique complet des tests de charge admin

CREATE TABLE stress_test_runs (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  started_by_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name                TEXT NOT NULL,
  status              TEXT CHECK (status IN ('pending','running','completed','failed','cancelled')) DEFAULT 'pending',
  config              JSONB NOT NULL DEFAULT '{}',
  total_requests      INT DEFAULT 0,
  successful          INT DEFAULT 0,
  failed              INT DEFAULT 0,
  avg_response_ms     FLOAT,
  p95_response_ms     FLOAT,
  p99_response_ms     FLOAT,
  max_response_ms     FLOAT,
  metrics_timeseries  JSONB,
  errors_log          JSONB,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  completed_at        TIMESTAMPTZ
);

CREATE INDEX idx_stress_test_runs_status     ON stress_test_runs(status);
CREATE INDEX idx_stress_test_runs_created_at ON stress_test_runs(created_at DESC);

ALTER TABLE stress_test_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON stress_test_runs
  FOR ALL TO service_role USING (true);
