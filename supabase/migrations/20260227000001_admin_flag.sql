-- ============================================
-- ADMIN FLAG & USER STATUS
-- Sprint 1 - Security Hardening
-- ============================================

-- Add is_admin boolean to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Add user status for suspension/deletion
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'suspended', 'deleted'));

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON profiles(is_admin) WHERE is_admin = TRUE;
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status) WHERE status != 'active';

-- ============================================
-- RLS POLICIES: Admin reads all profiles
-- ============================================

-- Admin can read all profiles
DROP POLICY IF EXISTS "admins_read_all_profiles" ON profiles;
CREATE POLICY "admins_read_all_profiles" ON profiles
  FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE is_admin = TRUE)
  );

-- Admin can update all profiles (suspend, reactivate, etc.)
DROP POLICY IF EXISTS "admins_update_all_profiles" ON profiles;
CREATE POLICY "admins_update_all_profiles" ON profiles
  FOR UPDATE
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE is_admin = TRUE)
  );

-- ============================================
-- RLS POLICIES: Admin reads all subscriptions
-- ============================================

DROP POLICY IF EXISTS "admins_read_all_subscriptions" ON user_subscriptions;
CREATE POLICY "admins_read_all_subscriptions" ON user_subscriptions
  FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE is_admin = TRUE)
  );

DROP POLICY IF EXISTS "admins_update_all_subscriptions" ON user_subscriptions;
CREATE POLICY "admins_update_all_subscriptions" ON user_subscriptions
  FOR ALL
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE is_admin = TRUE)
  );

-- ============================================
-- RLS POLICIES: Admin reads all usage quotas
-- ============================================

DROP POLICY IF EXISTS "admins_read_all_quotas" ON usage_quotas;
CREATE POLICY "admins_read_all_quotas" ON usage_quotas
  FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE is_admin = TRUE)
  );

-- ============================================
-- RLS POLICIES: Admin reads all security events
-- ============================================

DROP POLICY IF EXISTS "admins_read_all_security_events" ON security_events;
CREATE POLICY "admins_read_all_security_events" ON security_events
  FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE is_admin = TRUE)
  );

-- ============================================
-- RLS POLICIES: Admin manages subscription plans
-- ============================================

DROP POLICY IF EXISTS "admins_update_subscription_plans" ON subscription_plans;
CREATE POLICY "admins_update_subscription_plans" ON subscription_plans
  FOR UPDATE
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE is_admin = TRUE)
  );

-- ============================================
-- RLS POLICIES: Admin manages stripe prices
-- ============================================

DROP POLICY IF EXISTS "admins_manage_stripe_prices" ON stripe_prices;
CREATE POLICY "admins_manage_stripe_prices" ON stripe_prices
  FOR ALL
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE is_admin = TRUE)
  );

-- ============================================
-- RLS POLICIES: Admin reads recruiter requests
-- ============================================

DROP POLICY IF EXISTS "admins_read_all_recruiter_requests" ON recruiter_requests;
CREATE POLICY "admins_read_all_recruiter_requests" ON recruiter_requests
  FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE is_admin = TRUE)
  );

DROP POLICY IF EXISTS "admins_update_recruiter_requests" ON recruiter_requests;
CREATE POLICY "admins_update_recruiter_requests" ON recruiter_requests
  FOR UPDATE
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE is_admin = TRUE)
  );

-- ============================================
-- RLS POLICIES: Admin reads subscription history
-- ============================================

DROP POLICY IF EXISTS "admins_read_subscription_history" ON subscription_history;
CREATE POLICY "admins_read_subscription_history" ON subscription_history
  FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE is_admin = TRUE)
  );

-- ============================================
-- RLS POLICIES: Admin reads webhook failures
-- ============================================

DROP POLICY IF EXISTS "admins_read_webhook_failures" ON webhook_failures;
CREATE POLICY "admins_read_webhook_failures" ON webhook_failures
  FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE is_admin = TRUE)
  );

DROP POLICY IF EXISTS "admins_update_webhook_failures" ON webhook_failures;
CREATE POLICY "admins_update_webhook_failures" ON webhook_failures
  FOR UPDATE
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE is_admin = TRUE)
  );

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON COLUMN profiles.is_admin IS 'Super admin flag. Set ONLY via Supabase Dashboard or SQL migration — no API endpoint.';
COMMENT ON COLUMN profiles.status IS 'User account status: active (default), suspended (admin action), deleted (soft-delete).';
COMMENT ON COLUMN profiles.suspended_reason IS 'Admin-provided reason for suspension, visible in admin panel.';

-- =============================================
-- NOTE: To grant admin access to the first user:
-- UPDATE profiles SET is_admin = TRUE WHERE email = 'your-email@huntzen.io';
-- =============================================
