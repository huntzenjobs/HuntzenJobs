-- Principe du moindre privilège : ces fonctions SECURITY DEFINER sont des RPC
-- internes appelées par le backend/crons avec service_role. PostgreSQL accorde
-- EXECUTE à PUBLIC à la création, il faut donc le retirer explicitement.
DO $$
DECLARE
  function_signature TEXT;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.can_user_perform_action(uuid,text)',
    'public.check_coach_message_quota(uuid,text)',
    'public.check_user_quota(uuid,text)',
    'public.cleanup_old_records_rpc()',
    'public.cleanup_old_security_events(integer)',
    'public.cleanup_old_webhook_events()',
    'public.cleanup_stale_coach_sessions()',
    'public.cleanup_usage_quotas(integer)',
    'public.count_anonymous_analyses(text,interval)',
    'public.detect_failed_login_anomaly(uuid,integer,interval)',
    'public.generate_referral_code(uuid)',
    'public.get_active_coach_sessions_stats()',
    'public.get_cleanup_info()',
    'public.get_cv_analysis_status(uuid,uuid,text)',
    'public.get_or_create_referral_code(uuid)',
    'public.get_plan_prices(text)',
    'public.get_quota_reset_info()',
    'public.get_quota_status(uuid)',
    'public.get_stripe_price_id(text,text)',
    'public.get_user_active_coach_session(uuid)',
    'public.get_user_current_subscription(uuid)',
    'public.get_user_plan(uuid)',
    'public.get_user_plan_limits(uuid)',
    'public.get_user_preferences(uuid)',
    'public.get_user_security_events(uuid,integer)',
    'public.get_user_subscription_history(uuid,integer)',
    'public.get_user_usage(uuid)',
    'public.get_webhook_processing_stats(integer)',
    'public.handle_new_user()',
    'public.has_active_subscription(uuid)',
    'public.increment_coach_message(uuid,text,integer)',
    'public.increment_referral_clicks(uuid)',
    'public.increment_referral_conversions(uuid)',
    'public.increment_referral_signups(uuid)',
    'public.increment_usage(uuid,text,integer)',
    'public.is_admin(uuid)',
    'public.list_user_cv_analyses(uuid,integer,integer)',
    'public.log_cv_analysis_updates()',
    'public.log_subscription_change(uuid,uuid,uuid,text,text,text,text)',
    'public.purge_old_user_events()',
    'public.reset_quotas_rpc()',
    'public.update_coach_conversation_metadata(uuid,text,boolean)',
    'public.update_stripe_price(text,text,text,text)',
    'public.update_subscription_tier(uuid,text)',
    'public.update_user_preferences(uuid,text,boolean,boolean)'
  ]
  LOOP
    IF to_regprocedure(function_signature) IS NULL THEN
      RAISE EXCEPTION 'Expected function is missing: %', function_signature;
    END IF;

    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      function_signature
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %s TO service_role',
      function_signature
    );
  END LOOP;
END
$$;

-- Cette RPC est la seule encore appelée directement depuis le navigateur.
-- Elle n'accepte désormais qu'un utilisateur authentifié écrivant ses propres
-- événements, avec des tailles bornées pour éviter l'injection de gros payloads.
CREATE OR REPLACE FUNCTION public.log_security_event(
  p_event_type TEXT,
  p_severity TEXT DEFAULT 'info',
  p_user_id UUID DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_event_data JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  authenticated_user_id UUID := auth.uid();
  caller_role TEXT := current_setting('request.jwt.claim.role', true);
  effective_user_id UUID;
  event_id UUID;
BEGIN
  IF caller_role = 'service_role' THEN
    effective_user_id := p_user_id;
  ELSE
    IF authenticated_user_id IS NULL THEN
      RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_user_id IS NOT NULL AND p_user_id <> authenticated_user_id THEN
      RAISE EXCEPTION 'Cannot log an event for another user';
    END IF;
    effective_user_id := authenticated_user_id;
  END IF;

  IF p_severity NOT IN ('info', 'warning', 'critical', 'emergency') THEN
    RAISE EXCEPTION 'Invalid severity';
  END IF;

  IF p_event_type IS NULL OR length(p_event_type) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Invalid event type';
  END IF;

  IF length(COALESCE(p_session_id, '')) > 128
     OR length(COALESCE(p_user_agent, '')) > 512
     OR octet_length(COALESCE(p_event_data, '{}'::JSONB)::TEXT) > 8192 THEN
    RAISE EXCEPTION 'Security event payload is too large';
  END IF;

  INSERT INTO public.security_events (
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
    effective_user_id,
    p_session_id,
    CASE
      WHEN NULLIF(p_ip_address, '') IS NULL THEN NULL
      ELSE p_ip_address::INET
    END,
    p_user_agent,
    COALESCE(p_event_data, '{}'::JSONB)
  )
  RETURNING id INTO event_id;

  RETURN event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_security_event(
  TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_security_event(
  TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB
) TO authenticated, service_role;
