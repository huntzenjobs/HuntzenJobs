-- ============================================
-- DEPRECATE SUBSCRIPTION FIELDS IN PROFILES TABLE
-- ============================================
-- Purpose: Mark old subscription columns as deprecated without removing them
-- Provides migration path while maintaining backward compatibility

-- ============================================
-- ENSURE REQUIRED COLUMNS EXIST
-- ============================================
-- Add stripe_price_id column if it doesn't exist (for retrocompatibility)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_subscriptions'
      AND column_name = 'stripe_price_id'
  ) THEN
    ALTER TABLE user_subscriptions ADD COLUMN stripe_price_id TEXT;
  END IF;
END $$;

-- Add deprecation comments to old subscription columns
COMMENT ON COLUMN profiles.subscription_tier IS 'DEPRECATED: Use user_subscriptions.plan_id instead. Will be removed in future migration. Do not use in new code.';
COMMENT ON COLUMN profiles.stripe_customer_id IS 'DEPRECATED: Use user_subscriptions.stripe_customer_id instead. Will be removed in future migration. Do not use in new code.';
COMMENT ON COLUMN profiles.stripe_subscription_id IS 'DEPRECATED: Use user_subscriptions.stripe_subscription_id instead. Will be removed in future migration. Do not use in new code.';
COMMENT ON COLUMN profiles.stripe_subscription_status IS 'DEPRECATED: Use user_subscriptions.status instead. Will be removed in future migration. Do not use in new code.';

-- Deprecate quota columns (replaced by usage_quotas table + subscription_plans.limits)
COMMENT ON COLUMN profiles.cv_analyses_limit IS 'DEPRECATED: Use subscription_plans.limits->cv_analyses instead. Will be removed in future migration.';
COMMENT ON COLUMN profiles.cv_analyses_used IS 'DEPRECATED: Use usage_quotas table instead. Will be removed in future migration.';
COMMENT ON COLUMN profiles.coach_messages_limit IS 'DEPRECATED: Use subscription_plans.limits->coach_seconds instead. Will be removed in future migration.';
COMMENT ON COLUMN profiles.coach_messages_used IS 'DEPRECATED: Use usage_quotas table instead. Will be removed in future migration.';
COMMENT ON COLUMN profiles.job_searches_limit IS 'DEPRECATED: Use subscription_plans.limits->job_searches instead. Will be removed in future migration.';
COMMENT ON COLUMN profiles.job_searches_used IS 'DEPRECATED: Use usage_quotas table instead. Will be removed in future migration.';
COMMENT ON COLUMN profiles.quota_reset_date IS 'DEPRECATED: Quotas now reset daily based on usage_quotas.quota_date. Will be removed in future migration.';

-- ============================================
-- CREATE UNIFIED VIEW FOR SUBSCRIPTION DATA
-- ============================================
-- This view provides a single source of truth combining user_subscriptions + subscription_plans
-- Use this instead of profiles table for all subscription-related queries

CREATE OR REPLACE VIEW user_subscription_unified AS
SELECT
  us.user_id,
  sp.id AS plan_id,
  sp.name AS plan_name,
  sp.display_name AS plan_display_name,
  sp.price_monthly,
  sp.price_yearly,
  sp.limits AS plan_limits,
  sp.features AS plan_features,

  us.id AS subscription_id,
  us.status AS subscription_status,
  us.stripe_subscription_id,
  us.stripe_customer_id,
  us.stripe_price_id,
  us.current_period_start,
  us.current_period_end,
  us.cancel_at_period_end,
  us.trial_start,
  us.trial_end,

  us.created_at AS subscription_created_at,
  us.updated_at AS subscription_updated_at

FROM user_subscriptions us
JOIN subscription_plans sp ON us.plan_id = sp.id
WHERE us.status IN ('active', 'trialing');

-- Grant access to view
GRANT SELECT ON user_subscription_unified TO authenticated, service_role;

COMMENT ON VIEW user_subscription_unified IS 'Unified view of active subscriptions. Use this instead of profiles table subscription fields. Combines user_subscriptions + subscription_plans for complete subscription data.';

