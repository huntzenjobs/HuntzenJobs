-- ============================================
-- NOMENCLATURE STANDARDIZATION MIGRATION
-- ============================================
-- Purpose: Standardize CV analysis feature naming across API and database
--
-- Problem: Inconsistent naming causes confusion
--   - API/Python: "cv_analysis" (singular)
--   - Database column: cv_analyses_used (plural)
--   - Database JSON key: 'cv_analyses' (plural)
--
-- Solution: Accept both forms, normalize to singular internally
--   - Maintain backward compatibility
--   - Map singular → plural for database lookups
--
-- Migration Date: 2026-02-04
-- ============================================

-- ============================================
-- 1. UPDATE CHECK_USER_QUOTA FUNCTION
-- ============================================
-- Add backward compatibility: accept both 'cv_analysis' and 'cv_analyses'

CREATE OR REPLACE FUNCTION check_user_quota(
  p_user_id UUID,
  p_feature TEXT  -- 'cv_analysis' (or 'cv_analyses'), 'coach', 'job_search'
) RETURNS BOOLEAN AS $$
DECLARE
  v_limit INTEGER;
  v_used INTEGER;
  v_plan_limits JSONB;
  v_feature_key TEXT;
  v_normalized_feature TEXT;
BEGIN
  -- Normalize feature name (accept both singular and plural forms)
  v_normalized_feature := p_feature;
  IF p_feature = 'cv_analyses' THEN
    v_normalized_feature := 'cv_analysis';
  END IF;

  -- Validate feature parameter
  IF v_normalized_feature NOT IN ('cv_analysis', 'coach', 'job_search') THEN
    RAISE EXCEPTION 'Invalid feature: %. Must be cv_analysis, coach, or job_search', p_feature;
  END IF;

  -- Map feature to JSONB key in subscription_plans
  v_feature_key := CASE v_normalized_feature
    WHEN 'cv_analysis' THEN 'cv_analyses'  -- Map singular → plural for DB lookup
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
    CASE v_normalized_feature
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

COMMENT ON FUNCTION check_user_quota IS 'Check if user has quota available for a feature. Accepts both cv_analysis (singular) and cv_analyses (plural) for backward compatibility. Returns TRUE if allowed, FALSE if quota exceeded.';

-- ============================================
-- 2. UPDATE INCREMENT_USAGE FUNCTION
-- ============================================
-- Add backward compatibility for increment function

CREATE OR REPLACE FUNCTION increment_usage(
  p_user_id UUID,
  p_feature TEXT,  -- 'cv_analysis' (or 'cv_analyses'), 'coach', 'job_search'
  p_amount INTEGER DEFAULT 1
) RETURNS BOOLEAN AS $$
DECLARE
  v_normalized_feature TEXT;
BEGIN
  -- Normalize feature name (accept both singular and plural forms)
  v_normalized_feature := p_feature;
  IF p_feature = 'cv_analyses' THEN
    v_normalized_feature := 'cv_analysis';
  END IF;

  -- Validate feature parameter
  IF v_normalized_feature NOT IN ('cv_analysis', 'coach', 'job_search') THEN
    RAISE EXCEPTION 'Invalid feature: %. Must be cv_analysis, coach, or job_search', p_feature;
  END IF;

  -- Validate amount
  IF p_amount < 0 THEN
    RAISE EXCEPTION 'Amount must be non-negative, got: %', p_amount;
  END IF;

  -- Insert or update usage record
  INSERT INTO usage_quotas (
    user_id,
    quota_date,
    cv_analyses_used,
    coach_seconds_used,
    job_searches_used
  ) VALUES (
    p_user_id,
    CURRENT_DATE,
    CASE WHEN v_normalized_feature = 'cv_analysis' THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'coach' THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'job_search' THEN p_amount ELSE 0 END
  )
  ON CONFLICT (user_id, quota_date) DO UPDATE SET
    cv_analyses_used = usage_quotas.cv_analyses_used +
      CASE WHEN v_normalized_feature = 'cv_analysis' THEN p_amount ELSE 0 END,
    coach_seconds_used = usage_quotas.coach_seconds_used +
      CASE WHEN v_normalized_feature = 'coach' THEN p_amount ELSE 0 END,
    job_searches_used = usage_quotas.job_searches_used +
      CASE WHEN v_normalized_feature = 'job_search' THEN p_amount ELSE 0 END,
    updated_at = NOW();

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION increment_usage(UUID, TEXT, INTEGER) TO authenticated;

