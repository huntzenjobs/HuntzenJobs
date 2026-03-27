-- ============================================
-- FIX QUOTA FUNCTIONS — COMPLETE REWRITE
-- ============================================
-- Purpose:
--   1. Restore job_view support (lost in 20260306 migration)
--   2. Add recruiter_search support (new feature)
--   3. Add custom_limits admin override support (FIX 3)
--   4. Keep all existing features: job_search, cv_analysis, coach, assistant_messages
--
-- Migration Date: 2026-03-22
-- ============================================

-- ============================================
-- 1. ADD MISSING COLUMN FOR RECRUITER SEARCHES
-- ============================================

ALTER TABLE usage_quotas
  ADD COLUMN IF NOT EXISTS recruiter_searches_used INTEGER DEFAULT 0
    CHECK (recruiter_searches_used >= 0);

COMMENT ON COLUMN usage_quotas.recruiter_searches_used
  IS 'Number of recruiter searches used today. Free=3, Starter=10, Pro/Premium=unlimited.';

-- ============================================
-- 2. SEED recruiter_searches LIMITS IN PLANS
-- ============================================

UPDATE subscription_plans
SET limits = jsonb_set(COALESCE(limits, '{}'::jsonb), '{recruiter_searches}', '3'::jsonb)
WHERE name = 'free' AND NOT (limits ? 'recruiter_searches');

UPDATE subscription_plans
SET limits = jsonb_set(COALESCE(limits, '{}'::jsonb), '{recruiter_searches}', '10'::jsonb)
WHERE name = 'starter' AND NOT (limits ? 'recruiter_searches');

UPDATE subscription_plans
SET limits = jsonb_set(COALESCE(limits, '{}'::jsonb), '{recruiter_searches}', '-1'::jsonb)
WHERE name = 'pro' AND NOT (limits ? 'recruiter_searches');

UPDATE subscription_plans
SET limits = jsonb_set(COALESCE(limits, '{}'::jsonb), '{recruiter_searches}', '-1'::jsonb)
WHERE name = 'premium' AND NOT (limits ? 'recruiter_searches');

-- ============================================
-- 3. REPLACE increment_usage() — ALL 6 FEATURES
-- ============================================

CREATE OR REPLACE FUNCTION increment_usage(
  p_user_id UUID,
  p_feature TEXT,
  p_amount INTEGER DEFAULT 1
) RETURNS BOOLEAN AS $$
DECLARE
  v_normalized_feature TEXT;
