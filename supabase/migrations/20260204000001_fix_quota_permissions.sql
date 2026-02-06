-- =====================================================
-- Migration: Fix Quota Permissions
-- Date: 2026-02-04
-- Description: Ensure all permissions are correct for
--              increment_usage function and usage_quotas table
-- =====================================================

-- Ensure increment_usage function has SECURITY DEFINER
-- (Should already be set, but re-applying for safety)
ALTER FUNCTION increment_usage(UUID, TEXT, INTEGER) SECURITY DEFINER;

-- Ensure check_user_quota function has SECURITY DEFINER
ALTER FUNCTION check_user_quota(UUID, TEXT) SECURITY DEFINER;

-- Ensure get_quota_status function has SECURITY DEFINER
ALTER FUNCTION get_quota_status(UUID) SECURITY DEFINER;

-- Grant INSERT and UPDATE permissions on usage_quotas to authenticated role
GRANT INSERT, UPDATE ON usage_quotas TO authenticated;

-- Grant SELECT permissions for quota checks
GRANT SELECT ON usage_quotas TO authenticated;

-- Ensure service_role has full access (for backend)
GRANT ALL ON usage_quotas TO service_role;
GRANT ALL ON subscription_plans TO service_role;
GRANT ALL ON user_subscriptions TO service_role;

-- Comment for documentation
COMMENT ON FUNCTION increment_usage IS 'Increments usage quota for a user. Uses SECURITY DEFINER to bypass RLS policies.';
COMMENT ON FUNCTION check_user_quota IS 'Checks if user has quota available for a feature. Uses SECURITY DEFINER to bypass RLS policies.';
COMMENT ON FUNCTION get_quota_status IS 'Gets detailed quota status for all features. Uses SECURITY DEFINER to bypass RLS policies.';
