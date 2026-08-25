-- Restaure le quota recruteur omis lors de la dernière redéfinition de la RPC.
-- Cette RPC est interne au backend : seul service_role peut l'exécuter.
CREATE OR REPLACE FUNCTION public.get_quota_status(p_user_id UUID)
RETURNS TABLE (
  feature TEXT,
  quota_limit INTEGER,
  quota_used INTEGER,
  quota_remaining INTEGER,
  quota_percentage NUMERIC,
  has_access BOOLEAN,
  reset_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH user_plan AS (
    SELECT sp.limits, us.custom_limits
    FROM public.user_subscriptions AS us
    JOIN public.subscription_plans AS sp ON sp.id = us.plan_id
    WHERE us.user_id = p_user_id
      AND us.status IN ('active', 'trialing', 'past_due')
      AND (us.current_period_end IS NULL OR us.current_period_end > NOW())
    ORDER BY
      CASE us.status
        WHEN 'active' THEN 1
        WHEN 'trialing' THEN 2
        WHEN 'past_due' THEN 3
        ELSE 4
      END,
      sp.sort_order DESC,
      us.created_at DESC
    LIMIT 1
  ),
  effective_plan AS (
    SELECT
      COALESCE(
        (SELECT limits FROM user_plan),
        (SELECT limits FROM public.subscription_plans WHERE name = 'free' LIMIT 1)
      ) AS limits,
      (SELECT custom_limits FROM user_plan) AS custom_limits
  ),
  user_usage AS (
    SELECT *
    FROM public.usage_quotas
    WHERE user_id = p_user_id
      AND quota_date = CURRENT_DATE
  )
  SELECT
    f.feature_name,
    COALESCE(
      (ep.custom_limits ->> f.limit_key)::INTEGER,
      (ep.limits ->> f.limit_key)::INTEGER
    )::INTEGER,
    COALESCE(f.used_value, 0)::INTEGER,
    CASE
      WHEN COALESCE(
        (ep.custom_limits ->> f.limit_key)::INTEGER,
        (ep.limits ->> f.limit_key)::INTEGER
      ) = -1 THEN -1
      ELSE GREATEST(
        0,
        COALESCE(
          (ep.custom_limits ->> f.limit_key)::INTEGER,
          (ep.limits ->> f.limit_key)::INTEGER,
          0
        ) - COALESCE(f.used_value, 0)
      )
    END::INTEGER,
    CASE
      WHEN COALESCE(
        (ep.custom_limits ->> f.limit_key)::INTEGER,
        (ep.limits ->> f.limit_key)::INTEGER,
        0
      ) <= 0 THEN 0.0
      ELSE ROUND(
        COALESCE(f.used_value, 0)::NUMERIC
        / COALESCE(
          (ep.custom_limits ->> f.limit_key)::INTEGER,
          (ep.limits ->> f.limit_key)::INTEGER,
          0
        )::NUMERIC * 100,
        2
      )
    END,
    CASE
      WHEN COALESCE(
        (ep.custom_limits ->> f.limit_key)::INTEGER,
        (ep.limits ->> f.limit_key)::INTEGER,
        0
      ) = -1 THEN TRUE
      ELSE COALESCE(f.used_value, 0) < COALESCE(
        (ep.custom_limits ->> f.limit_key)::INTEGER,
        (ep.limits ->> f.limit_key)::INTEGER,
        0
      )
    END,
    (CURRENT_DATE + INTERVAL '1 day')::TIMESTAMPTZ
  FROM (
    SELECT 'job_search' AS feature_name, 'job_searches_per_day' AS limit_key, u.job_searches_used AS used_value FROM effective_plan ep LEFT JOIN user_usage u ON TRUE UNION ALL
    SELECT 'job_view', 'job_views', u.job_views_used FROM effective_plan ep LEFT JOIN user_usage u ON TRUE UNION ALL
    SELECT 'ats_score', 'ats_scores_per_day', u.ats_scores_used FROM effective_plan ep LEFT JOIN user_usage u ON TRUE UNION ALL
    SELECT 'matching_score', 'matching_scores_per_day', u.matching_scores_used FROM effective_plan ep LEFT JOIN user_usage u ON TRUE UNION ALL
    SELECT 'assistant_messages', 'assistant_messages_per_day', u.assistant_messages_used FROM effective_plan ep LEFT JOIN user_usage u ON TRUE UNION ALL
    SELECT 'cv_adapt', 'cv_adapt_per_day', u.cv_adapt_used FROM effective_plan ep LEFT JOIN user_usage u ON TRUE UNION ALL
    SELECT 'cover_letter', 'cover_letter_per_day', u.cover_letter_used FROM effective_plan ep LEFT JOIN user_usage u ON TRUE UNION ALL
    SELECT 'recruiter_search', 'recruiter_searches_per_day', u.recruiter_searches_used FROM effective_plan ep LEFT JOIN user_usage u ON TRUE UNION ALL
    SELECT 'saved_jobs', 'saved_jobs_per_day', u.saved_jobs_used FROM effective_plan ep LEFT JOIN user_usage u ON TRUE
  ) AS f
  CROSS JOIN effective_plan AS ep;
END;
$$;

REVOKE ALL ON FUNCTION public.get_quota_status(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_quota_status(UUID) TO service_role;
