-- Notifications in-app avec Supabase Realtime

CREATE TABLE IF NOT EXISTS user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'job_alert',
    'cv_feedback',
    'referral_bonus',
    'promo_code',
    'career_progress',
    'interview_ready',
    'win_back_7d'
  )),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB DEFAULT '{}',         -- metadata : coupon_code, job_count, xp_gained, etc.
  read BOOLEAN DEFAULT FALSE,
  email_sent_at TIMESTAMPTZ,       -- évite le double envoi email + notif
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_unread
  ON user_notifications(user_id, read, created_at DESC);

-- RLS
ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_notifications_own_select" ON user_notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_notifications_own_update" ON user_notifications
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "user_notifications_service" ON user_notifications
  FOR ALL TO service_role USING (true);

-- Activer Realtime sur cette table
ALTER PUBLICATION supabase_realtime ADD TABLE user_notifications;