-- ============================================
-- HELPER FUNCTION: Get user current subscription
-- ============================================
CREATE OR REPLACE FUNCTION get_user_current_subscription(p_user_id UUID)
RETURNS TABLE (
  plan_name TEXT,
  plan_display_name TEXT,
  plan_limits JSONB,
  subscription_status TEXT,
  stripe_subscription_id TEXT,
  current_period_end TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    usu.plan_name,
    usu.plan_display_name,
    usu.plan_limits,
    usu.subscription_status,
    usu.stripe_subscription_id,
    usu.current_period_end
  FROM user_subscription_unified usu
  WHERE usu.user_id = p_user_id
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_user_current_subscription(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION get_user_current_subscription IS 'Get current active subscription for a user. Returns NULL if no active subscription (free plan).';

-- ============================================
-- MIGRATION HELPER: Sync existing profiles to user_subscriptions
-- ============================================
-- This function syncs any profiles with deprecated subscription fields
-- to the new user_subscriptions table. Run once during migration.

CREATE OR REPLACE FUNCTION sync_profiles_to_user_subscriptions()
RETURNS TABLE (
  synced_users INTEGER,
  skipped_users INTEGER,
  errors TEXT[]
) AS $$
DECLARE
  v_synced INTEGER := 0;
  v_skipped INTEGER := 0;
  v_errors TEXT[] := ARRAY[]::TEXT[];
  v_profile RECORD;
  v_plan_id UUID;
BEGIN
  -- Loop through profiles with deprecated subscription_tier set
  FOR v_profile IN
    SELECT id, subscription_tier, stripe_customer_id, stripe_subscription_id, stripe_subscription_status
    FROM profiles
    WHERE subscription_tier IS NOT NULL
      AND subscription_tier != 'free'  -- Skip free users (should already be in user_subscriptions)
  LOOP
    BEGIN
      -- Check if user already has subscription in user_subscriptions
      IF EXISTS (
        SELECT 1 FROM user_subscriptions
        WHERE user_id = v_profile.id
          AND status IN ('active', 'trialing')
      ) THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      -- Get plan_id from subscription_plans
      SELECT id INTO v_plan_id
      FROM subscription_plans
      WHERE name = v_profile.subscription_tier
      LIMIT 1;

      IF v_plan_id IS NULL THEN
        v_errors := array_append(v_errors, 'Unknown plan: ' || v_profile.subscription_tier || ' for user ' || v_profile.id);
        CONTINUE;
      END IF;

      -- Create user_subscriptions record
      INSERT INTO user_subscriptions (
        user_id,
        plan_id,
        status,
        stripe_customer_id,
        stripe_subscription_id,
        current_period_start,
        current_period_end
      )
      VALUES (
        v_profile.id,
        v_plan_id,
        COALESCE(v_profile.stripe_subscription_status, 'active'),
        v_profile.stripe_customer_id,
        v_profile.stripe_subscription_id,
        NOW(),
        NOW() + INTERVAL '30 days'  -- Default 30 days, webhook will update with real value
      )
      ON CONFLICT (user_id, plan_id) WHERE status = 'active' DO NOTHING;

      v_synced := v_synced + 1;

    EXCEPTION WHEN OTHERS THEN
      v_errors := array_append(v_errors, 'Error syncing user ' || v_profile.id || ': ' || SQLERRM);
    END;
  END LOOP;

  RETURN QUERY SELECT v_synced, v_skipped, v_errors;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION sync_profiles_to_user_subscriptions() TO service_role;

COMMENT ON FUNCTION sync_profiles_to_user_subscriptions IS 'One-time migration helper to sync profiles.subscription_tier to user_subscriptions table. Safe to run multiple times (idempotent).';

-- ============================================
-- RUN SYNC (commented out - uncomment to execute)
-- ============================================
-- Uncomment the following line to sync existing data:
-- SELECT * FROM sync_profiles_to_user_subscriptions();
