-- ============================================
-- FIX: Quota Status Has Access includes Custom Limits
-- ============================================
-- Date: 2026-03-30
-- Description: Ensures that the has_access flag in get_quota_status 
-- properly accounts for custom_limits set at the user level, 
-- matching the logic used for quota_limit and quota_remaining.

CREATE OR REPLACE FUNCTION get_quota_status(p_user_id UUID)
RETURNS TABLE (feature TEXT, quota_limit INTEGER, quota_used INTEGER, quota_remaining INTEGER, quota_percentage NUMERIC, has_access BOOLEAN, reset_at TIMESTAMPTZ) AS $$
BEGIN
  RETURN QUERY
  WITH user_plan AS (
    SELECT sp.limits, us.custom_limits FROM user_subscriptions us JOIN subscription_plans sp ON us.plan_id = sp.id
    WHERE us.user_id = p_user_id AND us.status = 'active' AND us.current_period_end > NOW() ORDER BY us.created_at DESC LIMIT 1
  ),
  effective_plan AS (
    SELECT COALESCE((SELECT limits FROM user_plan), (SELECT limits FROM subscription_plans WHERE name = 'free' LIMIT 1)) AS limits,
    (SELECT custom_limits FROM user_plan) AS custom_limits
  ),
  user_usage AS (
    SELECT * FROM usage_quotas WHERE user_id = p_user_id AND quota_date = CURRENT_DATE
  )
  SELECT
    f.feature_name,
    COALESCE((ep.custom_limits->>f.limit_key)::INTEGER, (ep.limits->>f.limit_key)::INTEGER)::INTEGER,
    COALESCE(f.used_value, 0)::INTEGER,
    CASE 
      WHEN COALESCE((ep.custom_limits->>f.limit_key)::INTEGER, (ep.limits->>f.limit_key)::INTEGER) = -1 THEN -1
      ELSE GREATEST(0, COALESCE((ep.custom_limits->>f.limit_key)::INTEGER, (ep.limits->>f.limit_key)::INTEGER, 0) - COALESCE(f.used_value, 0))
    END::INTEGER,
    CASE WHEN COALESCE((ep.custom_limits->>f.limit_key)::INTEGER, (ep.limits->>f.limit_key)::INTEGER, 0) <= 0 THEN 0.0 
         ELSE ROUND((COALESCE(f.used_value, 0)::NUMERIC / COALESCE((ep.custom_limits->>f.limit_key)::INTEGER, (ep.limits->>f.limit_key)::INTEGER, 0)::NUMERIC) * 100, 2) END,
    CASE 
      WHEN COALESCE((ep.custom_limits->>f.limit_key)::INTEGER, (ep.limits->>f.limit_key)::INTEGER, 0) = -1 THEN TRUE
      ELSE COALESCE(f.used_value, 0) < COALESCE((ep.custom_limits->>f.limit_key)::INTEGER, (ep.limits->>f.limit_key)::INTEGER, 0) 
    END,
    (CURRENT_DATE + INTERVAL '1 day')::TIMESTAMPTZ
  FROM (
    -- MAPPING TABLE BETWEEN FRONTEND FEATURE NAMES AND DATABASE LIMIT KEYS
    SELECT 'job_search' AS feature_name, 'job_searches_per_day' AS limit_key, u.job_searches_used AS used_value FROM effective_plan ep LEFT JOIN user_usage u ON TRUE UNION ALL
    SELECT 'ats_score', 'ats_scores_per_day', u.ats_scores_used FROM effective_plan ep LEFT JOIN user_usage u ON TRUE UNION ALL
    SELECT 'matching_score', 'matching_scores_per_day', u.matching_scores_used FROM effective_plan ep LEFT JOIN user_usage u ON TRUE UNION ALL
    SELECT 'assistant_messages', 'assistant_messages_per_day', u.assistant_messages_used FROM effective_plan ep LEFT JOIN user_usage u ON TRUE UNION ALL
    SELECT 'cv_adapt', 'cv_adapt_per_day', u.cv_adapt_used FROM effective_plan ep LEFT JOIN user_usage u ON TRUE UNION ALL
    SELECT 'cover_letter', 'cover_letter_per_day', u.cover_letter_used FROM effective_plan ep LEFT JOIN user_usage u ON TRUE UNION ALL
    SELECT 'saved_jobs', 'saved_jobs_per_day', u.saved_jobs_used FROM effective_plan ep LEFT JOIN user_usage u ON TRUE
  ) f CROSS JOIN effective_plan ep;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
