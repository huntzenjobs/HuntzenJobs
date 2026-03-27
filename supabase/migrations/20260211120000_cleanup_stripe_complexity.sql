-- ============================================
-- CLEANUP STRIPE SERVICE COMPLEXITY
-- ============================================
-- Migration: 20260211120000_cleanup_stripe_complexity
-- Date: 2026-02-11
-- Purpose: Remove unnecessary tables and functions from over-engineered Stripe integration
--
-- WHAT WE'RE REMOVING:
-- 1. stripe_webhook_events table (Stripe handles idempotency natively)
-- 2. webhook_failures table (Railway logs are sufficient)
-- 3. All associated RPC functions (10 functions)
--
-- WHAT WE'RE KEEPING:
-- - subscription_plans
-- - user_subscriptions
-- - usage_quotas
-- - stripe_prices (needed for price lookups)
-- - get_stripe_price_id() RPC (needed by create_checkout_session)
--
-- WHY:
-- - Simplify architecture (872 lines → 477 lines in stripe.py)
-- - Reduce database complexity
-- - Stripe handles retries and idempotency better than we can
-- - Railway logs provide sufficient monitoring
-- ============================================

-- ============================================
-- STEP 1: Drop RPC Functions (10 functions)
-- ============================================

-- From webhook_failures.sql (5 functions)
DROP FUNCTION IF EXISTS log_webhook_failure(TEXT, TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_failed_webhooks_count(TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_webhook_failure_stats(INTEGER) CASCADE;
DROP FUNCTION IF EXISTS mark_webhook_failure_resolved(TEXT) CASCADE;
DROP FUNCTION IF EXISTS cleanup_old_webhook_failures() CASCADE;

-- From webhook_idempotency.sql (5 functions)
DROP FUNCTION IF EXISTS is_webhook_event_processed(TEXT) CASCADE;
DROP FUNCTION IF EXISTS mark_webhook_event_processed(TEXT, TEXT, JSONB) CASCADE;
DROP FUNCTION IF EXISTS get_webhook_event_status(TEXT) CASCADE;
DROP FUNCTION IF EXISTS cleanup_old_webhook_events() CASCADE;
DROP FUNCTION IF EXISTS get_webhook_processing_stats(INTEGER) CASCADE;

-- ============================================
-- STEP 2: Drop Tables (2 tables)
-- ============================================

-- Drop webhook_failures table (no longer needed, Railway logs sufficient)
DROP TABLE IF EXISTS webhook_failures CASCADE;

-- Drop stripe_webhook_events table (Stripe handles idempotency)
DROP TABLE IF EXISTS stripe_webhook_events CASCADE;

-- ============================================
-- STEP 3: Validation
-- ============================================

DO $$
DECLARE
  remaining_tables INTEGER;
  remaining_functions INTEGER;
BEGIN
  -- Check for remaining webhook tables
  SELECT COUNT(*) INTO remaining_tables
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('webhook_failures', 'stripe_webhook_events');

  IF remaining_tables > 0 THEN
    RAISE WARNING 'Some webhook tables still exist after cleanup';
  ELSE
    RAISE NOTICE '✅ All webhook tables successfully dropped';
  END IF;

  -- Check for remaining webhook functions
  SELECT COUNT(*) INTO remaining_functions
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'log_webhook_failure',
      'get_failed_webhooks_count',
      'get_webhook_failure_stats',
      'mark_webhook_failure_resolved',
      'cleanup_old_webhook_failures',
      'is_webhook_event_processed',
      'mark_webhook_event_processed',
      'get_webhook_event_status',
      'cleanup_old_webhook_events',
      'get_webhook_processing_stats'
    );

  IF remaining_functions > 0 THEN
    RAISE WARNING 'Some webhook functions still exist after cleanup';
  ELSE
    RAISE NOTICE '✅ All webhook functions successfully dropped';
  END IF;

  -- Verify essential tables still exist
  SELECT COUNT(*) INTO remaining_tables
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'subscription_plans',
      'user_subscriptions',
      'usage_quotas',
      'stripe_prices'
    );

  IF remaining_tables = 4 THEN
    RAISE NOTICE '✅ All essential tables preserved (subscription_plans, user_subscriptions, usage_quotas, stripe_prices)';
  ELSE
    RAISE WARNING 'Expected 4 essential tables, found %', remaining_tables;
  END IF;

  -- Log migration completion
  RAISE NOTICE '=== MIGRATION COMPLETE ===';
  RAISE NOTICE 'Removed 2 tables: webhook_failures, stripe_webhook_events';
  RAISE NOTICE 'Removed 10 functions: webhook tracking and idempotency functions';
  RAISE NOTICE 'Stripe service simplified from 872 to 477 lines';
  RAISE NOTICE 'Architecture: Stripe = source of truth, backend = read-only mirror';
END $$;

-- ============================================
-- END OF MIGRATION
-- ============================================
-- To rollback (if needed):
-- Restore tables and functions from:
-- - 20260210000000_webhook_failures.sql
-- - 20260210000002_webhook_idempotency.sql
-- ============================================
