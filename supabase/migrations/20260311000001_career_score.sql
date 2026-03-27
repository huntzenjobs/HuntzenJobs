-- Career Score : score employabilité calculé par utilisateur
-- 3 composantes : Activity (40pts) + AI (40pts) + XP (20pts)

CREATE TABLE IF NOT EXISTS user_career_score (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  total_score INTEGER DEFAULT 0 CHECK (total_score >= 0 AND total_score <= 100),
  activity_score INTEGER DEFAULT 0 CHECK (activity_score >= 0 AND activity_score <= 40),
  ai_score INTEGER DEFAULT 0 CHECK (ai_score >= 0 AND ai_score <= 40),
  xp_score INTEGER DEFAULT 0 CHECK (xp_score >= 0 AND xp_score <= 20),
  ai_justification TEXT,
  last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
  next_recalc_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);

-- Log des événements XP (gamification)
CREATE TABLE IF NOT EXISTS user_xp_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'cv_analysis',
    'job_search',
    'application',
    'interview_sim',
    'profile_complete',
    'referral_validated'
  )),
  xp_gained INTEGER NOT NULL CHECK (xp_gained > 0),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_xp_events_user ON user_xp_events(user_id, created_at DESC);

-- RLS : chaque user voit uniquement ses propres données
ALTER TABLE user_career_score ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_xp_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_career_score_own" ON user_career_score
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "user_xp_events_own" ON user_xp_events
  FOR ALL USING (user_id = auth.uid());

-- Service role peut tout faire (backend)
CREATE POLICY "user_career_score_service" ON user_career_score
  FOR ALL TO service_role USING (true);

CREATE POLICY "user_xp_events_service" ON user_xp_events
  FOR ALL TO service_role USING (true);
