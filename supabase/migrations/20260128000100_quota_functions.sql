-- ============================================
-- HuntZen JobSearch - Quota Enforcement Functions
-- Sprint 6 - Ticket S6-3
-- ============================================
-- Purpose: PostgreSQL functions for real-time quota checking and usage tracking
-- Author: HuntZen Team
-- Date: 2026-01-28
-- Migration: 20260128000100_quota_functions
--
-- Dependencies: 20260128000000_subscription_infrastructure.sql (must run first)
-- ============================================

-- Drop existing functions if they exist (to allow type changes)
DROP FUNCTION IF EXISTS check_user_quota(UUID, TEXT);
DROP FUNCTION IF EXISTS increment_usage(UUID, TEXT, INTEGER);
DROP FUNCTION IF EXISTS get_quota_status(UUID);

-- ============================================
-- 1. CHECK USER QUOTA FUNCTION
-- ============================================
-- Returns TRUE if user has quota available, FALSE otherwise
-- Features: cv_analysis, coach, job_search

CREATE OR REPLACE FUNCTION check_user_quota(
  p_user_id UUID,
  p_feature TEXT  -- 'cv_analysis', 'coach', 'job_search'
) RETURNS BOOLEAN AS $$
DECLARE
  v_limit INTEGER;
  v_used INTEGER;
  v_plan_limits JSONB;
  v_feature_key TEXT;
