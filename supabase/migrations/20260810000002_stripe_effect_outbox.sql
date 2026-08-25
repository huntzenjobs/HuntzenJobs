-- Effets externes Stripe durables et dédupliqués.
-- Les mutations métier, l'outbox et la finalisation du webhook partagent
-- la même transaction PostgreSQL dans les RPC apply_stripe_*.

CREATE TABLE public.stripe_effect_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT NOT NULL,
  effect_type TEXT NOT NULL CHECK (effect_type IN (
    'payment_confirmation_client',
    'payment_received_admin',
    'payment_failed_client',
    'payment_failed_admin',
    'subscription_cancelled_client',
    'subscription_cancelled_admin',
    'recruiter_paid_client',
    'recruiter_paid_admin',
    'referral_reward',
    'promo_free_days'
  )),
  subject_type TEXT NOT NULL CHECK (subject_type IN (
    'invoice', 'subscription', 'recruiter_request', 'referral_reward',
    'promo_code'
  )),
  subject_id TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'succeeded', 'superseded', 'dead')
  ),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 8 CHECK (max_attempts > 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claim_token UUID,
  claimed_at TIMESTAMPTZ,
  first_attempt_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  provider_message_id TEXT,
  last_error_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stripe_effect_outbox_ready
  ON public.stripe_effect_outbox (available_at, created_at)
  WHERE status IN ('pending', 'processing');

ALTER TABLE public.stripe_effect_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages Stripe effect outbox"
  ON public.stripe_effect_outbox
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.stripe_effect_outbox
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.stripe_effect_outbox
  TO service_role;

CREATE TABLE public.stripe_checkout_reservations (
  user_id UUID PRIMARY KEY,
  selection_key TEXT NOT NULL,
  plan_id UUID NOT NULL,
  stripe_price_id TEXT NOT NULL,
  stripe_checkout_session_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('creating', 'open')),
  claim_token UUID,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.stripe_checkout_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages Stripe checkout reservations"
  ON public.stripe_checkout_reservations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE public.stripe_checkout_reservations
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.stripe_checkout_reservations TO service_role;

CREATE TABLE public.stripe_checkout_snapshots (
  stripe_checkout_session_id TEXT PRIMARY KEY,
  reservation_token UUID NOT NULL,
  user_id UUID NOT NULL,
  selection_key TEXT NOT NULL,
  plan_id UUID NOT NULL,
  stripe_price_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reservation_token)
);
ALTER TABLE public.stripe_checkout_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages Stripe checkout snapshots"
  ON public.stripe_checkout_snapshots
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE public.stripe_checkout_snapshots
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.stripe_checkout_snapshots TO service_role;

