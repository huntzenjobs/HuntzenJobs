-- ============================================
-- CV ADAPT & COVER LETTER QUOTAS
-- ============================================
-- Add daily quota tracking for CV adaptation and cover letter generation.
-- These features were previously ON/OFF via feature flags only.
-- Now they also have daily limits per plan.

-- 1. Add columns to usage_quotas
ALTER TABLE usage_quotas
  ADD COLUMN IF NOT EXISTS cv_adapt_used INTEGER DEFAULT 0 CHECK (cv_adapt_used >= 0),
  ADD COLUMN IF NOT EXISTS cover_letter_used INTEGER DEFAULT 0 CHECK (cover_letter_used >= 0);

-- 2. Add limits to subscription_plans
UPDATE subscription_plans
SET limits = limits || '{"cv_adapt": 15, "cover_letter": 15}'::jsonb
WHERE name = 'free';

UPDATE subscription_plans
SET limits = limits || '{"cv_adapt": 50, "cover_letter": 50}'::jsonb
WHERE name = 'starter';

UPDATE subscription_plans
SET limits = limits || '{"cv_adapt": -1, "cover_letter": -1}'::jsonb
WHERE name = 'pro';

UPDATE subscription_plans
SET limits = limits || '{"cv_adapt": -1, "cover_letter": -1}'::jsonb
WHERE name = 'premium';

-- 3. Update increment_usage() to support new features
CREATE OR REPLACE FUNCTION increment_usage(
  p_user_id UUID,
  p_feature TEXT,
  p_amount INTEGER DEFAULT 1
) RETURNS BOOLEAN AS $$
DECLARE
  v_normalized_feature TEXT;
BEGIN
  v_normalized_feature := p_feature;
  IF p_feature = 'cv_analyses' THEN
    v_normalized_feature := 'cv_analysis';
  END IF;

  IF v_normalized_feature NOT IN ('cv_analysis', 'coach', 'job_search', 'assistant_messages', 'job_view', 'recruiter_search', 'cv_adapt', 'cover_letter') THEN
    RAISE EXCEPTION 'Invalid feature: %. Must be cv_analysis, coach, job_search, assistant_messages, job_view, recruiter_search, cv_adapt, or cover_letter', p_feature;
  END IF;

  IF p_amount < 0 THEN
    RAISE EXCEPTION 'Amount must be non-negative, got: %', p_amount;
  END IF;

  INSERT INTO usage_quotas (
    user_id, quota_date,
    cv_analyses_used, coach_seconds_used, job_searches_used,
    assistant_messages_used, job_views_used, recruiter_searches_used,
    cv_adapt_used, cover_letter_used
  ) VALUES (
    p_user_id, CURRENT_DATE,
    CASE WHEN v_normalized_feature = 'cv_analysis' THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'coach' THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'job_search' THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'assistant_messages' THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'job_view' THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'recruiter_search' THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'cv_adapt' THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'cover_letter' THEN p_amount ELSE 0 END
  )
  ON CONFLICT (user_id, quota_date) DO UPDATE SET
    cv_analyses_used = usage_quotas.cv_analyses_used +
      CASE WHEN v_normalized_feature = 'cv_analysis' THEN p_amount ELSE 0 END,
    coach_seconds_used = usage_quotas.coach_seconds_used +
      CASE WHEN v_normalized_feature = 'coach' THEN p_amount ELSE 0 END,
    job_searches_used = usage_quotas.job_searches_used +
      CASE WHEN v_normalized_feature = 'job_search' THEN p_amount ELSE 0 END,
    assistant_messages_used = usage_quotas.assistant_messages_used +
      CASE WHEN v_normalized_feature = 'assistant_messages' THEN p_amount ELSE 0 END,
    job_views_used = usage_quotas.job_views_used +
      CASE WHEN v_normalized_feature = 'job_view' THEN p_amount ELSE 0 END,
    recruiter_searches_used = usage_quotas.recruiter_searches_used +
      CASE WHEN v_normalized_feature = 'recruiter_search' THEN p_amount ELSE 0 END,
    cv_adapt_used = usage_quotas.cv_adapt_used +
      CASE WHEN v_normalized_feature = 'cv_adapt' THEN p_amount ELSE 0 END,
    cover_letter_used = usage_quotas.cover_letter_used +
      CASE WHEN v_normalized_feature = 'cover_letter' THEN p_amount ELSE 0 END,
    updated_at = NOW();

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_usage(UUID, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_usage(UUID, TEXT, INTEGER) TO service_role;

-- 4. Update get_quota_status() to include new features
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
