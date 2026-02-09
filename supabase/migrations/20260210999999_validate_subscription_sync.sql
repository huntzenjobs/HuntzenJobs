-- ============================================
-- VALIDATION SCRIPT - Check subscription data consistency
-- ============================================
-- Run this after deployment to verify all synchronization issues are resolved
-- This is a diagnostic migration that reports issues but doesn't fix them

DO $$
DECLARE
  users_count INTEGER;
  subscriptions_count INTEGER;
  active_subscriptions_count INTEGER;
  profiles_with_deprecated_data INTEGER;
  orphaned_subscriptions INTEGER;
  webhook_events_count INTEGER;
  webhook_failures_count INTEGER;
  stripe_prices_count INTEGER;
  mismatched_periods INTEGER;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'SUBSCRIPTION SYNCHRONIZATION VALIDATION';
  RAISE NOTICE 'Date: %', NOW();
  RAISE NOTICE '========================================';
  RAISE NOTICE '';

  -- ============================================
  -- BASIC STATISTICS
  -- ============================================
  RAISE NOTICE '1. BASIC STATISTICS';
  RAISE NOTICE '-------------------';

  -- Count users
  SELECT COUNT(*) INTO users_count FROM auth.users;
  RAISE NOTICE '✓ Total users: %', users_count;

  -- Count subscriptions
  SELECT COUNT(*) INTO subscriptions_count FROM user_subscriptions;
  RAISE NOTICE '✓ Total subscriptions: %', subscriptions_count;

  -- Count active subscriptions
  SELECT COUNT(*) INTO active_subscriptions_count
  FROM user_subscriptions WHERE status = 'active';
  RAISE NOTICE '✓ Active subscriptions: %', active_subscriptions_count;

  RAISE NOTICE '';

  -- ============================================
  -- CHECK FOR DATA CONSISTENCY ISSUES
  -- ============================================
  RAISE NOTICE '2. DATA CONSISTENCY CHECKS';
  RAISE NOTICE '---------------------------';

  -- Check for profiles with deprecated subscription_tier that doesn't match user_subscriptions
  SELECT COUNT(*) INTO profiles_with_deprecated_data
  FROM profiles p
  WHERE p.subscription_tier IS NOT NULL
    AND p.subscription_tier != COALESCE((
      SELECT sp.name FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE us.user_id = p.id AND us.status = 'active'
      LIMIT 1
    ), 'free');

  IF profiles_with_deprecated_data > 0 THEN
    RAISE WARNING '⚠️  % profiles have mismatched subscription_tier (deprecated field)', profiles_with_deprecated_data;
    RAISE NOTICE '    Action: Run sync_profiles_to_user_subscriptions() to fix';
  ELSE
    RAISE NOTICE '✓ All profiles subscription_tier matches user_subscriptions';
  END IF;

  -- Check for orphaned subscriptions (user doesn't exist)
  SELECT COUNT(*) INTO orphaned_subscriptions
  FROM user_subscriptions us
  WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = us.user_id);

  IF orphaned_subscriptions > 0 THEN
    RAISE WARNING '⚠️  % orphaned subscriptions (user deleted)', orphaned_subscriptions;
  ELSE
    RAISE NOTICE '✓ No orphaned subscriptions';
  END IF;

  -- Check for users with multiple active subscriptions (should be impossible)
  DECLARE
    multi_sub_count INTEGER;
  BEGIN
    SELECT COUNT(*) INTO multi_sub_count
    FROM (
      SELECT user_id, COUNT(*) as sub_count
      FROM user_subscriptions
      WHERE status = 'active'
      GROUP BY user_id
      HAVING COUNT(*) > 1
    ) multi_subs;

    IF multi_sub_count > 0 THEN
      RAISE WARNING '⚠️  % users have multiple active subscriptions (data integrity issue!)', multi_sub_count;
    ELSE
      RAISE NOTICE '✓ No users with multiple active subscriptions';
    END IF;
  END;

  RAISE NOTICE '';

  -- ============================================
  -- CHECK STRIPE INTEGRATION
  -- ============================================
  RAISE NOTICE '3. STRIPE INTEGRATION CHECKS';
  RAISE NOTICE '-----------------------------';

  -- Check webhook events table
  SELECT COUNT(*) INTO webhook_events_count FROM stripe_webhook_events;
  RAISE NOTICE '✓ Webhook events processed: %', webhook_events_count;

  -- Check webhook failures
  SELECT COUNT(*) INTO webhook_failures_count
  FROM webhook_failures
  WHERE NOT resolved
    AND created_at > NOW() - INTERVAL '7 days';

  IF webhook_failures_count > 0 THEN
    RAISE WARNING '⚠️  % unresolved webhook failures in last 7 days', webhook_failures_count;
    RAISE NOTICE '    Check: SELECT * FROM webhook_failures WHERE NOT resolved ORDER BY created_at DESC';
  ELSE
    RAISE NOTICE '✓ No unresolved webhook failures in last 7 days';
  END IF;

  -- Check Stripe price configuration
  SELECT COUNT(*) INTO stripe_prices_count FROM stripe_prices WHERE is_active = true;

  IF stripe_prices_count > 0 THEN
    RAISE NOTICE '✓ Stripe prices configured: % active prices', stripe_prices_count;
  ELSE
    RAISE WARNING '⚠️  No active Stripe prices found';
  END IF;

  -- Check for subscriptions with hardcoded periods (should use Stripe's actual periods)
  SELECT COUNT(*) INTO mismatched_periods
  FROM user_subscriptions
  WHERE stripe_subscription_id IS NOT NULL
    AND (
      -- Check if period is exactly 30 or 365 days (indicates hardcoded calculation)
      EXTRACT(EPOCH FROM (current_period_end - current_period_start)) IN (2592000, 31536000)
    );

  IF mismatched_periods > 0 THEN
    RAISE WARNING '⚠️  % subscriptions have potentially hardcoded periods (should use Stripe actual)', mismatched_periods;
    RAISE NOTICE '    This is expected for old subscriptions. New ones should use Stripe periods.';
  ELSE
    RAISE NOTICE '✓ All subscriptions use Stripe actual periods';
  END IF;

  RAISE NOTICE '';

  -- ============================================
  -- CHECK QUOTA SYSTEM
  -- ============================================
  RAISE NOTICE '4. QUOTA SYSTEM CHECKS';
  RAISE NOTICE '----------------------';

  -- Check daily quota reset function
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'reset_quotas_rpc'
  ) THEN
    RAISE NOTICE '✓ Quota reset RPC function exists';
  ELSE
    RAISE WARNING '⚠️  Quota reset function missing';
  END IF;

  -- Check usage_quotas table
  DECLARE
    quota_records_count INTEGER;
    oldest_quota_date DATE;
    newest_quota_date DATE;
  BEGIN
    SELECT COUNT(*), MIN(quota_date), MAX(quota_date)
    INTO quota_records_count, oldest_quota_date, newest_quota_date
    FROM usage_quotas;

    RAISE NOTICE '✓ Usage quota records: %', quota_records_count;
    IF quota_records_count > 0 THEN
      RAISE NOTICE '  Oldest quota date: %', oldest_quota_date;
      RAISE NOTICE '  Newest quota date: %', newest_quota_date;

      -- Check for old records that should be cleaned up
      DECLARE
        old_records_count INTEGER;
      BEGIN
        SELECT COUNT(*) INTO old_records_count
        FROM usage_quotas
        WHERE quota_date < CURRENT_DATE - INTERVAL '7 days';

        IF old_records_count > 0 THEN
          RAISE WARNING '⚠️  % quota records older than 7 days (should be cleaned)', old_records_count;
          RAISE NOTICE '    Action: Call cleanup_usage_quotas() or wait for cron job';
        ELSE
          RAISE NOTICE '✓ No old quota records (cleanup working)';
        END IF;
      END;
    END IF;
  END;

  RAISE NOTICE '';

  -- ============================================
  -- CHECK DATABASE FUNCTIONS
  -- ============================================
  RAISE NOTICE '5. DATABASE FUNCTIONS CHECK';
  RAISE NOTICE '---------------------------';

  -- List all critical functions and their existence
  DECLARE
    func_names TEXT[] := ARRAY[
      'check_user_quota',
      'increment_usage',
      'get_quota_status',
      'get_user_current_subscription',
      'is_webhook_event_processed',
      'mark_webhook_event_processed',
      'get_stripe_price_id',
      'log_webhook_failure',
      'get_webhook_failure_stats'
    ];
    func_name TEXT;
    func_exists BOOLEAN;
  BEGIN
    FOREACH func_name IN ARRAY func_names
    LOOP
      SELECT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = func_name
      ) INTO func_exists;

      IF func_exists THEN
        RAISE NOTICE '✓ Function exists: %', func_name;
      ELSE
        RAISE WARNING '⚠️  Missing function: %', func_name;
      END IF;
    END LOOP;
  END;

  RAISE NOTICE '';

  -- ============================================
  -- FINAL SUMMARY
  -- ============================================
  RAISE NOTICE '========================================';
  RAISE NOTICE 'VALIDATION SUMMARY';
  RAISE NOTICE '========================================';

  DECLARE
    total_issues INTEGER := 0;
  BEGIN
    IF profiles_with_deprecated_data > 0 THEN total_issues := total_issues + 1; END IF;
    IF orphaned_subscriptions > 0 THEN total_issues := total_issues + 1; END IF;
    IF webhook_failures_count > 0 THEN total_issues := total_issues + 1; END IF;
    IF stripe_prices_count = 0 THEN total_issues := total_issues + 1; END IF;

    IF total_issues = 0 THEN
      RAISE NOTICE '✅ VALIDATION PASSED - No critical issues found';
      RAISE NOTICE '   System is ready for production use';
    ELSE
      RAISE WARNING '⚠️  VALIDATION FOUND % ISSUE(S)', total_issues;
      RAISE NOTICE '   Review warnings above and take recommended actions';
    END IF;
  END;

  RAISE NOTICE '';
  RAISE NOTICE 'Validation completed at: %', NOW();
  RAISE NOTICE '========================================';
END $$;
