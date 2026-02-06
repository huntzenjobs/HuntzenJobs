-- ============================================
-- JOB VIEWS TRACKING MIGRATION
-- ============================================
-- Purpose: Move job view tracking from localStorage to server-side
--
-- Problem: Job views only tracked in frontend localStorage
--   - Easy to bypass (clear localStorage)
--   - Not persistent across devices
--   - Not enforceable server-side
--
-- Solution: Add server-side tracking in usage_quotas table
--   - Add job_views_used column
--   - Update all quota functions to support 'job_view' feature
--   - Create API endpoint for tracking
--
-- Migration Date: 2026-02-04
-- ============================================

-- ============================================
-- 1. ADD JOB_VIEWS_USED COLUMN TO USAGE_QUOTAS
-- ============================================

ALTER TABLE usage_quotas
ADD COLUMN job_views_used INTEGER DEFAULT 0 CHECK (job_views_used >= 0);

COMMENT ON COLUMN usage_quotas.job_views_used IS 'Number of job details views consumed today. Free plan limited to 10 per day, paid plans unlimited.';

-- ============================================
-- 2. UPDATE SUBSCRIPTION PLAN LIMITS
-- ============================================
-- Add job_views to each plan's limits JSONB

UPDATE subscription_plans
SET limits = limits || '{"job_views": 10}'::jsonb
WHERE name = 'free';

UPDATE subscription_plans
SET limits = limits || '{"job_views": -1}'::jsonb
WHERE name = 'starter';

UPDATE subscription_plans
SET limits = limits || '{"job_views": -1}'::jsonb
WHERE name = 'pro';

UPDATE subscription_plans
SET limits = limits || '{"job_views": -1}'::jsonb
WHERE name = 'premium';

-- ============================================
-- 3. UPDATE CHECK_USER_QUOTA FUNCTION
-- ============================================
-- Add support for 'job_view' feature

CREATE OR REPLACE FUNCTION check_user_quota(
  p_user_id UUID,
  p_feature TEXT  -- 'cv_analysis' (or 'cv_analyses'), 'coach', 'job_search', 'job_view'
) RETURNS BOOLEAN AS $$
DECLARE
  v_limit INTEGER;
  v_used INTEGER;
  v_plan_limits JSONB;
  v_feature_key TEXT;
  v_normalized_feature TEXT;
BEGIN
  -- Normalize feature name (accept both singular and plural forms for cv_analysis)
  v_normalized_feature := p_feature;
  IF p_feature = 'cv_analyses' THEN
    v_normalized_feature := 'cv_analysis';
  END IF;

  -- Validate feature parameter
  IF v_normalized_feature NOT IN ('cv_analysis', 'coach', 'job_search', 'job_view') THEN
    RAISE EXCEPTION 'Invalid feature: %. Must be cv_analysis, coach, job_search, or job_view', p_feature;
  END IF;

  -- Map feature to JSONB key in subscription_plans
  v_feature_key := CASE v_normalized_feature
    WHEN 'cv_analysis' THEN 'cv_analyses'  -- Map singular → plural for DB lookup
    WHEN 'coach' THEN 'coach_seconds'
    WHEN 'job_search' THEN 'job_searches'
    WHEN 'job_view' THEN 'job_views'
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

  -- Unlimited access
  IF v_limit = -1 THEN
    RETURN TRUE;
  END IF;

  -- Get today's usage from usage_quotas table
  SELECT COALESCE(
    CASE v_normalized_feature
      WHEN 'cv_analysis' THEN cv_analyses_used
      WHEN 'coach' THEN coach_seconds_used
      WHEN 'job_search' THEN job_searches_used
      WHEN 'job_view' THEN job_views_used
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

COMMENT ON FUNCTION check_user_quota IS 'Check if user has quota available for a feature. Supports cv_analysis, coach, job_search, and job_view. Returns TRUE if allowed, FALSE if quota exceeded.';

-- ============================================
-- 4. UPDATE INCREMENT_USAGE FUNCTION
-- ============================================
-- Add support for incrementing job_views_used

CREATE OR REPLACE FUNCTION increment_usage(
  p_user_id UUID,
  p_feature TEXT,  -- 'cv_analysis' (or 'cv_analyses'), 'coach', 'job_search', 'job_view'
  p_amount INTEGER DEFAULT 1
) RETURNS BOOLEAN AS $$
DECLARE
  v_normalized_feature TEXT;
BEGIN
  -- Normalize feature name (accept both singular and plural forms for cv_analysis)
  v_normalized_feature := p_feature;
  IF p_feature = 'cv_analyses' THEN
    v_normalized_feature := 'cv_analysis';
  END IF;

  -- Validate feature parameter
  IF v_normalized_feature NOT IN ('cv_analysis', 'coach', 'job_search', 'job_view') THEN
    RAISE EXCEPTION 'Invalid feature: %. Must be cv_analysis, coach, job_search, or job_view', p_feature;
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
    job_searches_used,
    job_views_used
  ) VALUES (
    p_user_id,
    CURRENT_DATE,
    CASE WHEN v_normalized_feature = 'cv_analysis' THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'coach' THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'job_search' THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'job_view' THEN p_amount ELSE 0 END
  )
  ON CONFLICT (user_id, quota_date) DO UPDATE SET
    cv_analyses_used = usage_quotas.cv_analyses_used +
      CASE WHEN v_normalized_feature = 'cv_analysis' THEN p_amount ELSE 0 END,
    coach_seconds_used = usage_quotas.coach_seconds_used +
      CASE WHEN v_normalized_feature = 'coach' THEN p_amount ELSE 0 END,
    job_searches_used = usage_quotas.job_searches_used +
      CASE WHEN v_normalized_feature = 'job_search' THEN p_amount ELSE 0 END,
    job_views_used = usage_quotas.job_views_used +
      CASE WHEN v_normalized_feature = 'job_view' THEN p_amount ELSE 0 END,
    updated_at = NOW();

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION increment_usage IS 'Increment usage counter for a feature. Supports cv_analysis, coach, job_search, and job_view. Returns TRUE on success.';

