-- ============================================
-- FINAL COMPREHENSIVE QUOTA FIX
-- ============================================
-- 1. Correct the Plan Limits JSONB keys in the database to match Frontend
-- ============================================

-- Fix FREE plan
UPDATE subscription_plans
SET limits = limits || '{
  "job_searches_per_day": 5, 
  "cv_analyses_per_day": 1, 
  "ats_scores_per_day": 5, 
  "matching_scores_per_day": 10,
  "custom_cvs_per_day": 10,
  "assistant_messages_per_day": 5,
  "saved_jobs_per_day": 10,
  "cv_adapt_per_day": 10,
  "recruiter_searches_per_day": 10,
  "cover_letter_per_day": 10
}'::jsonb
WHERE name = 'free';

-- Fix STARTER plan
UPDATE subscription_plans
SET limits = limits || '{
  "job_searches_per_day": 10, 
  "cv_analyses_per_day": 5, 
  "ats_scores_per_day": 10, 
  "matching_scores_per_day": 30,
  "custom_cvs_per_day": 20,
  "assistant_messages_per_day": 20,
  "saved_jobs_per_day": 30,
  "cv_adapt_per_day": 30,
  "recruiter_searches_per_day": 20,
  "cover_letter_per_day": 30
}'::jsonb
WHERE name = 'starter';

-- Fix PRO/PREMIUM plans (Unlimited = -1)
UPDATE subscription_plans
SET limits = limits || '{
  "job_searches_per_day": -1, 
  "cv_analyses_per_day": -1, 
  "ats_scores_per_day": -1, 
  "matching_scores_per_day": -1,
  "custom_cvs_per_day": -1,
  "assistant_messages_per_day": -1,
  "saved_jobs_per_day": -1,
  "cv_adapt_per_day": -1,
  "recruiter_searches_per_day": -1,
  "cover_letter_per_day": -1
}'::jsonb
WHERE name IN ('pro', 'premium');

-- ============================================
-- 2. Update tracking columns and RPCs
-- ============================================

ALTER TABLE usage_quotas
  ADD COLUMN IF NOT EXISTS ats_scores_used INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS matching_scores_used INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saved_jobs_used INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custom_cvs_used INTEGER DEFAULT 0;

-- Ensure increment_usage() handles normalized keys
CREATE OR REPLACE FUNCTION increment_usage(p_user_id UUID, p_feature TEXT, p_amount INTEGER DEFAULT 1) 
RETURNS BOOLEAN AS $$
DECLARE v_normalized_feature TEXT;
BEGIN
  v_normalized_feature := p_feature;
  -- Map legacy frontend names to internal tracking columns
  IF p_feature = 'cv_analyses' THEN v_normalized_feature := 'cv_analysis'; END IF;
  
  INSERT INTO usage_quotas (user_id, quota_date, 
    job_searches_used, job_views_used, cv_analyses_used, ats_scores_used, 
    matching_scores_used, custom_cvs_used, assistant_messages_used, 
    recruiter_searches_used, cv_adapt_used, cover_letter_used, 
    coach_seconds_used, saved_jobs_used
  ) VALUES (p_user_id, CURRENT_DATE,
    CASE WHEN v_normalized_feature = 'job_search' THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'job_view' THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'cv_analysis' THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'ats_score' THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'matching_score' THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'custom_cv' THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'assistant_messages' THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'recruiter_search' THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'cv_adapt' THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'cover_letter' THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'coach' THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'saved_jobs' THEN p_amount ELSE 0 END
  ) ON CONFLICT (user_id, quota_date) DO UPDATE SET
    job_searches_used = usage_quotas.job_searches_used + EXCLUDED.job_searches_used,
    job_views_used = usage_quotas.job_views_used + EXCLUDED.job_views_used,
    cv_analyses_used = usage_quotas.cv_analyses_used + EXCLUDED.cv_analyses_used,
    ats_scores_used = usage_quotas.ats_scores_used + EXCLUDED.ats_scores_used,
    matching_scores_used = usage_quotas.matching_scores_used + EXCLUDED.matching_scores_used,
    custom_cvs_used = usage_quotas.custom_cvs_used + EXCLUDED.custom_cvs_used,
    assistant_messages_used = usage_quotas.assistant_messages_used + EXCLUDED.assistant_messages_used,
    recruiter_searches_used = usage_quotas.recruiter_searches_used + EXCLUDED.recruiter_searches_used,
    cv_adapt_used = usage_quotas.cv_adapt_used + EXCLUDED.cv_adapt_used,
    cover_letter_used = usage_quotas.cover_letter_used + EXCLUDED.cover_letter_used,
    coach_seconds_used = usage_quotas.coach_seconds_used + EXCLUDED.coach_seconds_used,
    saved_jobs_used = usage_quotas.saved_jobs_used + EXCLUDED.saved_jobs_used,
    updated_at = NOW();
  RETURN TRUE;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update get_quota_status() to return the correct keys to the frontend
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
    CASE WHEN COALESCE((ep.limits->>f.limit_key)::INTEGER, 0) <= 0 THEN 0.0 
         ELSE ROUND((COALESCE(f.used_value, 0)::NUMERIC / COALESCE((ep.limits->>f.limit_key)::INTEGER, 0)::NUMERIC) * 100, 2) END,
    CASE WHEN COALESCE((ep.limits->>f.limit_key)::INTEGER, 0) = -1 THEN TRUE
         ELSE COALESCE(f.used_value, 0) < COALESCE((ep.limits->>f.limit_key)::INTEGER, 0) END,
    (CURRENT_DATE + INTERVAL '1 day')::TIMESTAMPTZ
  FROM (
    -- MAPPING TABLE BETWEEN FRONTEND FEATURE NAMES AND DATABASE LIMIT KEYS
    -- SELECT 'job_search' ...
    SELECT 'job_search' AS feature_name, 'job_searches_per_day' AS limit_key, u.job_searches_used AS used_value FROM effective_plan ep LEFT JOIN user_usage u ON TRUE UNION ALL
    SELECT 'ats_score', 'ats_scores_per_day', u.ats_scores_used FROM effective_plan ep LEFT JOIN user_usage u ON TRUE UNION ALL
    SELECT 'matching_score', 'matching_scores_per_day', u.matching_scores_used FROM effective_plan ep LEFT JOIN user_usage u ON TRUE UNION ALL
    SELECT 'assistant_messages', 'assistant_messages_per_day', u.assistant_messages_used FROM effective_plan ep LEFT JOIN user_usage u ON TRUE UNION ALL
    SELECT 'cv_adapt', 'cv_adapt_per_day', u.cv_adapt_used FROM effective_plan ep LEFT JOIN user_usage u ON TRUE UNION ALL
    SELECT 'cover_letter', 'cover_letter_per_day', u.cover_letter_used FROM effective_plan ep LEFT JOIN user_usage u ON TRUE UNION ALL
    SELECT 'recruiter_search', 'recruiter_searches_per_day', u.recruiter_searches_used FROM effective_plan ep LEFT JOIN user_usage u ON TRUE UNION ALL
    SELECT 'saved_jobs', 'saved_jobs_per_day', u.saved_jobs_used FROM effective_plan ep LEFT JOIN user_usage u ON TRUE
  ) f CROSS JOIN effective_plan ep;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
