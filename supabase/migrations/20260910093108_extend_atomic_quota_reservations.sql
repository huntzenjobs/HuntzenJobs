-- Étend les réservations atomiques existantes aux analyses ATS et matching.
-- La colonne resource_id relie de façon unique un traitement Modal à sa réservation.

SET lock_timeout = '5s';
SET statement_timeout = '30s';

ALTER TABLE public.ai_quota_reservations
  ADD COLUMN IF NOT EXISTS resource_id TEXT;

ALTER TABLE public.ai_quota_reservations
  DROP CONSTRAINT IF EXISTS ai_quota_reservations_feature_check;
ALTER TABLE public.ai_quota_reservations
  ADD CONSTRAINT ai_quota_reservations_feature_check
  CHECK (feature IN ('cv_adapt', 'cover_letter', 'ats_score', 'matching_score'));

CREATE UNIQUE INDEX IF NOT EXISTS ai_quota_reservations_resource_id_key
  ON public.ai_quota_reservations (resource_id)
  WHERE resource_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.bind_ai_quota_reservation(
  p_reservation_id UUID,
  p_resource_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF length(COALESCE(p_resource_id, '')) NOT BETWEEN 1 AND 128 THEN
    RETURN FALSE;
  END IF;
  UPDATE public.ai_quota_reservations
  SET resource_id = p_resource_id
  WHERE id = p_reservation_id
    AND status = 'pending'
    AND resource_id IS NULL;
  RETURN FOUND;
EXCEPTION WHEN unique_violation THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_ai_quota(
  p_user_id UUID,
  p_feature TEXT,
  p_request_key UUID,
  p_amount INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  reservation_id UUID;
  plan_limits JSONB;
  custom_limits JSONB;
  limit_key TEXT;
  quota_limit INTEGER;
  quota_used INTEGER := 0;
  quota_reserved INTEGER := 0;
  existing_reservation public.ai_quota_reservations%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_request_key IS NULL
     OR p_feature NOT IN ('cv_adapt', 'cover_letter', 'ats_score', 'matching_score') THEN
    RAISE EXCEPTION 'paramètres de réservation invalides';
  END IF;
  IF p_amount NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'montant de réservation invalide';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'ai-quota:' || p_user_id::TEXT || ':' || p_feature || ':' || CURRENT_DATE::TEXT, 0
  ));

  UPDATE public.ai_quota_reservations SET status = 'expired', finalized_at = NOW()
  WHERE user_id = p_user_id AND feature = p_feature AND quota_date = CURRENT_DATE
    AND status = 'pending' AND expires_at <= NOW();

  SELECT * INTO existing_reservation FROM public.ai_quota_reservations
  WHERE user_id = p_user_id AND feature = p_feature AND request_key = p_request_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'granted', existing_reservation.status IN ('pending', 'committed'),
      'reservation_id', existing_reservation.id,
      'quota_reserved', existing_reservation.amount,
      'reset_at', (existing_reservation.quota_date + 1)::TIMESTAMPTZ
    );
  END IF;

  SELECT plan.limits, subscription.custom_limits INTO plan_limits, custom_limits
  FROM public.user_subscriptions AS subscription
  JOIN public.subscription_plans AS plan ON plan.id = subscription.plan_id
  WHERE subscription.user_id = p_user_id
    AND subscription.status IN ('active', 'trialing', 'past_due')
    AND (subscription.current_period_end IS NULL OR subscription.current_period_end > NOW())
  ORDER BY CASE subscription.status WHEN 'active' THEN 1 WHEN 'trialing' THEN 2 ELSE 3 END,
    plan.sort_order DESC, subscription.created_at DESC LIMIT 1;

  IF plan_limits IS NULL THEN
    SELECT limits INTO plan_limits FROM public.subscription_plans WHERE name = 'free' LIMIT 1;
  END IF;

  limit_key := CASE p_feature
    WHEN 'cv_adapt' THEN 'cv_adapt_per_day'
    WHEN 'cover_letter' THEN 'cover_letter_per_day'
    WHEN 'ats_score' THEN 'ats_scores_per_day'
    WHEN 'matching_score' THEN 'matching_scores_per_day'
  END;
  quota_limit := COALESCE((custom_limits ->> limit_key)::INTEGER,
                          (plan_limits ->> limit_key)::INTEGER, 0);

  SELECT COALESCE(CASE p_feature
    WHEN 'cv_adapt' THEN cv_adapt_used
    WHEN 'cover_letter' THEN cover_letter_used
    WHEN 'ats_score' THEN ats_scores_used
    WHEN 'matching_score' THEN matching_scores_used END, 0)
  INTO quota_used FROM public.usage_quotas
  WHERE user_id = p_user_id AND quota_date = CURRENT_DATE;
  quota_used := COALESCE(quota_used, 0);

  SELECT COALESCE(SUM(amount), 0)::INTEGER INTO quota_reserved
  FROM public.ai_quota_reservations
  WHERE user_id = p_user_id AND feature = p_feature AND quota_date = CURRENT_DATE
    AND status = 'pending' AND expires_at > NOW();

  IF quota_limit <> -1 AND quota_used + quota_reserved + p_amount > quota_limit THEN
    RETURN jsonb_build_object('granted', FALSE, 'reservation_id', NULL,
      'quota_limit', quota_limit, 'quota_used', quota_used,
      'quota_reserved', quota_reserved,
      'reset_at', (CURRENT_DATE + INTERVAL '1 day')::TIMESTAMPTZ);
  END IF;

  INSERT INTO public.ai_quota_reservations (user_id, feature, request_key, amount, quota_date)
  VALUES (p_user_id, p_feature, p_request_key, p_amount, CURRENT_DATE)
  RETURNING id INTO reservation_id;
  RETURN jsonb_build_object('granted', TRUE, 'reservation_id', reservation_id,
    'quota_limit', quota_limit, 'quota_used', quota_used,
    'quota_reserved', quota_reserved + p_amount,
    'reset_at', (CURRENT_DATE + INTERVAL '1 day')::TIMESTAMPTZ);
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_ai_quota_reservation(p_reservation_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE reservation public.ai_quota_reservations%ROWTYPE;
BEGIN
  SELECT * INTO reservation FROM public.ai_quota_reservations
  WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF reservation.status = 'committed' THEN RETURN TRUE; END IF;
  IF reservation.status <> 'pending' THEN RETURN FALSE; END IF;
  IF reservation.expires_at <= NOW() THEN
    UPDATE public.ai_quota_reservations SET status = 'expired', finalized_at = NOW()
    WHERE id = p_reservation_id;
    RETURN FALSE;
  END IF;
  INSERT INTO public.usage_quotas (
    user_id, quota_date, cv_adapt_used, cover_letter_used,
    ats_scores_used, matching_scores_used
  ) VALUES (
    reservation.user_id,
    reservation.quota_date,
    CASE WHEN reservation.feature = 'cv_adapt' THEN reservation.amount ELSE 0 END,
    CASE WHEN reservation.feature = 'cover_letter' THEN reservation.amount ELSE 0 END,
    CASE WHEN reservation.feature = 'ats_score' THEN reservation.amount ELSE 0 END,
    CASE WHEN reservation.feature = 'matching_score' THEN reservation.amount ELSE 0 END
  )
  ON CONFLICT (user_id, quota_date) DO UPDATE SET
    cv_adapt_used = COALESCE(public.usage_quotas.cv_adapt_used, 0) + EXCLUDED.cv_adapt_used,
    cover_letter_used = COALESCE(public.usage_quotas.cover_letter_used, 0) + EXCLUDED.cover_letter_used,
    ats_scores_used = COALESCE(public.usage_quotas.ats_scores_used, 0) + EXCLUDED.ats_scores_used,
    matching_scores_used = COALESCE(public.usage_quotas.matching_scores_used, 0)
      + EXCLUDED.matching_scores_used,
    updated_at = NOW();
  UPDATE public.ai_quota_reservations SET status = 'committed', finalized_at = NOW()
  WHERE id = p_reservation_id;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_quota(UUID, TEXT, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_quota(UUID, TEXT, UUID, INTEGER) TO service_role;
REVOKE ALL ON FUNCTION public.commit_ai_quota_reservation(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_ai_quota_reservation(UUID) TO service_role;
REVOKE ALL ON FUNCTION public.bind_ai_quota_reservation(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bind_ai_quota_reservation(UUID, TEXT) TO service_role;

COMMENT ON COLUMN public.ai_quota_reservations.resource_id IS
  'Identifiant du traitement asynchrone associé, unique lorsqu''il est renseigné.';
