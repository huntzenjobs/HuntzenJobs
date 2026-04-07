-- ============================================
-- FIX: get_quota_status + check_user_quota — ALL 8 FEATURES
-- ============================================
-- Bug: migration 20260323000005 rewrote get_quota_status() but dropped
--   job_view and recruiter_search. check_user_quota() from 20260322000001
--   doesn't support cv_adapt and cover_letter.
-- Fix: both functions now support all 8 features consistently.
-- ============================================

-- 1. REPLACE get_quota_status() — ALL 8 FEATURES
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
    SELECT sp.limits, us.custom_limits
    FROM user_subscriptions us
    JOIN subscription_plans sp ON us.plan_id = sp.id
    WHERE us.user_id = p_user_id
      AND us.status = 'active'
      AND us.current_period_end > NOW()
    ORDER BY us.created_at DESC
    LIMIT 1
  ),
  effective_plan AS (
    SELECT
      COALESCE(
        (SELECT limits FROM user_plan),
        (SELECT limits FROM subscription_plans WHERE name = 'free' LIMIT 1)
      ) AS limits,
      (SELECT custom_limits FROM user_plan) AS custom_limits
  ),
  user_usage AS (
    SELECT
      COALESCE(cv_analyses_used, 0) AS cv_analyses_used,
      COALESCE(coach_seconds_used, 0) AS coach_seconds_used,
      COALESCE(job_searches_used, 0) AS job_searches_used,
      COALESCE(assistant_messages_used, 0) AS assistant_messages_used,
      COALESCE(job_views_used, 0) AS job_views_used,
      COALESCE(recruiter_searches_used, 0) AS recruiter_searches_used,
      COALESCE(cv_adapt_used, 0) AS cv_adapt_used,
      COALESCE(cover_letter_used, 0) AS cover_letter_used
    FROM usage_quotas
    WHERE user_id = p_user_id
      AND quota_date = CURRENT_DATE
  )
  SELECT
    f.feature_name::TEXT AS feature,
    COALESCE(
      (ep.custom_limits->>f.limit_key)::INTEGER,
      f.limit_value
    )::INTEGER AS quota_limit,
    COALESCE(f.used_value, 0)::INTEGER AS quota_used,
    CASE
      WHEN COALESCE((ep.custom_limits->>f.limit_key)::INTEGER, f.limit_value) = -1 THEN -1
      ELSE GREATEST(0, COALESCE((ep.custom_limits->>f.limit_key)::INTEGER, f.limit_value) - COALESCE(f.used_value, 0))
    END::INTEGER AS quota_remaining,
    CASE
      WHEN COALESCE((ep.custom_limits->>f.limit_key)::INTEGER, f.limit_value) = -1 THEN 0.0
      WHEN COALESCE((ep.custom_limits->>f.limit_key)::INTEGER, f.limit_value) = 0 THEN 100.0
      ELSE ROUND(
        (COALESCE(f.used_value, 0)::NUMERIC / COALESCE((ep.custom_limits->>f.limit_key)::INTEGER, f.limit_value)::NUMERIC) * 100, 2
      )
    END::NUMERIC AS quota_percentage,
    CASE
      WHEN COALESCE((ep.custom_limits->>f.limit_key)::INTEGER, f.limit_value) = -1 THEN TRUE
      ELSE COALESCE(f.used_value, 0) < COALESCE((ep.custom_limits->>f.limit_key)::INTEGER, f.limit_value)
    END::BOOLEAN AS has_access,
    (CURRENT_DATE + INTERVAL '1 day')::TIMESTAMPTZ AS reset_at
  FROM (
    SELECT 'cv_analysis' AS feature_name, 'cv_analyses' AS limit_key,
           (ep.limits->>'cv_analyses')::INTEGER AS limit_value, u.cv_analyses_used AS used_value
    FROM effective_plan ep LEFT JOIN user_usage u ON TRUE
    UNION ALL
    SELECT 'coach', 'coach_seconds',
           (ep.limits->>'coach_seconds')::INTEGER, u.coach_seconds_used
    FROM effective_plan ep LEFT JOIN user_usage u ON TRUE
    UNION ALL
    SELECT 'job_search', 'job_searches',
           (ep.limits->>'job_searches')::INTEGER, u.job_searches_used
    FROM effective_plan ep LEFT JOIN user_usage u ON TRUE
    UNION ALL
    SELECT 'assistant_messages', 'assistant_messages',
           (ep.limits->>'assistant_messages')::INTEGER, u.assistant_messages_used
    FROM effective_plan ep LEFT JOIN user_usage u ON TRUE
    UNION ALL
    SELECT 'job_view', 'job_views',
           (ep.limits->>'job_views')::INTEGER, u.job_views_used
    FROM effective_plan ep LEFT JOIN user_usage u ON TRUE
    UNION ALL
    SELECT 'recruiter_search', 'recruiter_searches',
           (ep.limits->>'recruiter_searches')::INTEGER, u.recruiter_searches_used
    FROM effective_plan ep LEFT JOIN user_usage u ON TRUE
    UNION ALL
    SELECT 'cv_adapt', 'cv_adapt',
           (ep.limits->>'cv_adapt')::INTEGER, u.cv_adapt_used
    FROM effective_plan ep LEFT JOIN user_usage u ON TRUE
    UNION ALL
    SELECT 'cover_letter', 'cover_letter',
           (ep.limits->>'cover_letter')::INTEGER, u.cover_letter_used
    FROM effective_plan ep LEFT JOIN user_usage u ON TRUE
  ) f
  CROSS JOIN effective_plan ep;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_quota_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_quota_status(UUID) TO service_role;

