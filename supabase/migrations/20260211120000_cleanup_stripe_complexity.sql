-- ============================================
-- CLEANUP STRIPE SERVICE COMPLEXITY
-- ============================================
-- Migration: 20260211120000_cleanup_stripe_complexity
-- Date: 2026-02-11
-- Purpose: Remove unnecessary tables and functions from over-engineered Stripe integration
--
-- Historical note: a previous version removed webhook audit tables here.
-- Later migrations and the current admin/backend code depend on them, so a
-- fresh rebuild must preserve both tables and their functions.
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

-- No destructive statement is intentionally executed here. Database-backed
-- idempotency and failure history are required for safe Stripe retries.

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

  IF remaining_tables = 2 THEN
    RAISE NOTICE 'Webhook audit tables preserved';
  ELSE
    RAISE WARNING 'Expected 2 webhook audit tables, found %', remaining_tables;
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
    RAISE NOTICE 'Webhook audit functions preserved';
  ELSE
    RAISE WARNING 'No webhook audit function found';
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
  RAISE NOTICE 'Preserved webhook_failures and stripe_webhook_events';
  RAISE NOTICE 'Architecture: Stripe is the financial source of truth; PostgreSQL keeps the auditable projection';
END $$;

-- ============================================
-- END OF MIGRATION
-- ============================================
-- No rollback is required: this migration now preserves existing objects.
-- ============================================
