-- Corrige les quatre avertissements PL/pgSQL encore présents sur staging.
-- Les signatures restent inchangées afin de préserver les appels backend.

CREATE OR REPLACE FUNCTION public.check_coach_message_quota(
  p_user_id UUID,
  p_coach_type TEXT
)
RETURNS TABLE (
  coach_type TEXT,
  quota_limit INTEGER,
  quota_used INTEGER,
  quota_remaining INTEGER,
  has_access BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit INTEGER;
  v_used INTEGER;
BEGIN
  SELECT COALESCE(
    (us.custom_limits->>'assistant_messages')::INTEGER,
    (sp.limits->>'assistant_messages')::INTEGER,
    10
  )
  INTO v_limit
  FROM public.user_subscriptions AS us
  JOIN public.subscription_plans AS sp ON sp.id = us.plan_id
  WHERE us.user_id = p_user_id
    AND us.status = 'active'
    AND us.current_period_end > pg_catalog.now()
  ORDER BY us.created_at DESC
  LIMIT 1;

  IF v_limit IS NULL THEN
    SELECT (sp.limits->>'assistant_messages')::INTEGER
    INTO v_limit
    FROM public.subscription_plans AS sp
    WHERE sp.name = 'free'
    LIMIT 1;

    v_limit := COALESCE(v_limit, 10);
  END IF;

  SELECT COALESCE(
    (uq.assistant_messages_by_coach->>p_coach_type)::INTEGER,
    0
  )
  INTO v_used
  FROM public.usage_quotas AS uq
  WHERE uq.user_id = p_user_id
    AND uq.quota_date = CURRENT_DATE;

  v_used := COALESCE(v_used, 0);

  RETURN QUERY
  SELECT
    p_coach_type,
    v_limit,
    v_used,
    CASE
      WHEN v_limit = -1 THEN -1
      ELSE GREATEST(0, v_limit - v_used)
    END,
    CASE WHEN v_limit = -1 THEN TRUE ELSE v_used < v_limit END;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_webhook_failure(
  p_event_id TEXT,
  p_event_type TEXT,
  p_error_message TEXT,
  p_error_traceback TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_failure_id UUID;
BEGIN
  SELECT wf.id
  INTO v_failure_id
  FROM public.webhook_failures AS wf
  WHERE wf.stripe_event_id = p_event_id
    AND NOT wf.resolved
  LIMIT 1;

  IF v_failure_id IS NOT NULL THEN
    UPDATE public.webhook_failures AS wf
    SET
      retry_count = wf.retry_count + 1,
      last_attempt_at = pg_catalog.now(),
      error_message = p_error_message,
      error_traceback = COALESCE(
        p_error_traceback,
        wf.error_traceback
      ),
      updated_at = pg_catalog.now()
    WHERE wf.id = v_failure_id;
  ELSE
    INSERT INTO public.webhook_failures (
      stripe_event_id,
      event_type,
      error_message,
      error_traceback,
      retry_count
    )
    VALUES (
      p_event_id,
      p_event_type,
      p_error_message,
      p_error_traceback,
      1
    )
    RETURNING id INTO v_failure_id;
  END IF;

  RETURN v_failure_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_user_perform_action(
  p_user_id UUID,
  p_action TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.check_user_quota(p_user_id, p_action);
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_referral_code(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code TEXT;
  v_chars CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id must not be null'
      USING ERRCODE = '22004';
  END IF;

  FOR v_attempt IN 1..100 LOOP
    v_code := 'HZN-';

    FOR v_character IN 1..6 LOOP
      v_code := v_code || pg_catalog.substr(
        v_chars,
        (pg_catalog.floor(pg_catalog.random() * pg_catalog.length(v_chars)))::INTEGER + 1,
        1
      );
    END LOOP;

    IF NOT EXISTS (
      SELECT 1
      FROM public.referrals AS r
      WHERE r.referral_code = v_code
    ) THEN
      RETURN v_code;
    END IF;
  END LOOP;

  RAISE EXCEPTION 'unable to generate a unique referral code'
    USING ERRCODE = '54000';
END;
$$;

REVOKE ALL ON FUNCTION public.check_coach_message_quota(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_webhook_failure(TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_user_perform_action(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_referral_code(UUID)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.check_coach_message_quota(UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.log_webhook_failure(TEXT, TEXT, TEXT, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.can_user_perform_action(UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_referral_code(UUID)
  TO service_role;
