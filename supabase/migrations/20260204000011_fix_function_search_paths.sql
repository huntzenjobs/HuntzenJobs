-- =====================================================
-- Fix Function Search Paths
-- https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
-- =====================================================
-- Issue: Functions without explicit search_path can be vulnerable to search_path injection attacks
-- Solution: Add SET search_path = public, pg_temp to all SECURITY DEFINER functions
-- =====================================================

-- =====================================================
-- SUBSCRIPTION FUNCTIONS
-- From: 20260128000000_subscription_infrastructure.sql
-- =====================================================

CREATE OR REPLACE FUNCTION get_user_plan_limits(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  v_limits JSONB;
BEGIN
  SELECT sp.limits INTO v_limits
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = p_user_id
    AND us.status = 'active'
    AND us.current_period_end > NOW()
  ORDER BY us.created_at DESC
  LIMIT 1;

  RETURN COALESCE(v_limits, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION has_active_subscription(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_subscriptions
    WHERE user_id = p_user_id
      AND status = 'active'
      AND current_period_end > NOW()
  );
END;
$$;

-- =====================================================
-- QUOTA FUNCTIONS
-- From: 20260128000100_quota_functions.sql
-- =====================================================

CREATE OR REPLACE FUNCTION check_user_quota(
  p_user_id UUID,
  p_feature TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit INTEGER;
  v_used INTEGER;
  v_plan_limits JSONB;
  v_feature_key TEXT;
BEGIN
  -- Validate feature parameter
  IF p_feature NOT IN ('cv_analysis', 'coach', 'job_search', 'job_view') THEN
    RAISE EXCEPTION 'Invalid feature: %. Must be cv_analysis, coach, job_search, or job_view', p_feature;
  END IF;

  -- Map feature to JSONB key in subscription_plans
  v_feature_key := CASE p_feature
    WHEN 'cv_analysis' THEN 'cv_analyses'
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
    CASE p_feature
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
$$;

CREATE OR REPLACE FUNCTION increment_usage(
  p_user_id UUID,
  p_feature TEXT,
  p_amount INTEGER DEFAULT 1
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows_affected INTEGER;
BEGIN
  -- Validate inputs
  IF p_feature NOT IN ('cv_analysis', 'coach', 'job_search', 'job_view') THEN
    RAISE EXCEPTION 'Invalid feature: %', p_feature;
  END IF;

  IF p_amount < 0 THEN
    RAISE EXCEPTION 'Amount must be non-negative, got: %', p_amount;
  END IF;

  -- Insert or update usage quota for today
  INSERT INTO usage_quotas (user_id, quota_date, cv_analyses_used, coach_seconds_used, job_searches_used, job_views_used)
  VALUES (
    p_user_id,
    CURRENT_DATE,
    CASE WHEN p_feature = 'cv_analysis' THEN p_amount ELSE 0 END,
    CASE WHEN p_feature = 'coach' THEN p_amount ELSE 0 END,
    CASE WHEN p_feature = 'job_search' THEN p_amount ELSE 0 END,
    CASE WHEN p_feature = 'job_view' THEN p_amount ELSE 0 END
  )
  ON CONFLICT (user_id, quota_date) DO UPDATE SET
    cv_analyses_used = usage_quotas.cv_analyses_used +
      CASE WHEN p_feature = 'cv_analysis' THEN p_amount ELSE 0 END,
    coach_seconds_used = usage_quotas.coach_seconds_used +
      CASE WHEN p_feature = 'coach' THEN p_amount ELSE 0 END,
    job_searches_used = usage_quotas.job_searches_used +
      CASE WHEN p_feature = 'job_search' THEN p_amount ELSE 0 END,
    job_views_used = usage_quotas.job_views_used +
      CASE WHEN p_feature = 'job_view' THEN p_amount ELSE 0 END,
    updated_at = NOW();

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  RETURN v_rows_affected > 0;
END;
$$;

CREATE OR REPLACE FUNCTION get_quota_status(p_user_id UUID)
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
SET search_path = public, pg_temp
STABLE
AS $$
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
    f.feature::TEXT,
    f.limit_value::INTEGER,
    COALESCE(
      CASE f.feature
        WHEN 'cv_analysis' THEN u.cv_analyses_used
        WHEN 'coach' THEN u.coach_seconds_used
        WHEN 'job_search' THEN u.job_searches_used
        WHEN 'job_view' THEN u.job_views_used
      END, 0
    )::INTEGER AS used,
    CASE
      WHEN f.limit_value = -1 THEN -1
      ELSE f.limit_value - COALESCE(
        CASE f.feature
          WHEN 'cv_analysis' THEN u.cv_analyses_used
          WHEN 'coach' THEN u.coach_seconds_used
          WHEN 'job_search' THEN u.job_searches_used
          WHEN 'job_view' THEN u.job_views_used
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
            WHEN 'job_view' THEN u.job_views_used
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
          WHEN 'job_view' THEN u.job_views_used
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
    UNION ALL
    SELECT 'job_view' AS feature, (up.limits->>'job_views')::INTEGER AS limit_value FROM user_plan up
  ) f
  LEFT JOIN user_usage u ON TRUE;
END;
$$;

-- =====================================================
-- AUTH FUNCTIONS
-- From: 20260128000300_setup_auth.sql
-- =====================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  user_email TEXT;
  user_full_name TEXT;
  free_plan_id UUID;
BEGIN
  -- Extract email and full_name from new user
  user_email := NEW.email;
  user_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  -- Get Free plan ID
  SELECT id INTO free_plan_id FROM subscription_plans WHERE name = 'free' LIMIT 1;

  -- Insert profile with default free tier
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    subscription_tier,
    cv_analyses_used,
    cv_analyses_limit,
    coach_messages_used,
    coach_messages_limit,
    job_searches_used,
    job_searches_limit,
    quota_reset_date
  )
  VALUES (
    NEW.id,
    user_email,
    user_full_name,
    'free',
    0,
    1,
    0,
    5,
    0,
    10,
    NOW() + INTERVAL '1 day'
  );

  -- Create user subscription (from subscription infrastructure)
  IF free_plan_id IS NOT NULL THEN
    INSERT INTO public.user_subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
    VALUES (
      NEW.id,
      free_plan_id,
      'active',
      NOW(),
      NOW() + INTERVAL '100 years'
    );
  END IF;

  -- Create initial usage quota record
  INSERT INTO public.usage_quotas (user_id, quota_date)
  VALUES (NEW.id, CURRENT_DATE)
  ON CONFLICT (user_id, quota_date) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION update_subscription_tier(
  p_user_id UUID,
  p_new_tier TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_cv_limit INT;
  new_coach_limit INT;
  new_job_limit INT;
BEGIN
  -- Validate tier
  IF p_new_tier NOT IN ('free', 'starter', 'pro', 'premium') THEN
    RAISE EXCEPTION 'Invalid tier: %', p_new_tier;
  END IF;

  -- Set limits based on tier
  CASE p_new_tier
    WHEN 'free' THEN
      new_cv_limit := 1;
      new_coach_limit := 5;
      new_job_limit := 10;
    WHEN 'starter' THEN
      new_cv_limit := 5;
      new_coach_limit := 20;
      new_job_limit := 50;
    WHEN 'pro' THEN
      new_cv_limit := 20;
      new_coach_limit := 100;
      new_job_limit := 200;
    WHEN 'premium' THEN
      new_cv_limit := -1;
      new_coach_limit := -1;
      new_job_limit := -1;
  END CASE;

  -- Update profile
  UPDATE profiles
  SET
    subscription_tier = p_new_tier,
    cv_analyses_limit = new_cv_limit,
    coach_messages_limit = new_coach_limit,
    job_searches_limit = new_job_limit
  WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION reset_daily_quotas()
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  rows_updated INTEGER;
BEGIN
  -- Reset quotas for all users whose reset date has passed
  UPDATE profiles
  SET
    cv_analyses_used = 0,
    coach_messages_used = 0,
    job_searches_used = 0,
    quota_reset_date = NOW() + INTERVAL '1 day'
  WHERE quota_reset_date <= NOW();

  GET DIAGNOSTICS rows_updated = ROW_COUNT;

  RETURN rows_updated;
END;
$$;

-- =====================================================
-- PROFILE SETTINGS FUNCTIONS
-- From: 20260128001100_profile_settings.sql
-- =====================================================

CREATE OR REPLACE FUNCTION get_user_preferences(user_id UUID)
RETURNS TABLE (
  preferred_language TEXT,
  email_notifications BOOLEAN,
  newsletter_subscribed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.preferred_language,
    p.email_notifications,
    p.newsletter_subscribed
  FROM profiles p
  WHERE p.id = user_id;
END;
$$;

CREATE OR REPLACE FUNCTION update_user_preferences(
  user_id UUID,
  new_language TEXT DEFAULT NULL,
  new_email_notifications BOOLEAN DEFAULT NULL,
  new_newsletter BOOLEAN DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  rows_updated INTEGER;
BEGIN
  -- Update only provided values (NULL means no change)
  UPDATE profiles
  SET
    preferred_language = COALESCE(new_language, preferred_language),
    email_notifications = COALESCE(new_email_notifications, email_notifications),
    newsletter_subscribed = COALESCE(new_newsletter, newsletter_subscribed),
    updated_at = NOW()
  WHERE id = user_id;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN rows_updated > 0;
END;
$$;

-- =====================================================
-- SECURITY MONITORING FUNCTIONS
-- From: 20260128001200_security_monitoring.sql
-- =====================================================

CREATE OR REPLACE FUNCTION log_security_event(
  p_event_type TEXT,
  p_severity TEXT DEFAULT 'info',
  p_user_id UUID DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_event_data JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  -- Validate severity
  IF p_severity NOT IN ('info', 'warning', 'critical', 'emergency') THEN
    RAISE EXCEPTION 'Invalid severity level: %. Must be info, warning, critical, or emergency', p_severity;
  END IF;

  -- Insert security event
  INSERT INTO security_events (
    event_type,
    severity,
    user_id,
    session_id,
    ip_address,
    user_agent,
    event_data
  ) VALUES (
    p_event_type,
    p_severity,
    COALESCE(p_user_id, auth.uid()),
    p_session_id,
    CAST(p_ip_address AS INET),
    p_user_agent,
    p_event_data
  )
  RETURNING id INTO v_event_id;

  -- Log to PostgreSQL logs for critical/emergency events
  IF p_severity IN ('critical', 'emergency') THEN
    RAISE NOTICE 'SECURITY ALERT [%]: % for user % (IP: %)',
      p_severity,
      p_event_type,
      COALESCE(p_user_id::TEXT, 'anonymous'),
      COALESCE(p_ip_address, 'unknown');
  END IF;

  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION get_user_security_events(
  p_user_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  event_type TEXT,
  severity TEXT,
  created_at TIMESTAMPTZ,
  ip_address INET,
  event_data JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    se.id,
    se.event_type,
    se.severity,
    se.created_at,
    se.ip_address,
    se.event_data
  FROM security_events se
  WHERE se.user_id = COALESCE(p_user_id, auth.uid())
  ORDER BY se.created_at DESC
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION detect_failed_login_anomaly(
  p_user_id UUID,
  p_threshold INT DEFAULT 5,
  p_time_window INTERVAL DEFAULT '15 minutes'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  v_failed_count INT;
BEGIN
  SELECT COUNT(*)
  INTO v_failed_count
  FROM security_events
  WHERE
    user_id = p_user_id
    AND event_type = 'auth.failed_login'
    AND created_at > (now() - p_time_window);

  RETURN v_failed_count >= p_threshold;
END;
$$;

CREATE OR REPLACE FUNCTION cleanup_old_security_events(
  p_retention_days INT DEFAULT 90
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted_count INT;
BEGIN
  DELETE FROM security_events
  WHERE created_at < (now() - (p_retention_days || ' days')::INTERVAL)
    AND severity = 'info';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RAISE NOTICE 'Deleted % old security events', v_deleted_count;
  RETURN v_deleted_count;
END;
$$;

-- =====================================================
-- SAVED JOBS FUNCTIONS
-- From: 20260129000000_saved_jobs.sql
-- =====================================================

CREATE OR REPLACE FUNCTION update_saved_jobs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- =====================================================
-- CV ANALYSIS FUNCTIONS
-- From: 20260129000001_allow_anonymous_cv_analyses.sql
-- =====================================================

CREATE OR REPLACE FUNCTION get_cv_analysis_status(
    p_cv_id UUID,
    p_user_id UUID DEFAULT NULL,
    p_anonymous_id TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    anonymous_id TEXT,
    status TEXT,
    result JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    processing_time_seconds INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ca.id,
        ca.user_id,
        ca.anonymous_id,
        ca.status,
        ca.result,
        ca.error_message,
        ca.created_at,
        ca.completed_at,
        CASE
            WHEN ca.completed_at IS NOT NULL AND ca.created_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (ca.completed_at - ca.created_at))::INTEGER
            ELSE NULL
        END AS processing_time_seconds
    FROM cv_analyses ca
    WHERE ca.id = p_cv_id
        AND (
            (p_user_id IS NOT NULL AND ca.user_id = p_user_id)
            OR
            (p_anonymous_id IS NOT NULL AND ca.anonymous_id = p_anonymous_id)
        );
END;
$$;

CREATE OR REPLACE FUNCTION list_user_cv_analyses(
    p_user_id UUID,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    status TEXT,
    created_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    processing_time_seconds INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ca.id,
        ca.status,
        ca.created_at,
        ca.completed_at,
        CASE
            WHEN ca.completed_at IS NOT NULL AND ca.created_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (ca.completed_at - ca.created_at))::INTEGER
            ELSE NULL
        END AS processing_time_seconds
    FROM cv_analyses ca
    WHERE ca.user_id = p_user_id
    ORDER BY ca.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

CREATE OR REPLACE FUNCTION count_anonymous_analyses(
    p_client_ip TEXT,
    p_time_window INTERVAL DEFAULT INTERVAL '24 hours'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO v_count
    FROM cv_analyses
    WHERE client_ip = p_client_ip
        AND user_id IS NULL
        AND created_at > (NOW() - p_time_window);

    RETURN v_count;
END;
$$;

-- =====================================================
-- USER PLAN FUNCTIONS
-- Additional functions that may exist in other migrations
-- =====================================================

-- Function to get user's plan (if exists)
-- Drop first to avoid return type conflicts
DROP FUNCTION IF EXISTS get_user_plan(UUID);

CREATE FUNCTION get_user_plan(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  v_plan_name TEXT;
BEGIN
  SELECT sp.name INTO v_plan_name
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = p_user_id
    AND us.status = 'active'
    AND us.current_period_end > NOW()
  ORDER BY us.created_at DESC
  LIMIT 1;

  RETURN COALESCE(v_plan_name, 'free');
END;
$$;

-- Function to get user usage (if exists)
-- Drop first to avoid return type conflicts
DROP FUNCTION IF EXISTS get_user_usage(UUID);

CREATE FUNCTION get_user_usage(p_user_id UUID)
RETURNS TABLE (
  cv_analyses_used INTEGER,
  coach_seconds_used INTEGER,
  job_searches_used INTEGER,
  job_views_used INTEGER,
  quota_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    uq.cv_analyses_used,
    uq.coach_seconds_used,
    uq.job_searches_used,
    uq.job_views_used,
    uq.quota_date
  FROM usage_quotas uq
  WHERE uq.user_id = p_user_id
    AND uq.quota_date = CURRENT_DATE;
END;
$$;

-- Function to check if user can perform an action (if exists)
-- Drop first to avoid return type conflicts
DROP FUNCTION IF EXISTS can_user_perform_action(UUID, TEXT);

CREATE FUNCTION can_user_perform_action(
  p_user_id UUID,
  p_action TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
BEGIN
  -- Map action to feature
  RETURN check_user_quota(p_user_id, p_action);
END;
$$;

-- Function to update coach conversation metadata (if exists)
-- Drop first to avoid return type conflicts
DROP FUNCTION IF EXISTS update_coach_conversation_metadata(UUID, TEXT, BOOLEAN);

CREATE FUNCTION update_coach_conversation_metadata(
  p_conversation_id UUID,
  p_title TEXT DEFAULT NULL,
  p_is_favorite BOOLEAN DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows_updated INTEGER;
BEGIN
  UPDATE coach_conversations
  SET
    title = COALESCE(p_title, title),
    is_favorite = COALESCE(p_is_favorite, is_favorite),
    updated_at = NOW()
  WHERE id = p_conversation_id
    AND user_id = auth.uid();

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  RETURN v_rows_updated > 0;
END;
$$;

-- =====================================================
-- GRANT EXECUTE PERMISSIONS
-- =====================================================

-- Subscription functions
GRANT EXECUTE ON FUNCTION get_user_plan_limits(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION has_active_subscription(UUID) TO authenticated, service_role;

-- Quota functions
GRANT EXECUTE ON FUNCTION check_user_quota(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION increment_usage(UUID, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION get_quota_status(UUID) TO authenticated, service_role;

-- Auth functions
GRANT EXECUTE ON FUNCTION update_subscription_tier(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION reset_daily_quotas() TO service_role;

-- Profile functions
GRANT EXECUTE ON FUNCTION get_user_preferences(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION update_user_preferences(UUID, TEXT, BOOLEAN, BOOLEAN) TO authenticated, service_role;

-- Security functions
GRANT EXECUTE ON FUNCTION log_security_event(TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_user_security_events(UUID, INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION detect_failed_login_anomaly(UUID, INT, INTERVAL) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_security_events(INT) TO service_role;

-- CV analysis functions
GRANT EXECUTE ON FUNCTION get_cv_analysis_status(UUID, UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION list_user_cv_analyses(UUID, INTEGER, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION count_anonymous_analyses(TEXT, INTERVAL) TO service_role;

-- User plan functions
GRANT EXECUTE ON FUNCTION get_user_plan(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_user_usage(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION can_user_perform_action(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION update_coach_conversation_metadata(UUID, TEXT, BOOLEAN) TO authenticated, service_role;

-- =====================================================
-- Migration Complete
-- =====================================================
-- All functions now have SET search_path = public, pg_temp
-- This prevents search_path injection attacks where malicious users
-- could create functions in a temporary schema to hijack function calls
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Function search paths fixed';
  RAISE NOTICE 'Updated 20+ functions with SET search_path = public, pg_temp';
END $$;