BEGIN
  -- Normalize feature name
  v_normalized_feature := p_feature;
  IF p_feature = 'cv_analyses' THEN
    v_normalized_feature := 'cv_analysis';
  END IF;

  -- Validate feature parameter — 6 features supported
  IF v_normalized_feature NOT IN (
    'cv_analysis', 'coach', 'job_search', 'job_view',
    'assistant_messages', 'recruiter_search'
  ) THEN
    RAISE EXCEPTION 'Invalid feature: %. Must be one of: cv_analysis, coach, job_search, job_view, assistant_messages, recruiter_search', p_feature;
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
    job_views_used,
    assistant_messages_used,
    recruiter_searches_used
  ) VALUES (
    p_user_id,
    CURRENT_DATE,
    CASE WHEN v_normalized_feature = 'cv_analysis' THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'coach' THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'job_search' THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'job_view' THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'assistant_messages' THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'recruiter_search' THEN p_amount ELSE 0 END
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
    assistant_messages_used = usage_quotas.assistant_messages_used +
      CASE WHEN v_normalized_feature = 'assistant_messages' THEN p_amount ELSE 0 END,
    recruiter_searches_used = usage_quotas.recruiter_searches_used +
      CASE WHEN v_normalized_feature = 'recruiter_search' THEN p_amount ELSE 0 END,
    updated_at = NOW();

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_usage(UUID, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_usage(UUID, TEXT, INTEGER) TO service_role;

COMMENT ON FUNCTION increment_usage IS
  'Increment usage counter for a feature. Supports 6 features: cv_analysis, coach, job_search, job_view, assistant_messages, recruiter_search. Returns TRUE on success.';

-- ============================================
-- 4. REPLACE get_quota_status() — ALL 6 FEATURES + custom_limits
-- ============================================

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
  WITH user_sub AS (
    SELECT
      sp.limits AS plan_limits,
      us.custom_limits
    FROM user_subscriptions us
    JOIN subscription_plans sp ON us.plan_id = sp.id
    WHERE us.user_id = p_user_id
      AND us.status = 'active'
      AND us.current_period_end > NOW()
    LIMIT 1
  ),
  -- Fallback to free plan limits when user has no active subscription
  effective_sub AS (
    SELECT
      COALESCE(
        (SELECT plan_limits FROM user_sub),
        (SELECT limits FROM subscription_plans WHERE name = 'free' LIMIT 1)
      ) AS plan_limits,
      (SELECT custom_limits FROM user_sub) AS custom_limits
  ),
  user_usage AS (
    SELECT
      COALESCE(cv_analyses_used, 0) AS cv_analyses_used,
      COALESCE(coach_seconds_used, 0) AS coach_seconds_used,
      COALESCE(job_searches_used, 0) AS job_searches_used,
      COALESCE(job_views_used, 0) AS job_views_used,
      COALESCE(assistant_messages_used, 0) AS assistant_messages_used,
      COALESCE(recruiter_searches_used, 0) AS recruiter_searches_used
    FROM usage_quotas
    WHERE user_id = p_user_id
      AND quota_date = CURRENT_DATE
  )
  SELECT
    -- Return normalized feature name
    CASE f.internal_feature
      WHEN 'cv_analyses' THEN 'cv_analysis'
      WHEN 'coach_seconds' THEN 'coach'
      WHEN 'job_searches' THEN 'job_search'
      WHEN 'job_views' THEN 'job_view'
      WHEN 'assistant_messages' THEN 'assistant_messages'
      WHEN 'recruiter_searches' THEN 'recruiter_search'
    END::TEXT AS feature,
    -- custom_limits override plan_limits (FIX 3)
    f.effective_limit::INTEGER AS quota_limit,
    COALESCE(
      CASE f.internal_feature
        WHEN 'cv_analyses' THEN u.cv_analyses_used
        WHEN 'coach_seconds' THEN u.coach_seconds_used
        WHEN 'job_searches' THEN u.job_searches_used
        WHEN 'job_views' THEN u.job_views_used
        WHEN 'assistant_messages' THEN u.assistant_messages_used
        WHEN 'recruiter_searches' THEN u.recruiter_searches_used
      END, 0
    )::INTEGER AS quota_used,
    CASE
      WHEN f.effective_limit = -1 THEN -1
      ELSE GREATEST(0, f.effective_limit - COALESCE(
        CASE f.internal_feature
          WHEN 'cv_analyses' THEN u.cv_analyses_used
          WHEN 'coach_seconds' THEN u.coach_seconds_used
          WHEN 'job_searches' THEN u.job_searches_used
          WHEN 'job_views' THEN u.job_views_used
          WHEN 'assistant_messages' THEN u.assistant_messages_used
          WHEN 'recruiter_searches' THEN u.recruiter_searches_used
        END, 0
      ))
    END::INTEGER AS quota_remaining,
    CASE
      WHEN f.effective_limit = -1 THEN 0.0
      WHEN f.effective_limit = 0 THEN 100.0
      ELSE ROUND(
        (COALESCE(
          CASE f.internal_feature
            WHEN 'cv_analyses' THEN u.cv_analyses_used
            WHEN 'coach_seconds' THEN u.coach_seconds_used
            WHEN 'job_searches' THEN u.job_searches_used
            WHEN 'job_views' THEN u.job_views_used
            WHEN 'assistant_messages' THEN u.assistant_messages_used
            WHEN 'recruiter_searches' THEN u.recruiter_searches_used
          END, 0
        )::NUMERIC / f.effective_limit::NUMERIC) * 100, 2
      )
    END::NUMERIC AS quota_percentage,
    CASE
      WHEN f.effective_limit = -1 THEN TRUE
      ELSE COALESCE(
        CASE f.internal_feature
          WHEN 'cv_analyses' THEN u.cv_analyses_used
          WHEN 'coach_seconds' THEN u.coach_seconds_used
          WHEN 'job_searches' THEN u.job_searches_used
          WHEN 'job_views' THEN u.job_views_used
          WHEN 'assistant_messages' THEN u.assistant_messages_used
          WHEN 'recruiter_searches' THEN u.recruiter_searches_used
        END, 0
      ) < f.effective_limit
    END::BOOLEAN AS has_access,
    (CURRENT_DATE + INTERVAL '1 day')::TIMESTAMPTZ AS reset_at
  FROM (
    -- Extract limits: custom_limits override plan_limits via COALESCE
    SELECT
      'cv_analyses' AS internal_feature,
      COALESCE(
        (es.custom_limits->>'cv_analyses')::INTEGER,
        (es.plan_limits->>'cv_analyses')::INTEGER,
        0
      ) AS effective_limit
    FROM effective_sub es
    UNION ALL
    SELECT
      'coach_seconds',
      COALESCE(
        (es.custom_limits->>'coach_seconds')::INTEGER,
        (es.plan_limits->>'coach_seconds')::INTEGER,
        0
      )
    FROM effective_sub es
    UNION ALL
    SELECT
      'job_searches',
      COALESCE(
        (es.custom_limits->>'job_searches')::INTEGER,
        (es.plan_limits->>'job_searches')::INTEGER,
        0
      )
    FROM effective_sub es
    UNION ALL
    SELECT
      'job_views',
      COALESCE(
        (es.custom_limits->>'job_views')::INTEGER,
        (es.plan_limits->>'job_views')::INTEGER,
        0
      )
    FROM effective_sub es
    UNION ALL
    SELECT
      'assistant_messages',
      COALESCE(
        (es.custom_limits->>'assistant_messages')::INTEGER,
        (es.plan_limits->>'assistant_messages')::INTEGER,
        0
      )
    FROM effective_sub es
    UNION ALL
    SELECT
      'recruiter_searches',
      COALESCE(
        (es.custom_limits->>'recruiter_searches')::INTEGER,
        (es.plan_limits->>'recruiter_searches')::INTEGER,
        0
      )
    FROM effective_sub es
  ) f
  LEFT JOIN user_usage u ON TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_quota_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_quota_status(UUID) TO service_role;

COMMENT ON FUNCTION get_quota_status IS
  'Get quota status for all 6 features. Reads custom_limits from user_subscriptions as admin override (priority over plan limits). Falls back to free plan for users without active subscription.';

-- ============================================
-- 5. UPDATE check_user_quota() — ALL 6 FEATURES
-- ============================================

CREATE OR REPLACE FUNCTION check_user_quota(
  p_user_id UUID,
  p_feature TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_limit INTEGER;
  v_used INTEGER;
  v_plan_limits JSONB;
  v_custom_limits JSONB;
  v_feature_key TEXT;
  v_normalized_feature TEXT;
BEGIN
  -- Normalize feature name
  v_normalized_feature := p_feature;
  IF p_feature = 'cv_analyses' THEN
    v_normalized_feature := 'cv_analysis';
  END IF;

  -- Validate feature parameter
  IF v_normalized_feature NOT IN (
    'cv_analysis', 'coach', 'job_search', 'job_view',
    'assistant_messages', 'recruiter_search'
  ) THEN
    RAISE EXCEPTION 'Invalid feature: %. Must be one of: cv_analysis, coach, job_search, job_view, assistant_messages, recruiter_search', p_feature;
  END IF;

  -- Map feature to JSONB key in subscription_plans
  v_feature_key := CASE v_normalized_feature
    WHEN 'cv_analysis' THEN 'cv_analyses'
    WHEN 'coach' THEN 'coach_seconds'
    WHEN 'job_search' THEN 'job_searches'
    WHEN 'job_view' THEN 'job_views'
    WHEN 'assistant_messages' THEN 'assistant_messages'
    WHEN 'recruiter_search' THEN 'recruiter_searches'
  END;

  -- Get user's active subscription limits + custom_limits
  SELECT sp.limits, us.custom_limits
  INTO v_plan_limits, v_custom_limits
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = p_user_id
    AND us.status = 'active'
    AND us.current_period_end > NOW()
  ORDER BY us.created_at DESC
  LIMIT 1;

  -- No active subscription: fallback to free plan
  IF v_plan_limits IS NULL THEN
    SELECT limits INTO v_plan_limits
    FROM subscription_plans WHERE name = 'free' LIMIT 1;
    IF v_plan_limits IS NULL THEN
      RETURN FALSE;
    END IF;
  END IF;

  -- custom_limits override plan_limits
  v_limit := COALESCE(
    (v_custom_limits->>v_feature_key)::INTEGER,
    (v_plan_limits->>v_feature_key)::INTEGER,
    0
  );

  -- Unlimited access
  IF v_limit = -1 THEN
    RETURN TRUE;
  END IF;

  -- Get today's usage
  SELECT COALESCE(
    CASE v_normalized_feature
      WHEN 'cv_analysis' THEN cv_analyses_used
      WHEN 'coach' THEN coach_seconds_used
      WHEN 'job_search' THEN job_searches_used
      WHEN 'job_view' THEN job_views_used
      WHEN 'assistant_messages' THEN assistant_messages_used
      WHEN 'recruiter_search' THEN recruiter_searches_used
    END, 0
  ) INTO v_used
  FROM usage_quotas
  WHERE user_id = p_user_id
    AND quota_date = CURRENT_DATE;

  IF v_used IS NULL THEN
    v_used := 0;
  END IF;

  RETURN v_used < v_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION check_user_quota(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION check_user_quota(UUID, TEXT) TO service_role;

COMMENT ON FUNCTION check_user_quota IS
  'Check if user has quota for a feature. Supports all 6 features. custom_limits override plan limits. Falls back to free plan.';

-- ============================================
-- MIGRATION SUMMARY
-- ============================================
-- Changes:
--   usage_quotas.recruiter_searches_used column added
--   subscription_plans.limits updated with recruiter_searches for all plans
--   increment_usage() supports 6 features: cv_analysis, coach, job_search, job_view, assistant_messages, recruiter_search
--   get_quota_status() supports 6 features + custom_limits admin override
--   check_user_quota() supports 6 features + custom_limits admin override
--   All functions fall back to free plan for users without active subscription
--
-- Plan limits for recruiter_searches:
--   free:    3/day
--   starter: 10/day
--   pro:     unlimited (-1)
--   premium: unlimited (-1)
-- ============================================