BEGIN
  -- Validate feature parameter
  IF p_feature NOT IN ('cv_analysis', 'coach', 'job_search') THEN
    RAISE EXCEPTION 'Invalid feature: %. Must be cv_analysis, coach, or job_search', p_feature;
  END IF;

  -- Map feature to JSONB key in subscription_plans
  v_feature_key := CASE p_feature
    WHEN 'cv_analysis' THEN 'cv_analyses'
    WHEN 'coach' THEN 'coach_seconds'
    WHEN 'job_search' THEN 'job_searches'
  END;

  -- Get user's active subscription limits
  SELECT sp.limits INTO v_plan_limits
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = p_user_id
    AND us.status = 'active'
    AND us.current_period_end > NOW()
  ORDER BY us.created_at DESC
  LIMIT 1;

  -- No active subscription = no access
  IF v_plan_limits IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Extract limit for this feature (-1 = unlimited)
  v_limit := (v_plan_limits->>v_feature_key)::INTEGER;

  -- Unlimited access (Premium plan)
  IF v_limit = -1 THEN
    RETURN TRUE;
  END IF;

  -- Get today's usage from usage_quotas table
  SELECT COALESCE(
    CASE p_feature
      WHEN 'cv_analysis' THEN cv_analyses_used
      WHEN 'coach' THEN coach_seconds_used
      WHEN 'job_search' THEN job_searches_used
    END, 0
  ) INTO v_used
  FROM usage_quotas
  WHERE user_id = p_user_id
    AND quota_date = CURRENT_DATE;

  -- If no usage record exists yet, user has full quota
  IF v_used IS NULL THEN
    v_used := 0;
  END IF;

  -- Return TRUE if user hasn't exceeded limit
  RETURN v_used < v_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION check_user_quota(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION check_user_quota IS 'Check if user has quota available for a feature. Returns TRUE if allowed, FALSE if quota exceeded.';

-- ============================================
-- 2. INCREMENT USAGE FUNCTION
-- ============================================
-- Increments usage counter for a feature
-- Creates usage_quotas record if it doesn''t exist

CREATE OR REPLACE FUNCTION increment_usage(
  p_user_id UUID,
  p_feature TEXT,  -- 'cv_analysis', 'coach', 'job_search'
  p_amount INTEGER DEFAULT 1
) RETURNS BOOLEAN AS $$
DECLARE
  v_rows_affected INTEGER;
BEGIN
  -- Validate inputs
  IF p_feature NOT IN ('cv_analysis', 'coach', 'job_search') THEN
    RAISE EXCEPTION 'Invalid feature: %', p_feature;
  END IF;

  IF p_amount < 0 THEN
    RAISE EXCEPTION 'Amount must be non-negative, got: %', p_amount;
  END IF;

  -- Insert or update usage quota for today
  INSERT INTO usage_quotas (user_id, quota_date, cv_analyses_used, coach_seconds_used, job_searches_used)
  VALUES (
    p_user_id,
    CURRENT_DATE,
    CASE WHEN p_feature = 'cv_analysis' THEN p_amount ELSE 0 END,
    CASE WHEN p_feature = 'coach' THEN p_amount ELSE 0 END,
    CASE WHEN p_feature = 'job_search' THEN p_amount ELSE 0 END
  )
  ON CONFLICT (user_id, quota_date) DO UPDATE SET
    cv_analyses_used = usage_quotas.cv_analyses_used +
      CASE WHEN p_feature = 'cv_analysis' THEN p_amount ELSE 0 END,
    coach_seconds_used = usage_quotas.coach_seconds_used +
      CASE WHEN p_feature = 'coach' THEN p_amount ELSE 0 END,
    job_searches_used = usage_quotas.job_searches_used +
      CASE WHEN p_feature = 'job_search' THEN p_amount ELSE 0 END,
    updated_at = NOW();

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  RETURN v_rows_affected > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION increment_usage(UUID, TEXT, INTEGER) TO authenticated;

COMMENT ON FUNCTION increment_usage IS 'Increment usage counter for a feature. Creates record if it doesn''t exist.';

-- ============================================
-- 3. GET QUOTA STATUS FUNCTION
-- ============================================
-- Returns detailed quota status for a user

CREATE OR REPLACE FUNCTION get_quota_status(p_user_id UUID)
RETURNS TABLE (
  feature TEXT,
  quota_limit INTEGER,
  quota_used INTEGER,
  quota_remaining INTEGER,
  quota_percentage NUMERIC,
  has_access BOOLEAN,
  reset_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  WITH user_plan AS (
    SELECT sp.limits
    FROM user_subscriptions us
    JOIN subscription_plans sp ON us.plan_id = sp.id
    WHERE us.user_id = p_user_id
      AND us.status = 'active'
      AND us.current_period_end > NOW()
    ORDER BY sp.sort_order DESC, us.created_at DESC
    LIMIT 1
  ),
  user_usage AS (
    SELECT
      cv_analyses_used,
      coach_seconds_used,
      job_searches_used
    FROM usage_quotas
    WHERE user_id = p_user_id
      AND quota_date = CURRENT_DATE
  )
  SELECT
    f.feature::TEXT,
    f.limit_value::INTEGER,
    COALESCE(
      CASE f.feature
        WHEN 'cv_analysis' THEN u.cv_analyses_used
        WHEN 'coach' THEN u.coach_seconds_used
        WHEN 'job_search' THEN u.job_searches_used
      END, 0
    )::INTEGER AS used,
    CASE
      WHEN f.limit_value = -1 THEN -1
      ELSE f.limit_value - COALESCE(
        CASE f.feature
          WHEN 'cv_analysis' THEN u.cv_analyses_used
          WHEN 'coach' THEN u.coach_seconds_used
          WHEN 'job_search' THEN u.job_searches_used
        END, 0
      )
    END::INTEGER AS remaining,
    CASE
      WHEN f.limit_value = -1 THEN 0.0
      WHEN f.limit_value = 0 THEN 100.0
      ELSE ROUND(
        (COALESCE(
          CASE f.feature
            WHEN 'cv_analysis' THEN u.cv_analyses_used
            WHEN 'coach' THEN u.coach_seconds_used
            WHEN 'job_search' THEN u.job_searches_used
          END, 0
        )::NUMERIC / f.limit_value::NUMERIC) * 100, 2
      )
    END::NUMERIC AS percentage,
    CASE
      WHEN f.limit_value = -1 THEN TRUE
      ELSE COALESCE(
        CASE f.feature
          WHEN 'cv_analysis' THEN u.cv_analyses_used
          WHEN 'coach' THEN u.coach_seconds_used
          WHEN 'job_search' THEN u.job_searches_used
        END, 0
      ) < f.limit_value
    END::BOOLEAN AS has_access,
    (CURRENT_DATE + INTERVAL '1 day')::TIMESTAMPTZ AS reset_at
  FROM (
    SELECT 'cv_analysis' AS feature, (up.limits->>'cv_analyses')::INTEGER AS limit_value FROM user_plan up
    UNION ALL
    SELECT 'coach' AS feature, (up.limits->>'coach_seconds')::INTEGER AS limit_value FROM user_plan up
    UNION ALL
    SELECT 'job_search' AS feature, (up.limits->>'job_searches')::INTEGER AS limit_value FROM user_plan up
  ) f
  LEFT JOIN user_usage u ON TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_quota_status(UUID) TO authenticated;

COMMENT ON FUNCTION get_quota_status IS 'Get detailed quota status for all features for a user.';

-- ============================================
-- 4. VALIDATION & TESTING
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '=== QUOTA FUNCTIONS MIGRATION COMPLETE ===';
  RAISE NOTICE 'Created 3 functions:';
  RAISE NOTICE '  - check_user_quota(user_id, feature) -> BOOLEAN';
  RAISE NOTICE '  - increment_usage(user_id, feature, amount) -> BOOLEAN';
  RAISE NOTICE '  - get_quota_status(user_id) -> TABLE';
  RAISE NOTICE '';
  RAISE NOTICE 'Test with:';
  RAISE NOTICE '  SELECT check_user_quota(auth.uid(), ''cv_analysis'');';
  RAISE NOTICE '  SELECT increment_usage(auth.uid(), ''cv_analysis'', 1);';
  RAISE NOTICE '  SELECT * FROM get_quota_status(auth.uid());';
END $$;

-- ============================================
-- END OF MIGRATION
-- ============================================