-- 2. REPLACE check_user_quota() — ALL 8 FEATURES
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
  v_normalized_feature := p_feature;
  IF p_feature = 'cv_analyses' THEN
    v_normalized_feature := 'cv_analysis';
  END IF;

  IF v_normalized_feature NOT IN (
    'cv_analysis', 'coach', 'job_search', 'job_view',
    'assistant_messages', 'recruiter_search', 'cv_adapt', 'cover_letter'
  ) THEN
    RAISE EXCEPTION 'Invalid feature: %. Must be one of: cv_analysis, coach, job_search, job_view, assistant_messages, recruiter_search, cv_adapt, cover_letter', p_feature;
  END IF;

  v_feature_key := CASE v_normalized_feature
    WHEN 'cv_analysis' THEN 'cv_analyses'
    WHEN 'coach' THEN 'coach_seconds'
    WHEN 'job_search' THEN 'job_searches'
    WHEN 'job_view' THEN 'job_views'
    WHEN 'assistant_messages' THEN 'assistant_messages'
    WHEN 'recruiter_search' THEN 'recruiter_searches'
    WHEN 'cv_adapt' THEN 'cv_adapt'
    WHEN 'cover_letter' THEN 'cover_letter'
  END;

  SELECT sp.limits, us.custom_limits
  INTO v_plan_limits, v_custom_limits
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = p_user_id
    AND us.status = 'active'
    AND us.current_period_end > NOW()
  ORDER BY us.created_at DESC
  LIMIT 1;

  IF v_plan_limits IS NULL THEN
    SELECT limits INTO v_plan_limits
    FROM subscription_plans WHERE name = 'free' LIMIT 1;
    IF v_plan_limits IS NULL THEN
      RETURN FALSE;
    END IF;
  END IF;

  v_limit := COALESCE(
    (v_custom_limits->>v_feature_key)::INTEGER,
    (v_plan_limits->>v_feature_key)::INTEGER,
    0
  );

  IF v_limit = -1 THEN
    RETURN TRUE;
  END IF;

  SELECT COALESCE(
    CASE v_normalized_feature
      WHEN 'cv_analysis' THEN cv_analyses_used
      WHEN 'coach' THEN coach_seconds_used
      WHEN 'job_search' THEN job_searches_used
      WHEN 'job_view' THEN job_views_used
      WHEN 'assistant_messages' THEN assistant_messages_used
      WHEN 'recruiter_search' THEN recruiter_searches_used
      WHEN 'cv_adapt' THEN cv_adapt_used
      WHEN 'cover_letter' THEN cover_letter_used
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

-- ============================================
-- SUMMARY
-- ============================================
-- get_quota_status(): now returns all 8 features
--   (was missing job_view and recruiter_search since migration 20260323000005)
-- check_user_quota(): now validates all 8 features
--   (was missing cv_adapt and cover_letter since migration 20260322000001)
-- No schema changes, only function replacements.
-- ============================================
