


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."can_user_perform_action"("p_user_id" "uuid", "p_action" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_plan RECORD;
  v_usage RECORD;
  v_limit INT;
  v_used INT;
BEGIN
  SELECT * INTO v_plan FROM get_user_plan(p_user_id);
  IF NOT FOUND THEN RETURN FALSE; END IF;

  SELECT * INTO v_usage FROM get_user_usage(p_user_id);

  CASE p_action
    WHEN 'cv_analysis' THEN
      v_limit := (v_plan.limits->>'cv_analyses_per_day')::INT;
      v_used := COALESCE(v_usage.cv_analyses_used, 0);
    WHEN 'coach_message' THEN
      v_limit := (v_plan.limits->>'coach_seconds_per_day')::INT;
      v_used := COALESCE(v_usage.coach_seconds_used, 0);
    WHEN 'job_search' THEN
      v_limit := (v_plan.limits->>'job_searches_per_day')::INT;
      v_used := COALESCE(v_usage.job_searches_used, 0);
    ELSE RETURN FALSE;
  END CASE;

  IF v_limit = -1 THEN RETURN TRUE; END IF;
  RETURN v_used < v_limit;
END;
$$;


ALTER FUNCTION "public"."can_user_perform_action"("p_user_id" "uuid", "p_action" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_user_quota"("p_user_id" "uuid", "p_feature" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_limit INTEGER;
  v_used INTEGER;
  v_plan_limits JSONB;
  v_feature_key TEXT;
BEGIN
  -- Validate feature parameter
  IF p_feature NOT IN ('cv_analysis', 'coach', 'job_search') THEN
    RAISE EXCEPTION 'Invalid feature: %. Must be cv_analysis, coach, or job_search', p_feature;
  END IF;

  -- Map feature to JSONB key in subscription_plans
  v_feature_key := CASE p_feature
    WHEN 'cv_analysis' THEN 'cv_analyses'
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
    CASE p_feature
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
$$;


ALTER FUNCTION "public"."check_user_quota"("p_user_id" "uuid", "p_feature" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_user_quota"("p_user_id" "uuid", "p_feature" "text") IS 'Check if user has quota available for a feature. Returns TRUE if allowed, FALSE if quota exceeded.';



CREATE OR REPLACE FUNCTION "public"."cleanup_old_security_events"("p_retention_days" integer DEFAULT 90) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."cleanup_old_security_events"("p_retention_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_anonymous_analyses"("p_client_ip" "text", "p_time_window" interval DEFAULT '24:00:00'::interval) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."count_anonymous_analyses"("p_client_ip" "text", "p_time_window" interval) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."detect_failed_login_anomaly"("p_user_id" "uuid", "p_threshold" integer DEFAULT 5, "p_time_window" interval DEFAULT '00:15:00'::interval) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."detect_failed_login_anomaly"("p_user_id" "uuid", "p_threshold" integer, "p_time_window" interval) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."detect_failed_login_anomaly"("p_user_id" "uuid", "p_threshold" integer, "p_time_window" interval) IS 'Detects if a user has exceeded failed login threshold within time window';



CREATE OR REPLACE FUNCTION "public"."get_cv_analysis_status"("p_cv_id" "uuid", "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_anonymous_id" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "user_id" "uuid", "anonymous_id" "text", "status" "text", "result" "jsonb", "error_message" "text", "created_at" timestamp with time zone, "completed_at" timestamp with time zone, "processing_time_seconds" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
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
            -- Authenticated user check
            (p_user_id IS NOT NULL AND ca.user_id = p_user_id)
            OR
            -- Anonymous user check
            (p_anonymous_id IS NOT NULL AND ca.anonymous_id = p_anonymous_id)
        );
END;
$$;


ALTER FUNCTION "public"."get_cv_analysis_status"("p_cv_id" "uuid", "p_user_id" "uuid", "p_anonymous_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_quota_status"("p_user_id" "uuid") RETURNS TABLE("feature" "text", "quota_limit" integer, "quota_used" integer, "quota_remaining" integer, "quota_percentage" numeric, "has_access" boolean, "reset_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
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
      job_searches_used
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
      END, 0
    )::INTEGER AS used,
    CASE
      WHEN f.limit_value = -1 THEN -1
      ELSE f.limit_value - COALESCE(
        CASE f.feature
          WHEN 'cv_analysis' THEN u.cv_analyses_used
          WHEN 'coach' THEN u.coach_seconds_used
          WHEN 'job_search' THEN u.job_searches_used
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
  ) f
  LEFT JOIN user_usage u ON TRUE;
END;
$$;


ALTER FUNCTION "public"."get_quota_status"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_quota_status"("p_user_id" "uuid") IS 'Get detailed quota status for all features for a user.';



CREATE OR REPLACE FUNCTION "public"."get_user_plan"("p_user_id" "uuid") RETURNS TABLE("plan_name" "text", "plan_display_name" "text", "limits" "jsonb", "features" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT sp.name, sp.display_name, sp.limits, sp.features
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = p_user_id AND us.status = 'active'
  ORDER BY us.created_at DESC
  LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."get_user_plan"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_plan_limits"("p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."get_user_plan_limits"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_preferences"("user_id" "uuid") RETURNS TABLE("preferred_language" "text", "email_notifications" boolean, "newsletter_subscribed" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."get_user_preferences"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_security_events"("p_user_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 50) RETURNS TABLE("id" "uuid", "event_type" "text", "severity" "text", "created_at" timestamp with time zone, "ip_address" "inet", "event_data" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."get_user_security_events"("p_user_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_usage"("p_user_id" "uuid") RETURNS TABLE("cv_analyses_used" integer, "coach_seconds_used" integer, "job_searches_used" integer, "quota_date" "date")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT uq.cv_analyses_used, uq.coach_seconds_used, uq.job_searches_used, uq.quota_date
  FROM usage_quotas uq
  WHERE uq.user_id = p_user_id AND uq.quota_date = CURRENT_DATE
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 0, 0, 0, CURRENT_DATE;
  END IF;
END;
$$;


ALTER FUNCTION "public"."get_user_usage"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  user_email TEXT;
  user_full_name TEXT;
  free_plan_id UUID;
BEGIN
  -- Extract and sanitize user info
  user_email := NEW.email;

  -- ✅ SECURITY: Sanitize full_name to prevent XSS
  -- Remove HTML tags and special characters
  user_full_name := COALESCE(
    regexp_replace(
      regexp_replace(NEW.raw_user_meta_data->>'full_name', '[<>]', '', 'g'),
      '[^\w\s\-''.]', '', 'g'
    ),
    ''
  );

  -- Limit length to prevent DOS
  user_full_name := substring(user_full_name, 1, 100);

  -- Get free plan ID
  SELECT id INTO free_plan_id
  FROM subscription_plans
  WHERE name = 'free'
    AND is_active = true
  LIMIT 1;

  -- 1. Create profile
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, user_email, user_full_name)
  ON CONFLICT (id) DO NOTHING;

  -- 2. Create initial usage quota record (today)
  INSERT INTO public.usage_quotas (
    id, user_id, quota_date, cv_analyses_used, coach_seconds_used, job_searches_used, last_reset_at
  )
  VALUES (
    gen_random_uuid(), NEW.id, CURRENT_DATE, 0, 0, 0, NOW()
  )
  ON CONFLICT (user_id, quota_date) DO NOTHING;

  -- 3. Create free subscription if free plan exists
  IF free_plan_id IS NOT NULL THEN
    INSERT INTO public.user_subscriptions (
      id, user_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end
    )
    VALUES (
      gen_random_uuid(), NEW.id, free_plan_id, 'active', NOW(), NOW() + INTERVAL '100 years', FALSE
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."handle_new_user"() IS 'Trigger function to auto-create profile when user signs up';



CREATE OR REPLACE FUNCTION "public"."has_active_subscription"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."has_active_subscription"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_usage"("p_user_id" "uuid", "p_feature" "text", "p_amount" integer DEFAULT 1) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_rows_affected INTEGER;
BEGIN
  -- Validate inputs
  IF p_feature NOT IN ('cv_analysis', 'coach', 'job_search') THEN
    RAISE EXCEPTION 'Invalid feature: %', p_feature;
  END IF;

  IF p_amount < 0 THEN
    RAISE EXCEPTION 'Amount must be non-negative, got: %', p_amount;
  END IF;

  -- Insert or update usage quota for today
  INSERT INTO usage_quotas (user_id, quota_date, cv_analyses_used, coach_seconds_used, job_searches_used)
  VALUES (
    p_user_id,
    CURRENT_DATE,
    CASE WHEN p_feature = 'cv_analysis' THEN p_amount ELSE 0 END,
    CASE WHEN p_feature = 'coach' THEN p_amount ELSE 0 END,
    CASE WHEN p_feature = 'job_search' THEN p_amount ELSE 0 END
  )
  ON CONFLICT (user_id, quota_date) DO UPDATE SET
    cv_analyses_used = usage_quotas.cv_analyses_used +
      CASE WHEN p_feature = 'cv_analysis' THEN p_amount ELSE 0 END,
    coach_seconds_used = usage_quotas.coach_seconds_used +
      CASE WHEN p_feature = 'coach' THEN p_amount ELSE 0 END,
    job_searches_used = usage_quotas.job_searches_used +
      CASE WHEN p_feature = 'job_search' THEN p_amount ELSE 0 END,
    updated_at = NOW();

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  RETURN v_rows_affected > 0;
END;
$$;


ALTER FUNCTION "public"."increment_usage"("p_user_id" "uuid", "p_feature" "text", "p_amount" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."increment_usage"("p_user_id" "uuid", "p_feature" "text", "p_amount" integer) IS 'Increment usage counter for a feature. Creates record if it doesn''t exist.';



CREATE OR REPLACE FUNCTION "public"."list_user_cv_analyses"("p_user_id" "uuid", "p_limit" integer DEFAULT 20, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "status" "text", "created_at" timestamp with time zone, "completed_at" timestamp with time zone, "processing_time_seconds" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."list_user_cv_analyses"("p_user_id" "uuid", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_security_event"("p_user_id" "uuid", "p_action" "text", "p_resource_type" "text" DEFAULT NULL::"text", "p_resource_id" "uuid" DEFAULT NULL::"uuid", "p_success" boolean DEFAULT true, "p_error_message" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO security_audit_log (
    user_id, action, resource_type, resource_id, success, error_message
  )
  VALUES (
    p_user_id, p_action, p_resource_type, p_resource_id, p_success, p_error_message
  );
END;
$$;


ALTER FUNCTION "public"."log_security_event"("p_user_id" "uuid", "p_action" "text", "p_resource_type" "text", "p_resource_id" "uuid", "p_success" boolean, "p_error_message" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."log_security_event"("p_user_id" "uuid", "p_action" "text", "p_resource_type" "text", "p_resource_id" "uuid", "p_success" boolean, "p_error_message" "text") IS 'Log security-relevant events for monitoring and compliance';



CREATE OR REPLACE FUNCTION "public"."log_security_event"("p_event_type" "text", "p_severity" "text" DEFAULT 'info'::"text", "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_session_id" "text" DEFAULT NULL::"text", "p_ip_address" "text" DEFAULT NULL::"text", "p_user_agent" "text" DEFAULT NULL::"text", "p_event_data" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."log_security_event"("p_event_type" "text", "p_severity" "text", "p_user_id" "uuid", "p_session_id" "text", "p_ip_address" "text", "p_user_agent" "text", "p_event_data" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."log_security_event"("p_event_type" "text", "p_severity" "text", "p_user_id" "uuid", "p_session_id" "text", "p_ip_address" "text", "p_user_agent" "text", "p_event_data" "jsonb") IS 'Logs a security event with automatic severity validation and critical event logging';



CREATE OR REPLACE FUNCTION "public"."reset_daily_quotas"() RETURNS integer
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."reset_daily_quotas"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."reset_daily_quotas"() IS 'Reset usage counters for all users (call daily via cron)';



CREATE OR REPLACE FUNCTION "public"."update_coach_conversation_metadata"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();

  -- Update last_message_at from last message timestamp
  IF jsonb_typeof(NEW.messages) = 'array' AND jsonb_array_length(NEW.messages) > 0 THEN
    NEW.last_message_at = (NEW.messages->-1->>'timestamp')::timestamptz;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_coach_conversation_metadata"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_saved_jobs_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_saved_jobs_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_subscription_tier"("p_user_id" "uuid", "p_new_tier" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
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
      new_cv_limit := -1;  -- Unlimited
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


ALTER FUNCTION "public"."update_subscription_tier"("p_user_id" "uuid", "p_new_tier" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_subscription_tier"("p_user_id" "uuid", "p_new_tier" "text") IS 'Update user tier and adjust quotas accordingly';



CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_preferences"("user_id" "uuid", "new_language" "text" DEFAULT NULL::"text", "new_email_notifications" boolean DEFAULT NULL::boolean, "new_newsletter" boolean DEFAULT NULL::boolean) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."update_user_preferences"("user_id" "uuid", "new_language" "text", "new_email_notifications" boolean, "new_newsletter" boolean) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."coach_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "session_id" "text" NOT NULL,
    "messages" "jsonb" DEFAULT '[]'::"jsonb",
    "context" "jsonb",
    "title" "text",
    "is_favorite" boolean DEFAULT false NOT NULL,
    "message_count" integer GENERATED ALWAYS AS (
CASE
    WHEN ("jsonb_typeof"("messages") = 'array'::"text") THEN "jsonb_array_length"("messages")
    ELSE 0
END) STORED,
    "last_message_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."coach_conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cv_analyses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "pdf_url" "text",
    "cv_text" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "result" "jsonb",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "filename" "text",
    "job_description" "text",
    "language" "text" DEFAULT 'fr'::"text",
    "completed_at" timestamp with time zone,
    "anonymous_id" "text",
    "client_ip" "text",
    CONSTRAINT "cv_analyses_language_check" CHECK (("language" = ANY (ARRAY['fr'::"text", 'en'::"text"]))),
    CONSTRAINT "cv_analyses_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."cv_analyses" OWNER TO "postgres";


COMMENT ON TABLE "public"."cv_analyses" IS 'CV analysis jobs with Modal async processing (S6-6)';



COMMENT ON COLUMN "public"."cv_analyses"."user_id" IS 'User UUID (NULL for anonymous users)';



COMMENT ON COLUMN "public"."cv_analyses"."pdf_url" IS 'Supabase Storage URL for uploaded PDF';



COMMENT ON COLUMN "public"."cv_analyses"."cv_text" IS 'CV text content (if text mode used instead of PDF upload)';



COMMENT ON COLUMN "public"."cv_analyses"."status" IS 'pending: uploaded, processing: Modal running, completed: success, failed: error';



COMMENT ON COLUMN "public"."cv_analyses"."result" IS 'Analysis results from Modal (ATS scores, suggestions, etc.)';



COMMENT ON COLUMN "public"."cv_analyses"."error_message" IS 'Error message if status = failed';



COMMENT ON COLUMN "public"."cv_analyses"."anonymous_id" IS 'Session ID for anonymous users (NULL for authenticated users)';



COMMENT ON COLUMN "public"."cv_analyses"."client_ip" IS 'Client IP address (for anonymous user rate limiting)';



CREATE TABLE IF NOT EXISTS "public"."security_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_type" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "user_id" "uuid",
    "session_id" "text",
    "ip_address" "inet",
    "user_agent" "text",
    "event_data" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "security_events_severity_check" CHECK (("severity" = ANY (ARRAY['info'::"text", 'warning'::"text", 'critical'::"text", 'emergency'::"text"])))
);


ALTER TABLE "public"."security_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."security_events" IS 'Security audit log for monitoring authentication, RLS violations, and suspicious activity';



CREATE OR REPLACE VIEW "public"."event_type_distribution" AS
 SELECT "event_type",
    "count"(*) AS "event_count",
    "count"(DISTINCT "user_id") AS "unique_users"
   FROM "public"."security_events"
  WHERE ("created_at" > ("now"() - '24:00:00'::interval))
  GROUP BY "event_type"
  ORDER BY ("count"(*)) DESC;


ALTER VIEW "public"."event_type_distribution" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."failed_logins_by_ip" AS
 SELECT "ip_address",
    "count"(*) AS "attempt_count",
    "max"("created_at") AS "last_attempt",
    "array_agg"(DISTINCT "user_id") AS "attempted_user_ids"
   FROM "public"."security_events"
  WHERE (("event_type" = 'auth.failed_login'::"text") AND ("created_at" > ("now"() - '01:00:00'::interval)))
  GROUP BY "ip_address"
 HAVING ("count"(*) >= 3)
  ORDER BY ("count"(*)) DESC;


ALTER VIEW "public"."failed_logins_by_ip" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_search_cache" (
    "id" integer NOT NULL,
    "cache_key" character varying(255) NOT NULL,
    "query_params" "jsonb" NOT NULL,
    "results" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."job_search_cache" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."job_search_cache_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."job_search_cache_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."job_search_cache_id_seq" OWNED BY "public"."job_search_cache"."id";



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_login_at" timestamp with time zone,
    "onboarding_completed" boolean DEFAULT false,
    "onboarding_completed_at" timestamp with time zone,
    "subscription_tier" "text" DEFAULT 'free'::"text" NOT NULL,
    "cv_analyses_used" integer DEFAULT 0,
    "cv_analyses_limit" integer DEFAULT 1,
    "coach_messages_used" integer DEFAULT 0,
    "coach_messages_limit" integer DEFAULT 5,
    "job_searches_used" integer DEFAULT 0,
    "job_searches_limit" integer DEFAULT 10,
    "quota_reset_date" timestamp with time zone DEFAULT ("now"() + '1 day'::interval),
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "stripe_subscription_status" "text",
    "preferred_language" "text" DEFAULT 'fr'::"text",
    "email_notifications" boolean DEFAULT true,
    "newsletter_subscribed" boolean DEFAULT false,
    CONSTRAINT "profiles_coach_messages_limit_check" CHECK (("coach_messages_limit" >= '-1'::integer)),
    CONSTRAINT "profiles_coach_messages_used_check" CHECK (("coach_messages_used" >= 0)),
    CONSTRAINT "profiles_cv_analyses_limit_check" CHECK (("cv_analyses_limit" >= '-1'::integer)),
    CONSTRAINT "profiles_cv_analyses_used_check" CHECK (("cv_analyses_used" >= 0)),
    CONSTRAINT "profiles_job_searches_limit_check" CHECK (("job_searches_limit" >= '-1'::integer)),
    CONSTRAINT "profiles_job_searches_used_check" CHECK (("job_searches_used" >= 0)),
    CONSTRAINT "profiles_preferred_language_check" CHECK (("preferred_language" = ANY (ARRAY['fr'::"text", 'en'::"text"]))),
    CONSTRAINT "profiles_stripe_subscription_status_check" CHECK (("stripe_subscription_status" = ANY (ARRAY['active'::"text", 'canceled'::"text", 'past_due'::"text", 'trialing'::"text", NULL::"text"]))),
    CONSTRAINT "profiles_subscription_tier_check" CHECK (("subscription_tier" = ANY (ARRAY['free'::"text", 'starter'::"text", 'pro'::"text", 'premium'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."profiles" IS 'User profiles with subscription tiers and usage quotas';



COMMENT ON COLUMN "public"."profiles"."subscription_tier" IS 'User subscription tier: free, starter, pro, premium';



COMMENT ON COLUMN "public"."profiles"."cv_analyses_limit" IS 'Daily CV analysis limit (-1 = unlimited)';



COMMENT ON COLUMN "public"."profiles"."coach_messages_limit" IS 'Daily coach message limit (-1 = unlimited)';



COMMENT ON COLUMN "public"."profiles"."job_searches_limit" IS 'Daily job search limit (-1 = unlimited)';



COMMENT ON COLUMN "public"."profiles"."quota_reset_date" IS 'Next quota reset date (typically tomorrow at midnight)';



COMMENT ON COLUMN "public"."profiles"."preferred_language" IS 'User preferred language: fr (Français) or en (English)';



COMMENT ON COLUMN "public"."profiles"."email_notifications" IS 'Whether user wants to receive email notifications';



COMMENT ON COLUMN "public"."profiles"."newsletter_subscribed" IS 'Whether user is subscribed to HuntZen newsletter';



CREATE OR REPLACE VIEW "public"."recent_critical_events" AS
 SELECT "id",
    "event_type",
    "severity",
    "user_id",
    "ip_address",
    "created_at",
    "event_data"
   FROM "public"."security_events"
  WHERE (("severity" = ANY (ARRAY['critical'::"text", 'emergency'::"text"])) AND ("created_at" > ("now"() - '24:00:00'::interval)))
  ORDER BY "created_at" DESC;


ALTER VIEW "public"."recent_critical_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recruiter_cache" (
    "id" integer NOT NULL,
    "company_name" character varying(255) NOT NULL,
    "location" character varying(255),
    "recruiter_data" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."recruiter_cache" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."recruiter_cache_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."recruiter_cache_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."recruiter_cache_id_seq" OWNED BY "public"."recruiter_cache"."id";



CREATE TABLE IF NOT EXISTS "public"."saved_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "job_title" "text" NOT NULL,
    "company" "text" NOT NULL,
    "location" "text" NOT NULL,
    "salary" "text",
    "job_url" "text" NOT NULL,
    "description" "text",
    "external_job_id" "text",
    "saved_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "job_source" "text" DEFAULT 'adzuna'::"text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."saved_jobs" OWNER TO "postgres";


COMMENT ON TABLE "public"."saved_jobs" IS 'Stores users favorite/saved job listings for easy access';



CREATE TABLE IF NOT EXISTS "public"."security_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "resource_type" "text",
    "resource_id" "uuid",
    "ip_address" "inet",
    "user_agent" "text",
    "success" boolean NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."security_audit_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."security_audit_log" IS 'Security audit trail for sensitive operations';



CREATE TABLE IF NOT EXISTS "public"."subscription_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "description" "text",
    "price_monthly" numeric(10,2) DEFAULT 0 NOT NULL,
    "price_yearly" numeric(10,2) DEFAULT 0 NOT NULL,
    "limits" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "features" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."subscription_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."usage_quotas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "quota_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "cv_analyses_used" integer DEFAULT 0,
    "coach_seconds_used" integer DEFAULT 0,
    "job_searches_used" integer DEFAULT 0,
    "last_reset_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."usage_quotas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_sessions" (
    "id" integer NOT NULL,
    "session_id" character varying(64) NOT NULL,
    "cv_text" "text",
    "preferences" "jsonb" DEFAULT '{}'::"jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_sessions" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."user_sessions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."user_sessions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."user_sessions_id_seq" OWNED BY "public"."user_sessions"."id";



CREATE TABLE IF NOT EXISTS "public"."user_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "current_period_start" timestamp with time zone NOT NULL,
    "current_period_end" timestamp with time zone NOT NULL,
    "cancel_at_period_end" boolean DEFAULT false,
    "stripe_subscription_id" "text",
    "stripe_customer_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_subscriptions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'canceled'::"text", 'expired'::"text", 'past_due'::"text"])))
);


ALTER TABLE "public"."user_subscriptions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."job_search_cache" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."job_search_cache_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."recruiter_cache" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."recruiter_cache_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."user_sessions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."user_sessions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."coach_conversations"
    ADD CONSTRAINT "coach_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cv_analyses"
    ADD CONSTRAINT "cv_analyses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_search_cache"
    ADD CONSTRAINT "job_search_cache_cache_key_key" UNIQUE ("cache_key");



ALTER TABLE ONLY "public"."job_search_cache"
    ADD CONSTRAINT "job_search_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_stripe_customer_id_key" UNIQUE ("stripe_customer_id");



ALTER TABLE ONLY "public"."recruiter_cache"
    ADD CONSTRAINT "recruiter_cache_company_name_location_key" UNIQUE ("company_name", "location");



ALTER TABLE ONLY "public"."recruiter_cache"
    ADD CONSTRAINT "recruiter_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_jobs"
    ADD CONSTRAINT "saved_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."security_audit_log"
    ADD CONSTRAINT "security_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."security_events"
    ADD CONSTRAINT "security_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_plans"
    ADD CONSTRAINT "subscription_plans_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."subscription_plans"
    ADD CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_jobs"
    ADD CONSTRAINT "unique_user_job" UNIQUE ("user_id", "external_job_id", "job_source");



ALTER TABLE ONLY "public"."usage_quotas"
    ADD CONSTRAINT "usage_quotas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usage_quotas"
    ADD CONSTRAINT "usage_quotas_user_id_quota_date_key" UNIQUE ("user_id", "quota_date");



ALTER TABLE ONLY "public"."user_sessions"
    ADD CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_sessions"
    ADD CONSTRAINT "user_sessions_session_id_key" UNIQUE ("session_id");



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("id");



CREATE INDEX "coach_conversations_is_favorite_idx" ON "public"."coach_conversations" USING "btree" ("user_id", "is_favorite") WHERE ("is_favorite" = true);



CREATE INDEX "coach_conversations_last_message_idx" ON "public"."coach_conversations" USING "btree" ("user_id", "last_message_at" DESC);



CREATE INDEX "coach_conversations_session_id_idx" ON "public"."coach_conversations" USING "btree" ("session_id");



CREATE INDEX "coach_conversations_title_gin_idx" ON "public"."coach_conversations" USING "gin" ("to_tsvector"('"french"'::"regconfig", COALESCE("title", ''::"text")));



CREATE INDEX "coach_conversations_user_id_idx" ON "public"."coach_conversations" USING "btree" ("user_id");



CREATE INDEX "idx_cv_analyses_anonymous_id" ON "public"."cv_analyses" USING "btree" ("anonymous_id") WHERE ("anonymous_id" IS NOT NULL);



CREATE INDEX "idx_cv_analyses_client_ip" ON "public"."cv_analyses" USING "btree" ("client_ip", "created_at") WHERE ("client_ip" IS NOT NULL);



CREATE INDEX "idx_cv_analyses_created_at" ON "public"."cv_analyses" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_cv_analyses_status" ON "public"."cv_analyses" USING "btree" ("status");



CREATE INDEX "idx_cv_analyses_user" ON "public"."cv_analyses" USING "btree" ("user_id");



CREATE INDEX "idx_cv_analyses_user_id" ON "public"."cv_analyses" USING "btree" ("user_id");



CREATE INDEX "idx_cv_analyses_user_status" ON "public"."cv_analyses" USING "btree" ("user_id", "status");



CREATE UNIQUE INDEX "idx_one_active_subscription_per_user" ON "public"."user_subscriptions" USING "btree" ("user_id") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_profiles_email" ON "public"."profiles" USING "btree" ("email");



CREATE INDEX "idx_profiles_newsletter_subscribed" ON "public"."profiles" USING "btree" ("newsletter_subscribed") WHERE ("newsletter_subscribed" = true);



CREATE INDEX "idx_profiles_preferred_language" ON "public"."profiles" USING "btree" ("preferred_language");



CREATE INDEX "idx_profiles_stripe_customer" ON "public"."profiles" USING "btree" ("stripe_customer_id");



CREATE INDEX "idx_profiles_tier" ON "public"."profiles" USING "btree" ("subscription_tier");



CREATE INDEX "idx_saved_jobs_external_id" ON "public"."saved_jobs" USING "btree" ("external_job_id");



CREATE INDEX "idx_saved_jobs_saved_at" ON "public"."saved_jobs" USING "btree" ("saved_at" DESC);



CREATE INDEX "idx_saved_jobs_user_id" ON "public"."saved_jobs" USING "btree" ("user_id");



CREATE INDEX "idx_security_audit_action" ON "public"."security_audit_log" USING "btree" ("action", "created_at" DESC);



CREATE INDEX "idx_security_audit_user" ON "public"."security_audit_log" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_security_events_created_at" ON "public"."security_events" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_security_events_event_type" ON "public"."security_events" USING "btree" ("event_type");



CREATE INDEX "idx_security_events_ip_address" ON "public"."security_events" USING "btree" ("ip_address");



CREATE INDEX "idx_security_events_severity" ON "public"."security_events" USING "btree" ("severity");



CREATE INDEX "idx_security_events_severity_created" ON "public"."security_events" USING "btree" ("severity", "created_at" DESC);



CREATE INDEX "idx_security_events_user_id" ON "public"."security_events" USING "btree" ("user_id");



CREATE INDEX "idx_security_events_user_type" ON "public"."security_events" USING "btree" ("user_id", "event_type");



CREATE INDEX "idx_subscription_plans_active" ON "public"."subscription_plans" USING "btree" ("is_active");



CREATE INDEX "idx_subscription_plans_name" ON "public"."subscription_plans" USING "btree" ("name");



CREATE INDEX "idx_usage_quotas_date" ON "public"."usage_quotas" USING "btree" ("quota_date");



CREATE INDEX "idx_usage_quotas_user_date" ON "public"."usage_quotas" USING "btree" ("user_id", "quota_date");



CREATE INDEX "idx_user_subscriptions_active_period" ON "public"."user_subscriptions" USING "btree" ("user_id", "status", "current_period_end") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_user_subscriptions_status" ON "public"."user_subscriptions" USING "btree" ("status");



CREATE INDEX "idx_user_subscriptions_stripe_customer" ON "public"."user_subscriptions" USING "btree" ("stripe_customer_id") WHERE ("stripe_customer_id" IS NOT NULL);



CREATE INDEX "idx_user_subscriptions_user" ON "public"."user_subscriptions" USING "btree" ("user_id");



CREATE INDEX "idx_user_subscriptions_user_id" ON "public"."user_subscriptions" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "saved_jobs_updated_at_trigger" BEFORE UPDATE ON "public"."saved_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."update_saved_jobs_updated_at"();



CREATE OR REPLACE TRIGGER "update_coach_conversations_metadata" BEFORE INSERT OR UPDATE ON "public"."coach_conversations" FOR EACH ROW EXECUTE FUNCTION "public"."update_coach_conversation_metadata"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."coach_conversations"
    ADD CONSTRAINT "coach_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cv_analyses"
    ADD CONSTRAINT "cv_analyses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_jobs"
    ADD CONSTRAINT "saved_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."security_audit_log"
    ADD CONSTRAINT "security_audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."security_events"
    ADD CONSTRAINT "security_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."usage_quotas"
    ADD CONSTRAINT "usage_quotas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id");



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Anonymous users can delete own CV analyses" ON "public"."cv_analyses" FOR DELETE USING ((("user_id" IS NULL) AND ("anonymous_id" IS NOT NULL)));



CREATE POLICY "Anonymous users can insert CV analyses" ON "public"."cv_analyses" FOR INSERT WITH CHECK ((("user_id" IS NULL) AND ("anonymous_id" IS NOT NULL)));



CREATE POLICY "Anonymous users can read own CV analyses" ON "public"."cv_analyses" FOR SELECT USING ((("user_id" IS NULL) AND ("anonymous_id" IS NOT NULL)));



CREATE POLICY "Anyone can view active subscription plans" ON "public"."subscription_plans" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Authenticated users can delete own CV analyses" ON "public"."cv_analyses" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can insert own CV analyses" ON "public"."cv_analyses" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can read own CV analyses" ON "public"."cv_analyses" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Block manual profile creation" ON "public"."profiles" FOR INSERT WITH CHECK (false);



CREATE POLICY "Only service role can view audit logs" ON "public"."security_audit_log" FOR SELECT USING (false);



CREATE POLICY "Service role can update any CV analysis" ON "public"."cv_analyses" FOR UPDATE USING (true);



CREATE POLICY "Service role full access" ON "public"."security_events" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Users can delete own coach conversations" ON "public"."coach_conversations" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own conversations" ON "public"."coach_conversations" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own saved jobs" ON "public"."saved_jobs" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own coach conversations" ON "public"."coach_conversations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own conversations" ON "public"."coach_conversations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own cv analyses" ON "public"."cv_analyses" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own saved jobs" ON "public"."saved_jobs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own security events" ON "public"."security_events" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own CV analyses metadata" ON "public"."cv_analyses" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK ((("auth"."uid"() = "user_id") AND ("status" = ( SELECT "cv_analyses_1"."status"
   FROM "public"."cv_analyses" "cv_analyses_1"
  WHERE ("cv_analyses_1"."id" = "cv_analyses_1"."id")))));



CREATE POLICY "Users can update own coach conversations" ON "public"."coach_conversations" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own conversations" ON "public"."coach_conversations" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own cv analyses" ON "public"."cv_analyses" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK ((("auth"."uid"() = "id") AND ("subscription_tier" = ( SELECT "profiles_1"."subscription_tier"
   FROM "public"."profiles" "profiles_1"
  WHERE ("profiles_1"."id" = "auth"."uid"()))) AND ("cv_analyses_limit" = ( SELECT "profiles_1"."cv_analyses_limit"
   FROM "public"."profiles" "profiles_1"
  WHERE ("profiles_1"."id" = "auth"."uid"()))) AND ("coach_messages_limit" = ( SELECT "profiles_1"."coach_messages_limit"
   FROM "public"."profiles" "profiles_1"
  WHERE ("profiles_1"."id" = "auth"."uid"()))) AND ("job_searches_limit" = ( SELECT "profiles_1"."job_searches_limit"
   FROM "public"."profiles" "profiles_1"
  WHERE ("profiles_1"."id" = "auth"."uid"())))));



CREATE POLICY "Users can update their own saved jobs" ON "public"."saved_jobs" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own coach conversations" ON "public"."coach_conversations" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own conversations" ON "public"."coach_conversations" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own cv analyses" ON "public"."cv_analyses" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own subscriptions" ON "public"."user_subscriptions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own usage" ON "public"."usage_quotas" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own saved jobs" ON "public"."saved_jobs" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."coach_conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cv_analyses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."saved_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."security_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."security_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "subscription_plans_public_read" ON "public"."subscription_plans" FOR SELECT TO "authenticated", "anon" USING (("is_active" = true));



ALTER TABLE "public"."usage_quotas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "usage_quotas_own_insert" ON "public"."usage_quotas" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "usage_quotas_own_read" ON "public"."usage_quotas" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "usage_quotas_own_update" ON "public"."usage_quotas" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_subscriptions_own_read" ON "public"."user_subscriptions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_subscriptions_own_update" ON "public"."user_subscriptions" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."can_user_perform_action"("p_user_id" "uuid", "p_action" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_user_perform_action"("p_user_id" "uuid", "p_action" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_user_perform_action"("p_user_id" "uuid", "p_action" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_user_quota"("p_user_id" "uuid", "p_feature" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_user_quota"("p_user_id" "uuid", "p_feature" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_user_quota"("p_user_id" "uuid", "p_feature" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_old_security_events"("p_retention_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_security_events"("p_retention_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_security_events"("p_retention_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."count_anonymous_analyses"("p_client_ip" "text", "p_time_window" interval) TO "anon";
GRANT ALL ON FUNCTION "public"."count_anonymous_analyses"("p_client_ip" "text", "p_time_window" interval) TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_anonymous_analyses"("p_client_ip" "text", "p_time_window" interval) TO "service_role";



GRANT ALL ON FUNCTION "public"."detect_failed_login_anomaly"("p_user_id" "uuid", "p_threshold" integer, "p_time_window" interval) TO "anon";
GRANT ALL ON FUNCTION "public"."detect_failed_login_anomaly"("p_user_id" "uuid", "p_threshold" integer, "p_time_window" interval) TO "authenticated";
GRANT ALL ON FUNCTION "public"."detect_failed_login_anomaly"("p_user_id" "uuid", "p_threshold" integer, "p_time_window" interval) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_cv_analysis_status"("p_cv_id" "uuid", "p_user_id" "uuid", "p_anonymous_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_cv_analysis_status"("p_cv_id" "uuid", "p_user_id" "uuid", "p_anonymous_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_cv_analysis_status"("p_cv_id" "uuid", "p_user_id" "uuid", "p_anonymous_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_quota_status"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_quota_status"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_quota_status"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_plan"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_plan"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_plan"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_plan_limits"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_plan_limits"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_plan_limits"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_preferences"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_preferences"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_preferences"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_security_events"("p_user_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_security_events"("p_user_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_security_events"("p_user_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_usage"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_usage"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_usage"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_active_subscription"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_active_subscription"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_active_subscription"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_usage"("p_user_id" "uuid", "p_feature" "text", "p_amount" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_usage"("p_user_id" "uuid", "p_feature" "text", "p_amount" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_usage"("p_user_id" "uuid", "p_feature" "text", "p_amount" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."list_user_cv_analyses"("p_user_id" "uuid", "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."list_user_cv_analyses"("p_user_id" "uuid", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_user_cv_analyses"("p_user_id" "uuid", "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."log_security_event"("p_user_id" "uuid", "p_action" "text", "p_resource_type" "text", "p_resource_id" "uuid", "p_success" boolean, "p_error_message" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."log_security_event"("p_user_id" "uuid", "p_action" "text", "p_resource_type" "text", "p_resource_id" "uuid", "p_success" boolean, "p_error_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_security_event"("p_user_id" "uuid", "p_action" "text", "p_resource_type" "text", "p_resource_id" "uuid", "p_success" boolean, "p_error_message" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_security_event"("p_event_type" "text", "p_severity" "text", "p_user_id" "uuid", "p_session_id" "text", "p_ip_address" "text", "p_user_agent" "text", "p_event_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_security_event"("p_event_type" "text", "p_severity" "text", "p_user_id" "uuid", "p_session_id" "text", "p_ip_address" "text", "p_user_agent" "text", "p_event_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_security_event"("p_event_type" "text", "p_severity" "text", "p_user_id" "uuid", "p_session_id" "text", "p_ip_address" "text", "p_user_agent" "text", "p_event_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."reset_daily_quotas"() TO "anon";
GRANT ALL ON FUNCTION "public"."reset_daily_quotas"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_daily_quotas"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_coach_conversation_metadata"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_coach_conversation_metadata"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_coach_conversation_metadata"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_saved_jobs_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_saved_jobs_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_saved_jobs_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_subscription_tier"("p_user_id" "uuid", "p_new_tier" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_subscription_tier"("p_user_id" "uuid", "p_new_tier" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_subscription_tier"("p_user_id" "uuid", "p_new_tier" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_preferences"("user_id" "uuid", "new_language" "text", "new_email_notifications" boolean, "new_newsletter" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_preferences"("user_id" "uuid", "new_language" "text", "new_email_notifications" boolean, "new_newsletter" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_preferences"("user_id" "uuid", "new_language" "text", "new_email_notifications" boolean, "new_newsletter" boolean) TO "service_role";


















GRANT ALL ON TABLE "public"."coach_conversations" TO "anon";
GRANT ALL ON TABLE "public"."coach_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."cv_analyses" TO "anon";
GRANT ALL ON TABLE "public"."cv_analyses" TO "authenticated";
GRANT ALL ON TABLE "public"."cv_analyses" TO "service_role";



GRANT ALL ON TABLE "public"."security_events" TO "anon";
GRANT ALL ON TABLE "public"."security_events" TO "authenticated";
GRANT ALL ON TABLE "public"."security_events" TO "service_role";



GRANT ALL ON TABLE "public"."event_type_distribution" TO "anon";
GRANT ALL ON TABLE "public"."event_type_distribution" TO "authenticated";
GRANT ALL ON TABLE "public"."event_type_distribution" TO "service_role";



GRANT ALL ON TABLE "public"."failed_logins_by_ip" TO "anon";
GRANT ALL ON TABLE "public"."failed_logins_by_ip" TO "authenticated";
GRANT ALL ON TABLE "public"."failed_logins_by_ip" TO "service_role";



GRANT ALL ON TABLE "public"."job_search_cache" TO "anon";
GRANT ALL ON TABLE "public"."job_search_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."job_search_cache" TO "service_role";



GRANT ALL ON SEQUENCE "public"."job_search_cache_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."job_search_cache_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."job_search_cache_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."recent_critical_events" TO "anon";
GRANT ALL ON TABLE "public"."recent_critical_events" TO "authenticated";
GRANT ALL ON TABLE "public"."recent_critical_events" TO "service_role";



GRANT ALL ON TABLE "public"."recruiter_cache" TO "anon";
GRANT ALL ON TABLE "public"."recruiter_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."recruiter_cache" TO "service_role";



GRANT ALL ON SEQUENCE "public"."recruiter_cache_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."recruiter_cache_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."recruiter_cache_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."saved_jobs" TO "anon";
GRANT ALL ON TABLE "public"."saved_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."security_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."security_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."security_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_plans" TO "anon";
GRANT ALL ON TABLE "public"."subscription_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_plans" TO "service_role";



GRANT ALL ON TABLE "public"."usage_quotas" TO "anon";
GRANT ALL ON TABLE "public"."usage_quotas" TO "authenticated";
GRANT ALL ON TABLE "public"."usage_quotas" TO "service_role";



GRANT ALL ON TABLE "public"."user_sessions" TO "anon";
GRANT ALL ON TABLE "public"."user_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_sessions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_sessions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_sessions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_sessions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."user_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_subscriptions" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































