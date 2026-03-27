-- ============================================
-- ASSISTANT MESSAGE QUOTA MIGRATION
-- ============================================
-- Purpose: Add assistant_messages quota support
--
-- Changes:
--   1. Add assistant_messages_used column to usage_quotas
--   2. Seed assistant_messages limits in subscription_plans
--   3. Update increment_usage() to support 'assistant_messages'
--   4. Update get_quota_status() to return assistant_messages row
--
-- Migration Date: 2026-03-06
-- ============================================

-- ============================================
-- 1. ADD COLUMN TO usage_quotas
-- ============================================

ALTER TABLE usage_quotas
  ADD COLUMN IF NOT EXISTS assistant_messages_used INTEGER DEFAULT 0
    CHECK (assistant_messages_used >= 0);

-- ============================================
-- 2. SEED PLAN LIMITS IN subscription_plans
-- ============================================

-- free: 10 messages/day
UPDATE subscription_plans
SET limits = jsonb_set(limits, '{assistant_messages}', '10'::jsonb)
WHERE name = 'free';

-- starter: 100 messages/day
UPDATE subscription_plans
SET limits = jsonb_set(limits, '{assistant_messages}', '100'::jsonb)
WHERE name = 'starter';

-- pro: unlimited (-1)
UPDATE subscription_plans
SET limits = jsonb_set(limits, '{assistant_messages}', '-1'::jsonb)
WHERE name = 'pro';

-- premium: unlimited (-1)
UPDATE subscription_plans
SET limits = jsonb_set(limits, '{assistant_messages}', '-1'::jsonb)
WHERE name = 'premium';

-- ============================================
-- 3. UPDATE INCREMENT_USAGE FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION increment_usage(
  p_user_id UUID,
  p_feature TEXT,  -- 'cv_analysis' (or 'cv_analyses'), 'coach', 'job_search', 'assistant_messages'
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
  IF v_normalized_feature NOT IN ('cv_analysis', 'coach', 'job_search', 'assistant_messages') THEN
    RAISE EXCEPTION 'Invalid feature: %. Must be cv_analysis, coach, job_search, or assistant_messages', p_feature;
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
    assistant_messages_used
  ) VALUES (
    p_user_id,
    CURRENT_DATE,
    CASE WHEN v_normalized_feature = 'cv_analysis' THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'coach' THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'job_search' THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'assistant_messages' THEN p_amount ELSE 0 END
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
    updated_at = NOW();

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION increment_usage(UUID, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_usage(UUID, TEXT, INTEGER) TO service_role;

COMMENT ON FUNCTION increment_usage IS 'Increment usage counter for a feature. Supports cv_analysis (or cv_analyses), coach, job_search, and assistant_messages. Returns TRUE on success.';

-- ============================================
-- 4. UPDATE GET_QUOTA_STATUS FUNCTION
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
  WITH user_plan AS (
    SELECT sp.limits
    FROM user_subscriptions us
    JOIN subscription_plans sp ON us.plan_id = sp.id
    WHERE us.user_id = p_user_id
      AND us.status = 'active'
      AND us.current_period_end > NOW()
    LIMIT 1
  ),
  -- Fallback to free plan limits when user has no active subscription
  effective_plan AS (
    SELECT
      COALESCE(
        (SELECT limits FROM user_plan),
        (SELECT limits FROM subscription_plans WHERE name = 'free' LIMIT 1)
      ) AS limits
  ),
  user_usage AS (
    SELECT
      COALESCE(cv_analyses_used, 0) AS cv_analyses_used,
      COALESCE(coach_seconds_used, 0) AS coach_seconds_used,
      COALESCE(job_searches_used, 0) AS job_searches_used,
      COALESCE(assistant_messages_used, 0) AS assistant_messages_used
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
      WHEN 'assistant_messages' THEN 'assistant_messages'
    END::TEXT AS feature,
    f.limit_value::INTEGER AS quota_limit,
    COALESCE(
      CASE f.internal_feature
        WHEN 'cv_analyses' THEN u.cv_analyses_used
        WHEN 'coach_seconds' THEN u.coach_seconds_used
        WHEN 'job_searches' THEN u.job_searches_used
        WHEN 'assistant_messages' THEN u.assistant_messages_used
      END, 0
    )::INTEGER AS quota_used,
    CASE
      WHEN f.limit_value = -1 THEN -1
      ELSE GREATEST(0, f.limit_value - COALESCE(
        CASE f.internal_feature
          WHEN 'cv_analyses' THEN u.cv_analyses_used
          WHEN 'coach_seconds' THEN u.coach_seconds_used
          WHEN 'job_searches' THEN u.job_searches_used
          WHEN 'assistant_messages' THEN u.assistant_messages_used
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
            WHEN 'assistant_messages' THEN u.assistant_messages_used
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
          WHEN 'assistant_messages' THEN u.assistant_messages_used
        END, 0
      ) < f.limit_value
    END::BOOLEAN AS has_access,
    (CURRENT_DATE + INTERVAL '1 day')::TIMESTAMPTZ AS reset_at
  FROM (
    -- Extract limits from plan JSONB (using internal keys)
    SELECT 'cv_analyses' AS internal_feature, (ep.limits->>'cv_analyses')::INTEGER AS limit_value FROM effective_plan ep
    UNION ALL
    SELECT 'coach_seconds' AS internal_feature, (ep.limits->>'coach_seconds')::INTEGER AS limit_value FROM effective_plan ep
    UNION ALL
    SELECT 'job_searches' AS internal_feature, (ep.limits->>'job_searches')::INTEGER AS limit_value FROM effective_plan ep
    UNION ALL
    SELECT 'assistant_messages' AS internal_feature, (ep.limits->>'assistant_messages')::INTEGER AS limit_value FROM effective_plan ep
  ) f
  LEFT JOIN user_usage u ON TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_quota_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_quota_status(UUID) TO service_role;

COMMENT ON FUNCTION get_quota_status IS 'Get comprehensive quota status for all features including assistant_messages. Returns singular feature names for API consistency. Falls back to free plan limits for users with no active subscription.';

-- ============================================
-- MIGRATION SUMMARY
-- ============================================
-- Changes:
--   usage_quotas.assistant_messages_used column added (IF NOT EXISTS — idempotent)
--   subscription_plans.limits updated with assistant_messages key for all 4 plans
--   increment_usage() now accepts assistant_messages feature
--   get_quota_status() now returns assistant_messages row
--   get_quota_status() falls back to free plan limits (was: returns no rows for unsubscribed users)
--   All existing features (cv_analysis, coach, job_search) unchanged
--
-- Plan limits for assistant_messages:
--   free:    10/day
--   starter: 100/day
--   pro:     unlimited (-1)
--   premium: unlimited (-1)
-- ============================================