COMMENT ON FUNCTION increment_usage IS 'Increment usage counter for a feature. Accepts both cv_analysis (singular) and cv_analyses (plural) for backward compatibility. Returns TRUE on success.';

-- ============================================
-- 3. UPDATE GET_QUOTA_STATUS FUNCTION
-- ============================================
-- Ensure quota status function uses normalized naming

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
    -- Return singular form for consistency with API
    CASE f.internal_feature
      WHEN 'cv_analyses' THEN 'cv_analysis'
      WHEN 'coach_seconds' THEN 'coach'
      WHEN 'job_searches' THEN 'job_search'
    END::TEXT AS feature,
    f.limit_value::INTEGER AS quota_limit,
    COALESCE(
      CASE f.internal_feature
        WHEN 'cv_analyses' THEN u.cv_analyses_used
        WHEN 'coach_seconds' THEN u.coach_seconds_used
        WHEN 'job_searches' THEN u.job_searches_used
      END, 0
    )::INTEGER AS quota_used,
    CASE
      WHEN f.limit_value = -1 THEN -1
      ELSE GREATEST(0, f.limit_value - COALESCE(
        CASE f.internal_feature
          WHEN 'cv_analyses' THEN u.cv_analyses_used
          WHEN 'coach_seconds' THEN u.coach_seconds_used
          WHEN 'job_searches' THEN u.job_searches_used
        END, 0
      ))
    END::INTEGER AS quota_remaining,
    CASE
      WHEN f.limit_value = -1 THEN 0.0
      WHEN f.limit_value = 0 THEN 100.0
      ELSE ROUND(
        (COALESCE(
          CASE f.internal_feature
            WHEN 'cv_analyses' THEN u.cv_analyses_used
            WHEN 'coach_seconds' THEN u.coach_seconds_used
            WHEN 'job_searches' THEN u.job_searches_used
          END, 0
        )::NUMERIC / f.limit_value::NUMERIC) * 100, 2
      )
    END::NUMERIC AS quota_percentage,
    CASE
      WHEN f.limit_value = -1 THEN TRUE
      ELSE COALESCE(
        CASE f.internal_feature
          WHEN 'cv_analyses' THEN u.cv_analyses_used
          WHEN 'coach_seconds' THEN u.coach_seconds_used
          WHEN 'job_searches' THEN u.job_searches_used
        END, 0
      ) < f.limit_value
    END::BOOLEAN AS has_access,
    (CURRENT_DATE + INTERVAL '1 day')::TIMESTAMPTZ AS reset_at
  FROM (
    -- Extract limits from plan JSONB (using internal plural keys)
    SELECT 'cv_analyses' AS internal_feature, (up.limits->>'cv_analyses')::INTEGER AS limit_value FROM user_plan up
    UNION ALL
    SELECT 'coach_seconds' AS internal_feature, (up.limits->>'coach_seconds')::INTEGER AS limit_value FROM user_plan up
    UNION ALL
    SELECT 'job_searches' AS internal_feature, (up.limits->>'job_searches')::INTEGER AS limit_value FROM user_plan up
  ) f
  LEFT JOIN user_usage u ON TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_quota_status(UUID) TO authenticated;

COMMENT ON FUNCTION get_quota_status IS 'Get comprehensive quota status for all features. Returns singular feature names (cv_analysis, coach, job_search) for API consistency.';

-- ============================================
-- MIGRATION SUMMARY
-- ============================================
-- Changes:
--   ✅ check_user_quota() now accepts both 'cv_analysis' and 'cv_analyses'
--   ✅ increment_usage() now accepts both 'cv_analysis' and 'cv_analyses'
--   ✅ get_quota_status() returns singular 'cv_analysis' for API consistency
--   ✅ Internal database schema unchanged (backward compatible)
--   ✅ All functions normalize input to singular form internally
--
-- Backward Compatibility:
--   - Old code using 'cv_analyses' continues to work
--   - New code using 'cv_analysis' works correctly
--   - Database column names unchanged (cv_analyses_used)
--   - JSON keys in subscription_plans unchanged ('cv_analyses')
--
-- Testing:
--   SELECT check_user_quota('user-uuid', 'cv_analysis');   -- Works
--   SELECT check_user_quota('user-uuid', 'cv_analyses');   -- Also works
--   SELECT increment_usage('user-uuid', 'cv_analysis', 1); -- Works
--   SELECT increment_usage('user-uuid', 'cv_analyses', 1); -- Also works
--   SELECT * FROM get_quota_status('user-uuid');           -- Returns 'cv_analysis'
-- ============================================
