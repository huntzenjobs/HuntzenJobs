-- ============================================
-- HuntZen JobSearch - Subscription Infrastructure ROLLBACK
-- Sprint 6 - Ticket S6-2
-- ============================================
-- Purpose: Safely rollback subscription infrastructure migration
-- Author: HuntZen Team
-- Date: 2026-01-28
-- Rollback for: 20260128000000_subscription_infrastructure
--
-- ⚠️ WARNING: This will delete ALL subscription data
-- ⚠️ Only use in emergency or on staging/test environments
-- ⚠️ Always create a backup before running this script
-- ============================================

-- ============================================
-- 1. PRE-ROLLBACK VALIDATION
-- ============================================

DO $$
DECLARE
  subscriptions_count INTEGER;
  quotas_count INTEGER;
BEGIN
  RAISE NOTICE '=== PRE-ROLLBACK VALIDATION ===';

  -- Count existing data that will be lost
  SELECT COUNT(*) INTO subscriptions_count FROM user_subscriptions;
  SELECT COUNT(*) INTO quotas_count FROM usage_quotas;

  RAISE NOTICE 'User subscriptions to be deleted: %', subscriptions_count;
  RAISE NOTICE 'Usage quotas to be deleted: %', quotas_count;

  -- Warn if significant data exists
  IF subscriptions_count > 100 THEN
    RAISE WARNING 'Rolling back % subscriptions - ensure backup exists!', subscriptions_count;
  END IF;

  IF quotas_count > 1000 THEN
    RAISE WARNING 'Rolling back % usage records - ensure backup exists!', quotas_count;
  END IF;
END $$;

-- ============================================
-- 2. DROP HELPER FUNCTIONS
-- ============================================

DROP FUNCTION IF EXISTS get_user_plan_limits(UUID);
DROP FUNCTION IF EXISTS has_active_subscription(UUID);

RAISE NOTICE '✅ Helper functions dropped';

-- ============================================
-- 3. DROP RLS POLICIES
-- ============================================

-- Usage Quotas policies
DROP POLICY IF EXISTS "usage_quotas_own_update" ON usage_quotas;
DROP POLICY IF EXISTS "usage_quotas_own_insert" ON usage_quotas;
DROP POLICY IF EXISTS "usage_quotas_own_read" ON usage_quotas;

-- User Subscriptions policies
DROP POLICY IF EXISTS "user_subscriptions_own_update" ON user_subscriptions;
DROP POLICY IF EXISTS "user_subscriptions_own_read" ON user_subscriptions;

-- Subscription Plans policies
DROP POLICY IF EXISTS "subscription_plans_public_read" ON subscription_plans;

RAISE NOTICE '✅ RLS policies dropped';

-- ============================================
-- 4. DROP INDEXES
-- ============================================

-- Usage Quotas indexes
DROP INDEX IF EXISTS idx_usage_quotas_date;
DROP INDEX IF EXISTS idx_usage_quotas_user_date;

-- User Subscriptions indexes
DROP INDEX IF EXISTS idx_user_subscriptions_active_period;
DROP INDEX IF EXISTS idx_user_subscriptions_stripe_customer;
DROP INDEX IF EXISTS idx_user_subscriptions_status;
DROP INDEX IF EXISTS idx_user_subscriptions_user_id;

-- Subscription Plans indexes
DROP INDEX IF EXISTS idx_subscription_plans_name;
DROP INDEX IF EXISTS idx_subscription_plans_active;

RAISE NOTICE '✅ Indexes dropped';

-- ============================================
-- 5. DROP TABLES (Cascade to delete all data)
-- ============================================

-- Drop in reverse dependency order
DROP TABLE IF EXISTS usage_quotas CASCADE;
RAISE NOTICE '✅ usage_quotas table dropped';

DROP TABLE IF EXISTS user_subscriptions CASCADE;
RAISE NOTICE '✅ user_subscriptions table dropped';

DROP TABLE IF EXISTS subscription_plans CASCADE;
RAISE NOTICE '✅ subscription_plans table dropped';

-- ============================================
-- 6. POST-ROLLBACK VALIDATION
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '=== POST-ROLLBACK VALIDATION ===';

  -- Verify tables are gone
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subscription_plans') THEN
    RAISE EXCEPTION 'Rollback failed: subscription_plans table still exists';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_subscriptions') THEN
    RAISE EXCEPTION 'Rollback failed: user_subscriptions table still exists';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'usage_quotas') THEN
    RAISE EXCEPTION 'Rollback failed: usage_quotas table still exists';
  END IF;

  -- Verify functions are gone
  IF EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_name = 'get_user_plan_limits'
  ) THEN
    RAISE EXCEPTION 'Rollback failed: get_user_plan_limits function still exists';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_name = 'has_active_subscription'
  ) THEN
    RAISE EXCEPTION 'Rollback failed: has_active_subscription function still exists';
  END IF;

  RAISE NOTICE '✅ All subscription infrastructure removed successfully';
  RAISE NOTICE '=== ROLLBACK COMPLETE ===';
END $$;

-- ============================================
-- 7. NEXT STEPS AFTER ROLLBACK
-- ============================================

-- IMPORTANT: After rollback, you may need to:
-- 1. Restore from backup if data recovery is needed
-- 2. Update application code to remove subscription checks
-- 3. Revert any API changes that depend on subscription tables
-- 4. Clear Redis cache for quota keys
-- 5. Notify users if subscription features are temporarily disabled

-- To restore from backup:
-- pg_restore --clean --if-exists --host=<host> --port=5432 \
--   --username=postgres --dbname=postgres \
--   backup_subscription_infrastructure_YYYYMMDD_HHMMSS.dump

-- ============================================
-- END OF ROLLBACK
-- ============================================