-- ============================================
-- 5. UPDATE GET_QUOTA_STATUS FUNCTION
-- ============================================
-- Add job_view to returned quota status

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
      job_searches_used,
      job_views_used
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
      WHEN 'job_views' THEN 'job_view'
    END::TEXT AS feature,
    f.limit_value::INTEGER AS quota_limit,
    COALESCE(
      CASE f.internal_feature
        WHEN 'cv_analyses' THEN u.cv_analyses_used
        WHEN 'coach_seconds' THEN u.coach_seconds_used
        WHEN 'job_searches' THEN u.job_searches_used
        WHEN 'job_views' THEN u.job_views_used
      END, 0
    )::INTEGER AS quota_used,
    CASE
      WHEN f.limit_value = -1 THEN -1
      ELSE GREATEST(0, f.limit_value - COALESCE(
        CASE f.internal_feature
          WHEN 'cv_analyses' THEN u.cv_analyses_used
          WHEN 'coach_seconds' THEN u.coach_seconds_used
          WHEN 'job_searches' THEN u.job_searches_used
          WHEN 'job_views' THEN u.job_views_used
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
            WHEN 'job_views' THEN u.job_views_used
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
          WHEN 'job_views' THEN u.job_views_used
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
    UNION ALL
    SELECT 'job_views' AS internal_feature, (up.limits->>'job_views')::INTEGER AS limit_value FROM user_plan up
  ) f
  LEFT JOIN user_usage u ON TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_quota_status IS 'Get comprehensive quota status for all features including job_view. Returns singular feature names for API consistency.';

-- ============================================
-- ROLLBACK INSTRUCTIONS (if needed)
-- ============================================
-- To rollback this migration, run:
--
-- ALTER TABLE usage_quotas DROP COLUMN IF EXISTS job_views_used;
--
-- UPDATE subscription_plans SET limits = limits - 'job_views';
--
-- -- Then restore previous function versions (backup before running this migration)

-- ============================================
-- MIGRATION SUMMARY
-- ============================================
-- Changes:
--   ✅ Added job_views_used column to usage_quotas table
--   ✅ Updated subscription plan limits with job_views (10 for free, -1 for paid)
--   ✅ Updated check_user_quota() to support 'job_view' feature
--   ✅ Updated increment_usage() to track job_views_used
--   ✅ Updated get_quota_status() to return job_view quota info
--
-- Plan Limits:
--   - Free: 10 job views per day
--   - Starter/Pro/Premium: Unlimited (-1)
--
-- Testing:
--   SELECT check_user_quota('user-uuid', 'job_view');           -- Check if allowed
--   SELECT increment_usage('user-uuid', 'job_view', 1);         -- Track a view
--   SELECT * FROM get_quota_status('user-uuid');                -- Get all quotas
--   SELECT job_views_used FROM usage_quotas WHERE quota_date = CURRENT_DATE;  -- Verify tracking
-- ============================================