CREATE TABLE public.stripe_trial_extension_leases (
  user_id UUID PRIMARY KEY,
  lease_token UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.stripe_trial_extension_leases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages Stripe trial extension leases"
  ON public.stripe_trial_extension_leases
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE public.stripe_trial_extension_leases
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.stripe_trial_extension_leases TO service_role;

CREATE OR REPLACE FUNCTION public.claim_subscription_checkout(
  p_user_id UUID,
  p_selection_key TEXT,
  p_plan_name TEXT,
  p_price_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  reservation public.stripe_checkout_reservations%ROWTYPE;
  new_claim_token UUID := gen_random_uuid();
  action TEXT := 'create';
  selected_plan_id UUID;
BEGIN
  IF NULLIF(BTRIM(p_selection_key), '') IS NULL THEN
    RAISE EXCEPTION 'Checkout selection key missing';
  END IF;
  SELECT * INTO reservation
  FROM public.stripe_checkout_reservations
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF FOUND THEN
    IF reservation.status = 'open'
      AND reservation.expires_at > NOW()
      AND reservation.selection_key = p_selection_key
    THEN
      RETURN jsonb_build_object(
        'action', 'reuse',
        'session_id', reservation.stripe_checkout_session_id
      );
    END IF;
    IF reservation.status = 'creating'
      AND reservation.updated_at > NOW() - INTERVAL '2 minutes'
    THEN
      RETURN jsonb_build_object('action', 'busy');
    END IF;
    IF reservation.status = 'creating'
      AND reservation.updated_at > NOW() - INTERVAL '24 hours'
      AND (
        reservation.selection_key <> p_selection_key
        OR reservation.stripe_price_id <> p_price_id
      )
    THEN
      RETURN jsonb_build_object('action', 'selection_conflict');
    END IF;
    IF reservation.status = 'creating'
      AND reservation.updated_at > NOW() - INTERVAL '24 hours'
    THEN
      UPDATE public.stripe_checkout_reservations
      SET updated_at = NOW()
      WHERE user_id = p_user_id;
      RETURN jsonb_build_object(
        'action', CASE
          WHEN reservation.stripe_checkout_session_id IS NULL THEN 'create'
          ELSE 'replace'
        END,
        'claim_token', reservation.claim_token,
        'previous_session_id', reservation.stripe_checkout_session_id
      );
    END IF;
    IF reservation.status = 'open'
      AND reservation.stripe_checkout_session_id IS NOT NULL
    THEN
      action := 'replace';
    END IF;
  END IF;

  SELECT plan.id INTO selected_plan_id
  FROM public.subscription_plans AS plan
  JOIN public.stripe_prices AS price ON price.plan_id = plan.id
  WHERE plan.name = p_plan_name
    AND price.stripe_price_id = p_price_id
  LIMIT 1;
  IF selected_plan_id IS NULL THEN
    RAISE EXCEPTION 'Checkout price mapping missing';
  END IF;

  INSERT INTO public.stripe_checkout_reservations (
    user_id, selection_key, plan_id, stripe_price_id,
    stripe_checkout_session_id,
    status, claim_token, expires_at, updated_at
  ) VALUES (
    p_user_id, p_selection_key, selected_plan_id, p_price_id, NULL,
    'creating', new_claim_token, NULL, NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    selection_key = EXCLUDED.selection_key,
    plan_id = EXCLUDED.plan_id,
    stripe_price_id = EXCLUDED.stripe_price_id,
    stripe_checkout_session_id = CASE
      WHEN public.stripe_checkout_reservations.status = 'open'
      THEN public.stripe_checkout_reservations.stripe_checkout_session_id
      ELSE NULL
    END,
    status = 'creating',
    claim_token = EXCLUDED.claim_token,
    expires_at = NULL,
    updated_at = NOW();

  RETURN jsonb_build_object(
    'action', action,
    'claim_token', new_claim_token,
    'previous_session_id', reservation.stripe_checkout_session_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_subscription_checkout(
  p_user_id UUID,
  p_claim_token UUID,
  p_session_id TEXT,
  p_expires_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.stripe_checkout_reservations
  SET stripe_checkout_session_id = p_session_id,
      status = 'open',
      expires_at = p_expires_at,
      updated_at = NOW()
  WHERE user_id = p_user_id
    AND status = 'creating'
    AND claim_token = p_claim_token;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  INSERT INTO public.stripe_checkout_snapshots (
    stripe_checkout_session_id,
    reservation_token,
    user_id,
    selection_key,
    plan_id,
    stripe_price_id
  )
  SELECT
    p_session_id,
    p_claim_token,
    reservation.user_id,
    reservation.selection_key,
    reservation.plan_id,
    reservation.stripe_price_id
  FROM public.stripe_checkout_reservations AS reservation
  WHERE reservation.user_id = p_user_id
    AND reservation.claim_token = p_claim_token
  ON CONFLICT DO NOTHING;
  PERFORM 1
  FROM public.stripe_checkout_snapshots AS snapshot
  WHERE snapshot.stripe_checkout_session_id = p_session_id
    AND snapshot.reservation_token = p_claim_token
    AND snapshot.user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checkout snapshot finalization failed';
  END IF;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_subscription_checkout(
  p_user_id UUID,
  p_claim_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.stripe_checkout_reservations
  WHERE user_id = p_user_id
    AND status = 'creating'
    AND claim_token = p_claim_token;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.invalidate_subscription_checkout(
  p_user_id UUID,
  p_session_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.stripe_checkout_reservations
  WHERE user_id = p_user_id
    AND status = 'open'
    AND stripe_checkout_session_id = p_session_id;
  RETURN FOUND;
END;
$$;

ALTER TABLE public.referral_rewards
  ADD COLUMN IF NOT EXISTS source_key TEXT;

ALTER TABLE public.user_promo_codes
  ADD COLUMN IF NOT EXISTS effect_applied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS effect_payload JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE OR REPLACE FUNCTION public.extend_subscription_days(
  p_user_id UUID,
  p_days INTEGER,
  -- Conserver le DEFAULT historique : PostgreSQL refuse qu'un CREATE OR REPLACE
  -- retire le défaut d'une signature existante lors d'une reconstruction propre.
  p_plan_id UUID DEFAULT '3f42df0e-6794-414f-9410-97981064fa7e'::UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  free_plan_id UUID;
BEGIN
  IF p_days < 1 THEN
    RAISE EXCEPTION 'Subscription extension days must be positive';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::TEXT, 824671)
  );

  SELECT id INTO free_plan_id
  FROM public.subscription_plans
  WHERE name = 'free'
  LIMIT 1;

  UPDATE public.user_subscriptions
  SET current_period_end = COALESCE(current_period_end, NOW())
        + make_interval(days => p_days),
      updated_at = NOW()
  WHERE user_id = p_user_id
    AND status = 'active'
    AND (free_plan_id IS NULL OR plan_id <> free_plan_id);
  IF FOUND THEN
    RETURN TRUE;
  END IF;

  UPDATE public.user_subscriptions
  SET plan_id = p_plan_id,
      current_period_start = NOW(),
      current_period_end = NOW() + make_interval(days => p_days),
      cancel_at_period_end = TRUE,
      updated_at = NOW()
  WHERE user_id = p_user_id
    AND status = 'active';
  IF FOUND THEN
    RETURN TRUE;
  END IF;

  BEGIN
    INSERT INTO public.user_subscriptions (
      user_id, plan_id, status, current_period_start,
      current_period_end, cancel_at_period_end
    ) VALUES (
      p_user_id, p_plan_id, 'active', NOW(),
      NOW() + make_interval(days => p_days), TRUE
    );
  EXCEPTION WHEN unique_violation THEN
    UPDATE public.user_subscriptions
    SET current_period_end = COALESCE(current_period_end, NOW())
          + make_interval(days => p_days),
        updated_at = NOW()
    WHERE user_id = p_user_id
      AND status = 'active';
    IF NOT FOUND THEN
      RAISE;
    END IF;
  END;
  RETURN TRUE;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_rewards_source_key_unique
  ON public.referral_rewards (source_key)
  WHERE source_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_stripe_effects(p_limit INTEGER DEFAULT 20)
RETURNS SETOF public.stripe_effect_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'invalid claim limit';
  END IF;

  UPDATE public.stripe_effect_outbox AS effect
  SET
    status = 'dead',
    completed_at = NOW(),
    last_error_type = 'DeliveryWindowExpired',
    updated_at = NOW()
  WHERE effect.status IN ('pending', 'processing')
    AND (
      effect.first_attempt_at < NOW() - INTERVAL '23 hours'
      OR (
        effect.status = 'processing'
        AND effect.claimed_at < NOW() - INTERVAL '5 minutes'
        AND effect.attempt_count >= effect.max_attempts
      )
    );

  RETURN QUERY
  WITH candidates AS (
    SELECT effect.id
    FROM public.stripe_effect_outbox AS effect
    WHERE effect.attempt_count < effect.max_attempts
      AND (
        effect.first_attempt_at IS NULL
        OR effect.first_attempt_at >= NOW() - INTERVAL '23 hours'
      )
      AND (
        (effect.status = 'pending' AND effect.available_at <= NOW())
        OR (
          effect.status = 'processing'
          AND effect.claimed_at < NOW() - INTERVAL '5 minutes'
        )
      )
    ORDER BY effect.available_at, effect.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.stripe_effect_outbox AS effect
  SET
    status = 'processing',
    claim_token = gen_random_uuid(),
    claimed_at = NOW(),
    first_attempt_at = COALESCE(effect.first_attempt_at, NOW()),
    attempt_count = effect.attempt_count + 1,
    updated_at = NOW()
  FROM candidates
  WHERE effect.id = candidates.id
  RETURNING effect.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_stripe_effect_succeeded(
  p_effect_id UUID,
  p_claim_token UUID,
  p_provider_message_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.stripe_effect_outbox
  SET
    status = 'succeeded',
    completed_at = NOW(),
    provider_message_id = LEFT(p_provider_message_id, 255),
    last_error_type = NULL,
    updated_at = NOW()
  WHERE id = p_effect_id
    AND status = 'processing'
    AND claim_token = p_claim_token;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.retry_stripe_effect(
  p_effect_id UUID,
  p_claim_token UUID,
  p_error_type TEXT,
  p_retry_seconds INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  resulting_status TEXT;
BEGIN
  IF p_retry_seconds < 1 OR p_retry_seconds > 3600 THEN
    RAISE EXCEPTION 'invalid retry delay';
  END IF;

  UPDATE public.stripe_effect_outbox
  SET
    status = CASE
      WHEN attempt_count >= max_attempts
        OR first_attempt_at < NOW() - INTERVAL '23 hours'
      THEN 'dead'
      ELSE 'pending'
    END,
    available_at = CASE
      WHEN attempt_count >= max_attempts
        OR first_attempt_at < NOW() - INTERVAL '23 hours'
      THEN available_at
      ELSE NOW() + make_interval(secs => p_retry_seconds)
    END,
    completed_at = CASE
      WHEN attempt_count >= max_attempts
        OR first_attempt_at < NOW() - INTERVAL '23 hours'
      THEN NOW()
      ELSE NULL
    END,
    last_error_type = LEFT(p_error_type, 120),
    updated_at = NOW()
  WHERE id = p_effect_id
    AND status = 'processing'
    AND claim_token = p_claim_token
  RETURNING status INTO resulting_status;

  IF resulting_status IS NULL THEN
    RETURN jsonb_build_object('updated', FALSE, 'status', NULL);
  END IF;

  RETURN jsonb_build_object('updated', TRUE, 'status', resulting_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.requeue_dead_stripe_effect(p_effect_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.stripe_effect_outbox
  SET
    status = 'pending',
    attempt_count = 0,
    available_at = NOW(),
    claim_token = NULL,
    claimed_at = NULL,
    first_attempt_at = NULL,
    completed_at = NULL,
    last_error_type = NULL,
    updated_at = NOW()
  WHERE id = p_effect_id
    AND status = 'dead';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_promo_code(
  p_user_id UUID,
  p_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  promo_record public.promo_codes%ROWTYPE;
  promo_link_id UUID;
BEGIN
  SELECT promo.*
  INTO promo_record
  FROM public.promo_codes AS promo
  WHERE promo.code = UPPER(BTRIM(p_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF promo_record.is_active IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('status', 'inactive');
  END IF;
  IF promo_record.starts_at IS NOT NULL AND promo_record.starts_at > NOW() THEN
    RETURN jsonb_build_object('status', 'not_started');
  END IF;
  IF promo_record.expires_at IS NOT NULL AND promo_record.expires_at <= NOW() THEN
    RETURN jsonb_build_object('status', 'expired');
  END IF;
  IF promo_record.discount_type IN ('percent', 'fixed_amount')
    AND NULLIF(BTRIM(promo_record.stripe_coupon_id), '') IS NULL
  THEN
    RETURN jsonb_build_object('status', 'misconfigured');
  END IF;
  IF promo_record.discount_type = 'free_days'
    AND promo_record.discount_value <= 0
  THEN
    RETURN jsonb_build_object('status', 'misconfigured');
  END IF;

  SELECT link.id
  INTO promo_link_id
  FROM public.user_promo_codes AS link
  WHERE link.user_id = p_user_id
    AND link.promo_code_id = promo_record.id;
  IF promo_link_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_claimed');
  END IF;

  IF promo_record.max_uses IS NOT NULL
    AND promo_record.current_uses >= promo_record.max_uses
  THEN
    RETURN jsonb_build_object('status', 'limit_reached');
  END IF;

  INSERT INTO public.user_promo_codes (user_id, promo_code_id)
  VALUES (p_user_id, promo_record.id)
  RETURNING id INTO promo_link_id;

  UPDATE public.promo_codes
  SET current_uses = current_uses + 1
  WHERE id = promo_record.id;

  IF promo_record.discount_type = 'free_days' THEN
    INSERT INTO public.stripe_effect_outbox (
      stripe_event_id,
      effect_type,
      subject_type,
      subject_id,
      dedupe_key,
      payload
    ) VALUES (
      'promo:' || promo_link_id::TEXT,
      'promo_free_days',
      'promo_code',
      promo_link_id::TEXT,
      'promo-free-days:' || promo_link_id::TEXT,
      jsonb_build_object('promo_id', promo_record.id)
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'status', 'claimed',
    'promo_id', promo_record.id,
    'promo_link_id', promo_link_id,
    'discount_type', promo_record.discount_type,
    'discount_value', promo_record.discount_value,
    'plan', promo_record.plan
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_promo_free_days(
  p_promo_link_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  promo_user_id UUID;
  promo_effect_applied_at TIMESTAMPTZ;
  promo_effect_payload JSONB;
  promo_days INTEGER;
  promo_plan_name TEXT;
  promo_plan_id UUID;
  active_subscription_id TEXT;
  active_period_end TIMESTAMPTZ;
  reserved_promo_end BIGINT := 0;
  reserved_referral_end BIGINT := 0;
  trial_base BIGINT;
  trial_end BIGINT;
  effect_trial_end BIGINT;
  stored_subscription_id TEXT;
  extension_lease_token UUID := gen_random_uuid();
BEGIN
  SELECT
    link.user_id,
    link.effect_applied_at,
    link.effect_payload,
    FLOOR(promo.discount_value)::INTEGER,
    COALESCE(promo.plan, 'pro')
  INTO
    promo_user_id,
    promo_effect_applied_at,
    promo_effect_payload,
    promo_days,
    promo_plan_name
  FROM public.user_promo_codes AS link
  JOIN public.promo_codes AS promo ON promo.id = link.promo_code_id
  WHERE link.id = p_promo_link_id
    AND promo.discount_type = 'free_days'
  FOR UPDATE OF link;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Promo free-days debt missing';
  END IF;
  IF promo_effect_applied_at IS NOT NULL THEN
    RETURN jsonb_build_object('applied', TRUE);
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(promo_user_id::TEXT, 824671)
  );
  IF promo_days < 1 THEN
    RAISE EXCEPTION 'Promo free-days value invalid';
  END IF;

  SELECT plan.id
  INTO promo_plan_id
  FROM public.subscription_plans AS plan
  WHERE plan.name = promo_plan_name
  LIMIT 1;
  IF promo_plan_id IS NULL THEN
    RAISE EXCEPTION 'Promo free-days plan missing';
  END IF;

  SELECT subscription.stripe_subscription_id, subscription.current_period_end
  INTO active_subscription_id, active_period_end
  FROM public.user_subscriptions AS subscription
  WHERE subscription.user_id = promo_user_id
    AND subscription.status IN ('active', 'trialing')
  ORDER BY subscription.current_period_end DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;

  IF LEFT(active_subscription_id, 4) = 'sub_' THEN
    INSERT INTO public.stripe_trial_extension_leases (
      user_id, lease_token, expires_at, updated_at
    ) VALUES (
      promo_user_id, extension_lease_token, NOW() + INTERVAL '10 minutes', NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      lease_token = EXCLUDED.lease_token,
      expires_at = EXCLUDED.expires_at,
      updated_at = NOW()
    WHERE public.stripe_trial_extension_leases.expires_at < NOW()
    RETURNING lease_token INTO extension_lease_token;
    IF extension_lease_token IS NULL THEN
      RAISE EXCEPTION 'Stripe trial extension already in progress';
    END IF;

    stored_subscription_id := promo_effect_payload->>'stripe_subscription_id';
    IF stored_subscription_id = active_subscription_id
      AND promo_effect_payload->>'stripe_trial_end' ~ '^[0-9]+$'
    THEN
      effect_trial_end := (promo_effect_payload->>'stripe_trial_end')::BIGINT;
    END IF;

    SELECT COALESCE(MAX((link.effect_payload->>'stripe_trial_end')::BIGINT), 0)
    INTO reserved_promo_end
    FROM public.user_promo_codes AS link
    WHERE link.user_id = promo_user_id
      AND link.effect_payload->>'stripe_subscription_id' = active_subscription_id
      AND link.effect_payload->>'stripe_trial_end' ~ '^[0-9]+$';

    SELECT COALESCE(MAX((reward.reward_value->>'stripe_trial_end')::BIGINT), 0)
    INTO reserved_referral_end
    FROM public.referral_rewards AS reward
    WHERE reward.referrer_id = promo_user_id
      AND reward.reward_value->>'stripe_subscription_id' = active_subscription_id
      AND reward.reward_value->>'stripe_trial_end' ~ '^[0-9]+$';

    IF effect_trial_end IS NULL THEN
      trial_base := GREATEST(
        EXTRACT(EPOCH FROM NOW())::BIGINT,
        COALESCE(EXTRACT(EPOCH FROM active_period_end)::BIGINT, 0),
        reserved_promo_end,
        reserved_referral_end
      );
      effect_trial_end := trial_base + (promo_days::BIGINT * 86400);

      UPDATE public.user_promo_codes
      SET effect_payload = effect_payload || jsonb_build_object(
        'stripe_subscription_id', active_subscription_id,
        'stripe_trial_end', effect_trial_end
      )
      WHERE id = p_promo_link_id;
    END IF;
    trial_end := GREATEST(
      effect_trial_end,
      reserved_promo_end,
      reserved_referral_end
    );

    RETURN jsonb_build_object(
      'applied', FALSE,
      'external_type', 'stripe_trial_extension',
      'subscription_id', active_subscription_id,
      'trial_end', trial_end,
      'lease_token', extension_lease_token,
      'idempotency_key', 'trial-extension:' || promo_user_id::TEXT || ':' ||
        active_subscription_id || ':' || trial_end::TEXT
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_subscriptions AS subscription
    WHERE subscription.user_id = promo_user_id
      AND subscription.status = 'past_due'
      AND LEFT(subscription.stripe_subscription_id, 4) = 'sub_'
  ) THEN
    RAISE EXCEPTION 'Promo free-days waits for payment recovery';
  END IF;

  PERFORM public.extend_subscription_days(
    promo_user_id,
    promo_days,
    promo_plan_id
  );
  UPDATE public.user_promo_codes
  SET effect_applied_at = NOW(), used_at = COALESCE(used_at, NOW())
  WHERE id = p_promo_link_id;

  RETURN jsonb_build_object('applied', TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_promo_free_days_applied(
  p_promo_link_id UUID,
  p_subscription_id TEXT,
  p_trial_end BIGINT,
  p_lease_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM 1
  FROM public.stripe_trial_extension_leases AS lease
  WHERE lease.user_id = (
      SELECT link.user_id
      FROM public.user_promo_codes AS link
      WHERE link.id = p_promo_link_id
    )
    AND lease.lease_token = p_lease_token
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  UPDATE public.user_promo_codes
  SET effect_applied_at = COALESCE(effect_applied_at, NOW()),
      used_at = COALESCE(used_at, NOW())
  WHERE id = p_promo_link_id
    AND effect_payload->>'stripe_subscription_id' = p_subscription_id
    AND effect_payload->>'stripe_trial_end' ~ '^[0-9]+$'
    AND (effect_payload->>'stripe_trial_end')::BIGINT <= p_trial_end
    AND EXISTS (
      SELECT 1
      FROM public.user_subscriptions AS subscription
      WHERE subscription.user_id = (
          SELECT link.user_id
          FROM public.user_promo_codes AS link
          WHERE link.id = p_promo_link_id
        )
        AND subscription.stripe_subscription_id = p_subscription_id
        AND subscription.status IN ('active', 'trialing')
    );
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  DELETE FROM public.stripe_trial_extension_leases
  WHERE lease_token = p_lease_token;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_stripe_checkout_completed(
  p_event_id TEXT,
  p_claim_token UUID,
  p_user_id UUID,
  p_plan_id UUID,
  p_plan_name TEXT,
  p_subscription_status TEXT,
  p_subscription_id TEXT,
  p_customer_id TEXT,
  p_price_id TEXT,
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ,
  p_cancel_at_period_end BOOLEAN,
  p_promo_link_id UUID DEFAULT NULL,
  p_checkout_session_id TEXT DEFAULT NULL,
  p_checkout_reservation_token UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  signup_id UUID;
  referral_id UUID;
  referrer_id UUID;
  reward_id UUID;
  reward_type TEXT;
  reward_value JSONB;
  referral_active BOOLEAN;
  resolved_plan_id UUID;
  promo_used_at TIMESTAMPTZ;
  subscription_was_projected BOOLEAN;
BEGIN
  PERFORM 1
  FROM public.stripe_webhook_events
  WHERE stripe_event_id = p_event_id
    AND status = 'processing'
    AND claim_token = p_claim_token
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid Stripe webhook claim';
  END IF;

  IF p_subscription_status NOT IN (
    'active', 'canceled', 'past_due', 'paused', 'trialing', 'incomplete'
  ) THEN
    RAISE EXCEPTION 'Unsupported local subscription status';
  END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL THEN
    RAISE EXCEPTION 'Stripe subscription period missing';
  END IF;

  IF p_checkout_reservation_token IS NOT NULL THEN
    SELECT snapshot.plan_id INTO resolved_plan_id
    FROM public.stripe_checkout_snapshots AS snapshot
    WHERE snapshot.user_id = p_user_id
      AND snapshot.stripe_checkout_session_id = p_checkout_session_id
      AND snapshot.reservation_token = p_checkout_reservation_token
      AND snapshot.stripe_price_id = p_price_id
    LIMIT 1;
    IF resolved_plan_id IS NULL THEN
      RAISE EXCEPTION 'Paid Stripe checkout reservation does not match snapshot';
    END IF;
  ELSE
    SELECT plan_id INTO resolved_plan_id
    FROM public.stripe_prices
    WHERE stripe_price_id = p_price_id
    LIMIT 1;
    IF resolved_plan_id IS NULL OR resolved_plan_id IS DISTINCT FROM p_plan_id THEN
      RAISE EXCEPTION 'Paid Stripe price does not match local plan';
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_subscriptions
    WHERE user_id = p_user_id
      AND stripe_subscription_id = p_subscription_id
  ) INTO subscription_was_projected;

  UPDATE public.user_subscriptions
  SET
    status = 'canceled',
    canceled_at = COALESCE(canceled_at, NOW()),
    updated_at = NOW()
  WHERE user_id = p_user_id
    AND status IN ('active', 'past_due', 'trialing')
    AND stripe_subscription_id IS DISTINCT FROM p_subscription_id;

  INSERT INTO public.user_subscriptions (
    user_id,
    plan_id,
    status,
    stripe_subscription_id,
    stripe_customer_id,
    stripe_price_id,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    updated_at
  ) VALUES (
    p_user_id,
    resolved_plan_id,
    p_subscription_status,
    p_subscription_id,
    p_customer_id,
    p_price_id,
    p_period_start,
    p_period_end,
    p_cancel_at_period_end,
    NOW()
  )
  ON CONFLICT (stripe_subscription_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    plan_id = EXCLUDED.plan_id,
    status = EXCLUDED.status,
    stripe_customer_id = EXCLUDED.stripe_customer_id,
    stripe_price_id = EXCLUDED.stripe_price_id,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    cancel_at_period_end = EXCLUDED.cancel_at_period_end,
    updated_at = NOW();

  IF p_promo_link_id IS NOT NULL THEN
    SELECT link.used_at
    INTO promo_used_at
    FROM public.user_promo_codes AS link
    WHERE link.id = p_promo_link_id
      AND link.user_id = p_user_id
    FOR UPDATE OF link;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Checkout promo reservation is missing';
    END IF;
    IF promo_used_at IS NOT NULL AND NOT subscription_was_projected THEN
      RAISE EXCEPTION 'Checkout promo was already consumed';
    END IF;
    UPDATE public.user_promo_codes
    SET used_at = NOW()
    WHERE id = p_promo_link_id
      AND user_id = p_user_id
      AND used_at IS NULL;
  END IF;

  SELECT signup.id, signup.referral_id, referral.referrer_id
  INTO signup_id, referral_id, referrer_id
  FROM public.referral_signups AS signup
  JOIN public.referrals AS referral ON referral.id = signup.referral_id
  WHERE signup.referred_user_id = p_user_id
  FOR UPDATE OF signup;

  IF signup_id IS NOT NULL THEN
    UPDATE public.referral_signups
    SET
      converted_to_paid_at = COALESCE(converted_to_paid_at, NOW()),
      converted_plan = COALESCE(converted_plan, p_plan_name)
    WHERE id = signup_id
      AND converted_to_paid_at IS NULL;
    IF FOUND THEN
      UPDATE public.referrals
      SET total_conversions = total_conversions + 1, updated_at = NOW()
      WHERE id = referral_id;
    END IF;

    SELECT
      is_active,
      conversion_reward_type,
      conversion_reward_value
    INTO referral_active, reward_type, reward_value
    FROM public.referral_config
    WHERE id = 1;

    IF referral_active IS TRUE THEN
      INSERT INTO public.referral_rewards (
        referral_signup_id,
        referrer_id,
        reward_type,
        reward_value,
        applied,
        source_key
      ) VALUES (
        signup_id,
        referrer_id,
        reward_type,
        reward_value,
        FALSE,
        'paid_conversion:' || signup_id::TEXT
      )
      ON CONFLICT (source_key) WHERE source_key IS NOT NULL
      DO UPDATE SET source_key = EXCLUDED.source_key
      RETURNING id INTO reward_id;

      INSERT INTO public.stripe_effect_outbox (
        stripe_event_id, effect_type, subject_type, subject_id, dedupe_key, payload
      ) VALUES (
        p_event_id,
        'referral_reward',
        'referral_reward',
        reward_id::TEXT,
        'referral-reward:' || reward_id::TEXT,
        jsonb_build_object('reward_id', reward_id)
      )
      ON CONFLICT (dedupe_key) DO NOTHING;
    END IF;
  END IF;

  IF p_checkout_reservation_token IS NOT NULL THEN
    DELETE FROM public.stripe_checkout_reservations
    WHERE user_id = p_user_id
      AND stripe_checkout_session_id = p_checkout_session_id;
  END IF;

  UPDATE public.stripe_webhook_events
  SET status = 'processed', processed_at = NOW(), failed_at = NULL, error_type = NULL
  WHERE stripe_event_id = p_event_id
    AND status = 'processing'
    AND claim_token = p_claim_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stripe webhook finalization failed';
  END IF;

  RETURN jsonb_build_object(
    'finalized', TRUE,
    'user_id', p_user_id,
    'reward_id', reward_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_referral_reward_record(
  p_reward_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  reward public.referral_rewards%ROWTYPE;
  applied_ok BOOLEAN;
  reward_plan_id UUID;
  stripe_subscription_id TEXT;
  projected_period_end TIMESTAMPTZ;
  reward_days INTEGER;
  stripe_trial_end BIGINT;
  latest_reserved_trial_end BIGINT;
  latest_reserved_promo_end BIGINT;
  stored_subscription_id TEXT;
  effect_trial_end BIGINT;
  extension_lease_token UUID := gen_random_uuid();
BEGIN
  SELECT * INTO reward
  FROM public.referral_rewards
  WHERE id = p_reward_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Referral reward not found';
  END IF;
  IF reward.applied THEN
    RETURN jsonb_build_object('applied', TRUE, 'replay', TRUE);
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(reward.referrer_id::TEXT, 824671)
  );
  IF reward.reward_type = 'stripe_coupon' THEN
    RETURN jsonb_build_object(
      'applied', FALSE,
      'requires_external', TRUE,
      'external_type', 'stripe_coupon'
    );
  ELSIF reward.reward_type = 'free_days' THEN
    SELECT subscription.stripe_subscription_id, subscription.current_period_end
    INTO stripe_subscription_id, projected_period_end
    FROM public.user_subscriptions AS subscription
    WHERE subscription.user_id = reward.referrer_id
      AND subscription.status IN ('active', 'trialing')
    ORDER BY subscription.updated_at DESC
    LIMIT 1
    FOR UPDATE;
    IF stripe_subscription_id LIKE 'sub\_%' ESCAPE '\' THEN
      INSERT INTO public.stripe_trial_extension_leases (
        user_id, lease_token, expires_at, updated_at
      ) VALUES (
        reward.referrer_id,
        extension_lease_token,
        NOW() + INTERVAL '10 minutes',
        NOW()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        lease_token = EXCLUDED.lease_token,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
      WHERE public.stripe_trial_extension_leases.expires_at < NOW()
      RETURNING lease_token INTO extension_lease_token;
      IF extension_lease_token IS NULL THEN
        RAISE EXCEPTION 'Stripe trial extension already in progress';
      END IF;

      reward_days := COALESCE(
        (reward.reward_value->>'days')::INTEGER,
        (reward.reward_value->>'reward_value')::INTEGER,
        7
      );
      stored_subscription_id := reward.reward_value->>'stripe_subscription_id';
      IF stored_subscription_id = stripe_subscription_id
        AND reward.reward_value->>'stripe_trial_end' ~ '^[0-9]+$'
      THEN
        effect_trial_end := (reward.reward_value->>'stripe_trial_end')::BIGINT;
      END IF;
      IF effect_trial_end IS NULL THEN
        SELECT MAX((existing.reward_value->>'stripe_trial_end')::BIGINT)
        INTO latest_reserved_trial_end
        FROM public.referral_rewards AS existing
        WHERE existing.referrer_id = reward.referrer_id
          AND existing.reward_type = 'free_days'
          AND existing.reward_value->>'stripe_subscription_id' = stripe_subscription_id
          AND existing.reward_value ? 'stripe_trial_end';
        SELECT MAX((link.effect_payload->>'stripe_trial_end')::BIGINT)
        INTO latest_reserved_promo_end
        FROM public.user_promo_codes AS link
        WHERE link.user_id = reward.referrer_id
          AND link.effect_payload->>'stripe_subscription_id' = stripe_subscription_id
          AND link.effect_payload->>'stripe_trial_end' ~ '^[0-9]+$';
        effect_trial_end := EXTRACT(
          EPOCH FROM GREATEST(
            COALESCE(projected_period_end, NOW()),
            NOW(),
            COALESCE(to_timestamp(latest_reserved_trial_end), NOW()),
            COALESCE(to_timestamp(latest_reserved_promo_end), NOW())
          )
            + make_interval(days => reward_days)
        )::BIGINT;
        UPDATE public.referral_rewards
        SET reward_value = reward_value || jsonb_build_object(
          'stripe_subscription_id', stripe_subscription_id,
          'stripe_trial_end', effect_trial_end
        )
        WHERE id = p_reward_id;
      END IF;
      SELECT MAX((existing.reward_value->>'stripe_trial_end')::BIGINT)
      INTO latest_reserved_trial_end
      FROM public.referral_rewards AS existing
      WHERE existing.referrer_id = reward.referrer_id
        AND existing.reward_type = 'free_days'
        AND existing.reward_value->>'stripe_subscription_id' = stripe_subscription_id
        AND existing.reward_value->>'stripe_trial_end' ~ '^[0-9]+$';
      SELECT MAX((link.effect_payload->>'stripe_trial_end')::BIGINT)
      INTO latest_reserved_promo_end
      FROM public.user_promo_codes AS link
      WHERE link.user_id = reward.referrer_id
        AND link.effect_payload->>'stripe_subscription_id' = stripe_subscription_id
        AND link.effect_payload->>'stripe_trial_end' ~ '^[0-9]+$';
      stripe_trial_end := GREATEST(
        effect_trial_end,
        COALESCE(latest_reserved_trial_end, 0),
        COALESCE(latest_reserved_promo_end, 0)
      );
      RETURN jsonb_build_object(
        'applied', FALSE,
        'requires_external', TRUE,
        'external_type', 'stripe_trial_extension',
        'subscription_id', stripe_subscription_id,
        'trial_end', stripe_trial_end,
        'lease_token', extension_lease_token,
        'idempotency_key', 'trial-extension:' || reward.referrer_id::TEXT || ':' ||
          stripe_subscription_id || ':' || stripe_trial_end::TEXT
      );
    END IF;
    SELECT id INTO reward_plan_id
    FROM public.subscription_plans
    WHERE name = COALESCE(reward.reward_value->>'reward_plan', 'pro')
    LIMIT 1;
    IF reward_plan_id IS NULL THEN
      RAISE EXCEPTION 'Referral reward plan not found';
    END IF;
    applied_ok := public.extend_subscription_days(
      reward.referrer_id,
      COALESCE(
        (reward.reward_value->>'days')::INTEGER,
        (reward.reward_value->>'reward_value')::INTEGER,
        7
      ),
      reward_plan_id
    );
  ELSIF reward.reward_type = 'quota_bonus' THEN
    applied_ok := public.apply_quota_bonus(
      reward.referrer_id,
      COALESCE((reward.reward_value->>'cv_analyses')::INTEGER, 0),
      COALESCE((reward.reward_value->>'coach_seconds')::INTEGER, 0),
      COALESCE((reward.reward_value->>'job_searches')::INTEGER, 0)
    );
  ELSE
    RAISE EXCEPTION 'Unsupported referral reward type';
  END IF;

  IF applied_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'Referral reward application failed';
  END IF;

  UPDATE public.referral_rewards
  SET applied = TRUE, applied_at = NOW()
  WHERE id = p_reward_id;

  RETURN jsonb_build_object('applied', TRUE, 'replay', FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_referral_trial_extension_applied(
  p_reward_id UUID,
  p_subscription_id TEXT,
  p_trial_end BIGINT,
  p_lease_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  reward_user_id UUID;
BEGIN
  SELECT referrer_id INTO reward_user_id
  FROM public.referral_rewards
  WHERE id = p_reward_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  PERFORM 1
  FROM public.stripe_trial_extension_leases
  WHERE user_id = reward_user_id
    AND lease_token = p_lease_token
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  UPDATE public.referral_rewards
  SET applied = TRUE, applied_at = COALESCE(applied_at, NOW())
  WHERE id = p_reward_id
    AND reward_value->>'stripe_subscription_id' = p_subscription_id
    AND reward_value->>'stripe_trial_end' ~ '^[0-9]+$'
    AND (reward_value->>'stripe_trial_end')::BIGINT <= p_trial_end
    AND EXISTS (
      SELECT 1
      FROM public.user_subscriptions AS subscription
      WHERE subscription.user_id = reward_user_id
        AND subscription.stripe_subscription_id = p_subscription_id
        AND subscription.status IN ('active', 'trialing')
    );
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  DELETE FROM public.stripe_trial_extension_leases
  WHERE user_id = reward_user_id
    AND lease_token = p_lease_token;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_referral_reward(
  p_referral_signup_id UUID,
  p_referrer_id UUID,
  p_reward_type TEXT,
  p_reward_value JSONB,
  p_source_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  reward_id UUID;
  reward_applied BOOLEAN;
  reward_created BOOLEAN := FALSE;
BEGIN
  IF p_reward_type NOT IN ('free_days', 'quota_bonus', 'stripe_coupon') THEN
    RAISE EXCEPTION 'Unsupported referral reward type';
  END IF;
  IF p_source_key IS NULL OR LENGTH(p_source_key) < 3 THEN
    RAISE EXCEPTION 'Referral reward source key missing';
  END IF;

  INSERT INTO public.referral_rewards (
    referral_signup_id,
    referrer_id,
    reward_type,
    reward_value,
    applied,
    source_key
  ) VALUES (
    p_referral_signup_id,
    p_referrer_id,
    p_reward_type,
    p_reward_value,
    FALSE,
    p_source_key
  )
  ON CONFLICT (source_key) WHERE source_key IS NOT NULL DO NOTHING
  RETURNING id, applied INTO reward_id, reward_applied;

  IF reward_id IS NOT NULL THEN
    reward_created := TRUE;
  ELSE
    SELECT id, applied INTO reward_id, reward_applied
    FROM public.referral_rewards
    WHERE source_key = p_source_key
    FOR UPDATE;
  END IF;
  IF reward_id IS NULL THEN
    RAISE EXCEPTION 'Referral reward enqueue failed';
  END IF;

  IF reward_applied IS DISTINCT FROM TRUE THEN
    INSERT INTO public.stripe_effect_outbox (
      stripe_event_id, effect_type, subject_type, subject_id, dedupe_key, payload
    ) VALUES (
      'referral-reward:' || p_source_key,
      'referral_reward',
      'referral_reward',
      reward_id::TEXT,
      'referral-reward:' || reward_id::TEXT,
      jsonb_build_object('reward_id', reward_id)
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'reward_id', reward_id,
    'created', reward_created,
    'applied', reward_applied
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_stripe_invoice_paid(
  p_event_id TEXT,
  p_claim_token UUID,
  p_subscription_id TEXT,
  p_subscription_status TEXT,
  p_invoice_id TEXT,
  p_customer_id TEXT,
  p_billing_reason TEXT,
  p_amount_paid NUMERIC,
  p_currency TEXT,
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ,
  p_interval TEXT DEFAULT NULL,
  p_interval_count INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  projected_user_id UUID;
BEGIN
  PERFORM 1
  FROM public.stripe_webhook_events
  WHERE stripe_event_id = p_event_id
    AND status = 'processing'
    AND claim_token = p_claim_token
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid Stripe webhook claim';
  END IF;

  IF p_subscription_id IS NOT NULL THEN
    IF p_period_start IS NULL OR p_period_end IS NULL THEN
      RAISE EXCEPTION 'Stripe subscription period missing';
    END IF;
    IF p_subscription_status NOT IN (
      'active', 'canceled', 'past_due', 'paused', 'trialing', 'incomplete'
    ) THEN
      RAISE EXCEPTION 'Unsupported local subscription status';
    END IF;

    UPDATE public.user_subscriptions
    SET
      current_period_start = p_period_start,
      current_period_end = p_period_end,
      status = p_subscription_status,
      updated_at = NOW()
    WHERE stripe_subscription_id = p_subscription_id
    RETURNING user_id INTO projected_user_id;
    IF projected_user_id IS NULL THEN
      RAISE EXCEPTION 'Stripe subscription missing from local projection';
    END IF;
  END IF;

  INSERT INTO public.stripe_payments (
    stripe_invoice_id,
    user_id,
    stripe_customer_id,
    stripe_subscription_id,
    billing_reason,
    amount_paid,
    currency,
    interval,
    interval_count,
    period_start,
    period_end
  ) VALUES (
    p_invoice_id,
    projected_user_id,
    p_customer_id,
    p_subscription_id,
    p_billing_reason,
    p_amount_paid,
    UPPER(p_currency),
    p_interval,
    p_interval_count,
    p_period_start,
    p_period_end
  )
  ON CONFLICT (stripe_invoice_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    stripe_customer_id = EXCLUDED.stripe_customer_id,
    stripe_subscription_id = EXCLUDED.stripe_subscription_id,
    billing_reason = EXCLUDED.billing_reason,
    amount_paid = EXCLUDED.amount_paid,
    currency = EXCLUDED.currency,
    interval = EXCLUDED.interval,
    interval_count = EXCLUDED.interval_count,
    period_start = EXCLUDED.period_start,
    period_end = EXCLUDED.period_end;

  IF p_amount_paid > 0 THEN
    INSERT INTO public.stripe_effect_outbox (
      stripe_event_id, effect_type, subject_type, subject_id, dedupe_key, payload
    ) VALUES
      (
        p_event_id,
        'payment_confirmation_client',
        'invoice',
        p_invoice_id,
        'payment-confirmation-client:' || p_invoice_id,
        jsonb_build_object('invoice_id', p_invoice_id)
      ),
      (
        p_event_id,
        'payment_received_admin',
        'invoice',
        p_invoice_id,
        'payment-received-admin:' || p_invoice_id,
        jsonb_build_object('invoice_id', p_invoice_id)
      )
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;

  UPDATE public.stripe_webhook_events
  SET status = 'processed', processed_at = NOW(), failed_at = NULL, error_type = NULL
  WHERE stripe_event_id = p_event_id
    AND status = 'processing'
    AND claim_token = p_claim_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stripe webhook finalization failed';
  END IF;

  RETURN jsonb_build_object('finalized', TRUE, 'user_id', projected_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_stripe_payment_failed(
  p_event_id TEXT,
  p_claim_token UUID,
  p_subscription_id TEXT,
  p_invoice_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  projected_user_id UUID;
  previous_status TEXT;
  should_notify BOOLEAN := TRUE;
BEGIN
  PERFORM 1
  FROM public.stripe_webhook_events
  WHERE stripe_event_id = p_event_id
    AND status = 'processing'
    AND claim_token = p_claim_token
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid Stripe webhook claim';
  END IF;

  IF p_subscription_id IS NOT NULL THEN
    SELECT user_id, status
    INTO projected_user_id, previous_status
    FROM public.user_subscriptions
    WHERE stripe_subscription_id = p_subscription_id
    FOR UPDATE;
    IF projected_user_id IS NULL THEN
      RAISE EXCEPTION 'Stripe subscription missing from local projection';
    END IF;

    UPDATE public.user_subscriptions
    SET status = 'past_due', updated_at = NOW()
    WHERE stripe_subscription_id = p_subscription_id;

    should_notify := previous_status IS DISTINCT FROM 'past_due';
  END IF;

  IF should_notify THEN
    IF projected_user_id IS NOT NULL THEN
    INSERT INTO public.user_notifications (user_id, type, title, body, data)
    VALUES (
      projected_user_id,
      'payment_failed',
      'Paiement échoué',
      'Votre paiement a échoué. Veuillez mettre à jour votre moyen de paiement pour conserver votre abonnement.',
      jsonb_build_object('invoice_id', p_invoice_id)
    );
    END IF;

    INSERT INTO public.stripe_effect_outbox (
      stripe_event_id, effect_type, subject_type, subject_id, dedupe_key, payload
    ) VALUES
      (
        p_event_id,
        'payment_failed_client',
        'invoice',
        p_invoice_id,
        'payment-failed-client:' || p_invoice_id,
        jsonb_build_object('invoice_id', p_invoice_id)
      ),
      (
        p_event_id,
        'payment_failed_admin',
        'invoice',
        p_invoice_id,
        'payment-failed-admin:' || p_invoice_id,
        jsonb_build_object('invoice_id', p_invoice_id)
      )
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;

  UPDATE public.stripe_webhook_events
  SET status = 'processed', processed_at = NOW(), failed_at = NULL, error_type = NULL
  WHERE stripe_event_id = p_event_id
    AND status = 'processing'
    AND claim_token = p_claim_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stripe webhook finalization failed';
  END IF;

  RETURN jsonb_build_object(
    'finalized', TRUE,
    'user_id', projected_user_id,
    'transitioned', should_notify
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_stripe_subscription_deleted(
  p_event_id TEXT,
  p_claim_token UUID,
  p_subscription_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  projected_user_id UUID;
  projected_plan_id UUID;
  projected_period_end TIMESTAMPTZ;
  effective_period_end TIMESTAMPTZ;
  client_cancellation_dedupe_key TEXT;
BEGIN
  PERFORM 1
  FROM public.stripe_webhook_events
  WHERE stripe_event_id = p_event_id
    AND status = 'processing'
    AND claim_token = p_claim_token
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid Stripe webhook claim';
  END IF;

  UPDATE public.user_subscriptions
  SET status = 'canceled', canceled_at = NOW(), updated_at = NOW()
  WHERE stripe_subscription_id = p_subscription_id
  RETURNING user_id, plan_id, current_period_end
  INTO projected_user_id, projected_plan_id, projected_period_end;
  IF projected_user_id IS NULL THEN
    RAISE EXCEPTION 'Stripe subscription missing from local projection';
  END IF;
  effective_period_end := LEAST(COALESCE(projected_period_end, NOW()), NOW());

  SELECT effect.dedupe_key
  INTO client_cancellation_dedupe_key
  FROM public.stripe_effect_outbox AS effect
  WHERE effect.effect_type = 'subscription_cancelled_client'
    AND effect.subject_id = p_subscription_id
    AND effect.status IN ('pending', 'processing', 'succeeded')
    AND (effect.payload->>'period_end')::TIMESTAMPTZ = projected_period_end
  ORDER BY effect.created_at DESC
  LIMIT 1;
  client_cancellation_dedupe_key := COALESCE(
    client_cancellation_dedupe_key,
    'subscription-cancelled-client:' || p_event_id
  );

  INSERT INTO public.stripe_effect_outbox (
    stripe_event_id, effect_type, subject_type, subject_id, dedupe_key, payload
  ) VALUES
    (
      p_event_id,
      'subscription_cancelled_client',
      'subscription',
      p_subscription_id,
      client_cancellation_dedupe_key,
      jsonb_build_object(
        'subscription_id', p_subscription_id,
        'plan_id', projected_plan_id,
        'period_end', effective_period_end,
        'cancellation_mode', 'deleted'
      )
    ),
    (
      p_event_id,
      'subscription_cancelled_admin',
      'subscription',
      p_subscription_id,
      'subscription-cancelled-admin:' || p_event_id,
      jsonb_build_object(
        'subscription_id', p_subscription_id,
        'plan_id', projected_plan_id,
        'period_end', effective_period_end,
        'cancellation_mode', 'deleted'
      )
    )
  ON CONFLICT (dedupe_key) DO NOTHING;

  UPDATE public.stripe_webhook_events
  SET status = 'processed', processed_at = NOW(), failed_at = NULL, error_type = NULL
  WHERE stripe_event_id = p_event_id
    AND status = 'processing'
    AND claim_token = p_claim_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stripe webhook finalization failed';
  END IF;

  RETURN jsonb_build_object('finalized', TRUE, 'user_id', projected_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_stripe_subscription_updated(
  p_event_id TEXT,
  p_claim_token UUID,
  p_subscription_id TEXT,
  p_status TEXT,
  p_price_id TEXT,
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ,
  p_cancel_at_period_end BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  projected_user_id UUID;
  projected_plan_id UUID;
  previous_cancel_at_period_end BOOLEAN;
  resolved_plan_id UUID;
BEGIN
  PERFORM 1
  FROM public.stripe_webhook_events
  WHERE stripe_event_id = p_event_id
    AND status = 'processing'
    AND claim_token = p_claim_token
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid Stripe webhook claim';
  END IF;

  SELECT user_id, plan_id, cancel_at_period_end
  INTO projected_user_id, projected_plan_id, previous_cancel_at_period_end
  FROM public.user_subscriptions
  WHERE stripe_subscription_id = p_subscription_id
  FOR UPDATE;
  IF projected_user_id IS NULL THEN
    RAISE EXCEPTION 'Stripe subscription missing from local projection';
  END IF;

  SELECT plan_id INTO resolved_plan_id
  FROM public.stripe_prices
  WHERE stripe_price_id = p_price_id
  LIMIT 1;
  IF resolved_plan_id IS NULL THEN
    RAISE EXCEPTION 'Stripe price missing from local plan configuration';
  END IF;
  IF p_status NOT IN (
    'active', 'canceled', 'past_due', 'paused', 'trialing', 'incomplete'
  ) THEN
    RAISE EXCEPTION 'Unsupported local subscription status';
  END IF;

  UPDATE public.user_subscriptions
  SET
    status = p_status,
    stripe_price_id = p_price_id,
    plan_id = resolved_plan_id,
    current_period_start = p_period_start,
    current_period_end = p_period_end,
    cancel_at_period_end = p_cancel_at_period_end,
    updated_at = NOW()
  WHERE stripe_subscription_id = p_subscription_id;

  projected_plan_id := resolved_plan_id;

  IF NOT p_cancel_at_period_end
    AND previous_cancel_at_period_end IS TRUE
  THEN
    UPDATE public.stripe_effect_outbox
    SET
      status = 'superseded',
      completed_at = NOW(),
      last_error_type = 'CancellationReactivated',
      updated_at = NOW()
    WHERE effect_type = 'subscription_cancelled_client'
      AND subject_id = p_subscription_id
      AND status = 'pending';
  END IF;

  IF p_cancel_at_period_end
    AND previous_cancel_at_period_end IS DISTINCT FROM TRUE
  THEN
    INSERT INTO public.stripe_effect_outbox (
      stripe_event_id, effect_type, subject_type, subject_id, dedupe_key, payload
    ) VALUES (
      p_event_id,
      'subscription_cancelled_client',
      'subscription',
      p_subscription_id,
      'subscription-cancelled-client:' || p_event_id,
      jsonb_build_object(
        'subscription_id', p_subscription_id,
        'plan_id', projected_plan_id,
        'period_end', p_period_end,
        'cancellation_mode', 'scheduled'
      )
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;

  UPDATE public.stripe_webhook_events
  SET status = 'processed', processed_at = NOW(), failed_at = NULL, error_type = NULL
  WHERE stripe_event_id = p_event_id
    AND status = 'processing'
    AND claim_token = p_claim_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stripe webhook finalization failed';
  END IF;

  RETURN jsonb_build_object('finalized', TRUE, 'user_id', projected_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_stripe_recruiter_checkout(
  p_event_id TEXT,
  p_claim_token UUID,
  p_request_id UUID,
  p_payment_intent_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  request_exists BOOLEAN;
  current_payment_status TEXT;
  current_payment_intent_id TEXT;
BEGIN
  PERFORM 1
  FROM public.stripe_webhook_events
  WHERE stripe_event_id = p_event_id
    AND status = 'processing'
    AND claim_token = p_claim_token
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid Stripe webhook claim';
  END IF;

  SELECT TRUE, payment_status, payment_intent_id
  INTO request_exists, current_payment_status, current_payment_intent_id
  FROM public.recruiter_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF request_exists IS NOT TRUE THEN
    RAISE EXCEPTION 'Recruiter request not found';
  END IF;

  IF current_payment_status = 'paid'
    AND current_payment_intent_id IS DISTINCT FROM p_payment_intent_id
  THEN
    RAISE EXCEPTION 'Duplicate recruiter payment detected';
  END IF;

  IF current_payment_status IS DISTINCT FROM 'paid' THEN
    UPDATE public.recruiter_requests
    SET payment_status = 'paid', payment_intent_id = p_payment_intent_id
    WHERE id = p_request_id;
  END IF;

  INSERT INTO public.stripe_effect_outbox (
    stripe_event_id, effect_type, subject_type, subject_id, dedupe_key, payload
  ) VALUES
    (
      p_event_id,
      'recruiter_paid_client',
      'recruiter_request',
      p_request_id::TEXT,
      'recruiter-paid-client:' || p_request_id::TEXT,
      jsonb_build_object('request_id', p_request_id)
    ),
    (
      p_event_id,
      'recruiter_paid_admin',
      'recruiter_request',
      p_request_id::TEXT,
      'recruiter-paid-admin:' || p_request_id::TEXT,
      jsonb_build_object('request_id', p_request_id)
    )
  ON CONFLICT (dedupe_key) DO NOTHING;

  UPDATE public.stripe_webhook_events
  SET status = 'processed', processed_at = NOW(), failed_at = NULL, error_type = NULL
  WHERE stripe_event_id = p_event_id
    AND status = 'processing'
    AND claim_token = p_claim_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stripe webhook finalization failed';
  END IF;

  RETURN jsonb_build_object('finalized', TRUE, 'request_id', p_request_id);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_stripe_effects(INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_stripe_effect_succeeded(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retry_stripe_effect(UUID, UUID, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.requeue_dead_stripe_effect(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_subscription_checkout(UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_subscription_checkout(
  UUID, UUID, TEXT, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_subscription_checkout(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invalidate_subscription_checkout(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_promo_code(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepare_promo_free_days(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_promo_free_days_applied(
  UUID, TEXT, BIGINT, UUID
)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_referral_trial_extension_applied(
  UUID, TEXT, BIGINT, UUID
)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_stripe_checkout_completed(
  TEXT, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT,
  TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN, UUID, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_referral_reward_record(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_referral_reward(UUID, UUID, TEXT, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_stripe_invoice_paid(
  TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT,
  TIMESTAMPTZ, TIMESTAMPTZ, TEXT, INTEGER
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_stripe_payment_failed(TEXT, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_stripe_subscription_deleted(TEXT, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_stripe_subscription_updated(
  TEXT, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_stripe_recruiter_checkout(TEXT, UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_stripe_effects(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_stripe_effect_succeeded(UUID, UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.retry_stripe_effect(UUID, UUID, TEXT, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.requeue_dead_stripe_effect(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_subscription_checkout(UUID, TEXT, TEXT, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_subscription_checkout(
  UUID, UUID, TEXT, TIMESTAMPTZ
) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_subscription_checkout(UUID, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.invalidate_subscription_checkout(UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_promo_code(UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.prepare_promo_free_days(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_promo_free_days_applied(
  UUID, TEXT, BIGINT, UUID
)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_referral_trial_extension_applied(
  UUID, TEXT, BIGINT, UUID
)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_stripe_checkout_completed(
  TEXT, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT,
  TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN, UUID, TEXT, UUID
) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_referral_reward_record(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_referral_reward(UUID, UUID, TEXT, JSONB, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_stripe_invoice_paid(
  TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT,
  TIMESTAMPTZ, TIMESTAMPTZ, TEXT, INTEGER
) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_stripe_payment_failed(TEXT, UUID, TEXT, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_stripe_subscription_deleted(TEXT, UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_stripe_subscription_updated(
  TEXT, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN
) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_stripe_recruiter_checkout(TEXT, UUID, UUID, TEXT)
  TO service_role;

-- Les fonctions historiques de récompense sont SECURITY DEFINER. Un GRANT au
-- service_role ne retire pas l'EXECUTE accordé implicitement à PUBLIC lors de
-- leur création : verrouiller toutes les signatures encore présentes.
DO $$
DECLARE
  function_signature TEXT;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.extend_subscription_days(uuid,integer)',
    'public.extend_subscription_days(uuid,integer,uuid)',
    'public.apply_quota_bonus(uuid,integer,integer,integer)',
    'public.insert_tier_reward(uuid,uuid,text,jsonb)'
  ]
  LOOP
    IF to_regprocedure(function_signature) IS NOT NULL THEN
      EXECUTE format(
        'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',
        function_signature
      );
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %s TO service_role',
        function_signature
      );
    END IF;
  END LOOP;
END;
$$;

COMMENT ON TABLE public.stripe_effect_outbox IS
  'Effets Stripe externes durables, sans PII, réclamés par token et dédupliqués.';

-- Rollback manuel :
-- 1. Désactiver producteurs et worker, puis exporter les lignes pending/dead.
-- 2. DROP FUNCTION apply_stripe_* et les fonctions de claim/retry ci-dessus.
-- 3. DROP TABLE public.stripe_effect_outbox uniquement après vidage complet.
