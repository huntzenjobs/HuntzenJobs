-- ============================================================
-- User Applications Table
-- Tracks all job applications confirmed by the user
-- ============================================================

CREATE TABLE IF NOT EXISTS user_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_job_id TEXT NOT NULL,
  job_title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT,
  salary TEXT,
  job_url TEXT NOT NULL,
  job_source TEXT DEFAULT 'unknown',
  saved_job_id UUID REFERENCES saved_jobs(id) ON DELETE SET NULL,
  document_id UUID REFERENCES user_documents(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'applied' CHECK (
    status IN ('applied', 'viewed', 'interview', 'rejected', 'offer')
  ),
  confirmed_by_user BOOLEAN DEFAULT FALSE,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  UNIQUE(user_id, external_job_id)
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_user_applications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_applications_updated_at
  BEFORE UPDATE ON user_applications
  FOR EACH ROW EXECUTE FUNCTION update_user_applications_updated_at();

-- Row Level Security
ALTER TABLE user_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_applications_select" ON user_applications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_own_applications_insert" ON user_applications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_own_applications_update" ON user_applications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "users_own_applications_delete" ON user_applications
  FOR DELETE USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_applications_user_id ON user_applications(user_id, applied_at DESC);
CREATE INDEX idx_applications_external_job ON user_applications(external_job_id);
CREATE INDEX idx_applications_status ON user_applications(user_id, status);

-- ============================================================
-- User Notification Preferences Table
-- ============================================================

CREATE TABLE IF NOT EXISTS user_notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  job_alerts BOOLEAN DEFAULT TRUE,
  application_confirmation BOOLEAN DEFAULT TRUE,
  weekly_summary BOOLEAN DEFAULT TRUE,
  reengagement BOOLEAN DEFAULT TRUE,
  followup_reminder BOOLEAN DEFAULT TRUE,
  alert_frequency TEXT DEFAULT 'daily' CHECK (
    alert_frequency IN ('instant', 'daily', 'weekly')
  ),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_notif_prefs" ON user_notification_preferences
  USING (auth.uid() = user_id);

CREATE POLICY "users_insert_notif_prefs" ON user_notification_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_update_notif_prefs" ON user_notification_preferences
  FOR UPDATE USING (auth.uid() = user_id);
