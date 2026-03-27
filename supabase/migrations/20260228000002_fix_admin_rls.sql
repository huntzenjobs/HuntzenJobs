-- ============================================================
-- Fix: RLS recursive policy on profiles
-- Replace subquery-based admin checks with SECURITY DEFINER function
-- to avoid infinite recursion when PostgREST evaluates policies
-- ============================================================

-- 1. Create SECURITY DEFINER function (bypasses RLS for admin check)
CREATE OR REPLACE FUNCTION is_admin(user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = user_id AND is_admin = TRUE);
$$;

-- 2. profiles
DROP POLICY IF EXISTS "admins_read_all_profiles" ON profiles;
CREATE POLICY "admins_read_all_profiles" ON profiles FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "admins_update_all_profiles" ON profiles;
CREATE POLICY "admins_update_all_profiles" ON profiles FOR UPDATE USING (is_admin());

-- 3. user_subscriptions
DROP POLICY IF EXISTS "admins_read_all_subscriptions" ON user_subscriptions;
CREATE POLICY "admins_read_all_subscriptions" ON user_subscriptions FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "admins_update_all_subscriptions" ON user_subscriptions;
CREATE POLICY "admins_update_all_subscriptions" ON user_subscriptions FOR ALL USING (is_admin());

-- 4. usage_quotas
DROP POLICY IF EXISTS "admins_read_all_quotas" ON usage_quotas;
CREATE POLICY "admins_read_all_quotas" ON usage_quotas FOR SELECT USING (is_admin());

-- 5. security_events
DROP POLICY IF EXISTS "admins_read_all_security_events" ON security_events;
CREATE POLICY "admins_read_all_security_events" ON security_events FOR SELECT USING (is_admin());

-- 6. subscription_plans
DROP POLICY IF EXISTS "admins_update_subscription_plans" ON subscription_plans;
CREATE POLICY "admins_update_subscription_plans" ON subscription_plans FOR UPDATE USING (is_admin());

-- 7. stripe_prices
DROP POLICY IF EXISTS "admins_manage_stripe_prices" ON stripe_prices;
CREATE POLICY "admins_manage_stripe_prices" ON stripe_prices FOR ALL USING (is_admin());

-- 8. recruiter_requests
DROP POLICY IF EXISTS "admins_read_all_recruiter_requests" ON recruiter_requests;
CREATE POLICY "admins_read_all_recruiter_requests" ON recruiter_requests FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "admins_update_recruiter_requests" ON recruiter_requests;
CREATE POLICY "admins_update_recruiter_requests" ON recruiter_requests FOR UPDATE USING (is_admin());

-- 9. subscription_history
DROP POLICY IF EXISTS "admins_read_subscription_history" ON subscription_history;
CREATE POLICY "admins_read_subscription_history" ON subscription_history FOR SELECT USING (is_admin());

-- 10. webhook_failures
DROP POLICY IF EXISTS "admins_read_webhook_failures" ON webhook_failures;
CREATE POLICY "admins_read_webhook_failures" ON webhook_failures FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "admins_update_webhook_failures" ON webhook_failures;
CREATE POLICY "admins_update_webhook_failures" ON webhook_failures FOR UPDATE USING (is_admin());
