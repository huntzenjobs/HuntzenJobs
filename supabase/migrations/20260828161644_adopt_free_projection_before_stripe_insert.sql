-- Complète la surcharge créée dans la migration précédente : les comptes
-- nouvellement inscrits possèdent déjà une projection Free active. Cette
-- ligne doit être promue, sous verrou, au lieu de créer un doublon actif.
CREATE OR REPLACE FUNCTION public.apply_stripe_subscription_updated(
  p_event_id TEXT,
  p_claim_token UUID,
  p_subscription_id TEXT,
  p_user_id UUID,
  p_customer_id TEXT,
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

  IF NULLIF(BTRIM(p_subscription_id), '') IS NULL THEN
    RAISE EXCEPTION 'Stripe subscription ID missing';
  END IF;
  IF NULLIF(BTRIM(p_price_id), '') IS NULL THEN
    RAISE EXCEPTION 'Stripe price ID missing';
  END IF;
  IF p_period_start IS NULL
    OR p_period_end IS NULL
    OR p_period_end <= p_period_start
  THEN
    RAISE EXCEPTION 'Invalid Stripe subscription period';
  END IF;
  IF p_status NOT IN (
    'active', 'canceled', 'past_due', 'paused', 'trialing', 'incomplete'
  ) THEN
    RAISE EXCEPTION 'Unsupported local subscription status';
  END IF;

  SELECT price.plan_id INTO resolved_plan_id
  FROM public.stripe_prices AS price
  WHERE price.stripe_price_id = p_price_id
  LIMIT 1;
  IF resolved_plan_id IS NULL THEN
    RAISE EXCEPTION 'Stripe price missing from local plan configuration';
  END IF;

  SELECT subscription.user_id,
         subscription.plan_id,
         subscription.cancel_at_period_end
  INTO projected_user_id,
       projected_plan_id,
       previous_cancel_at_period_end
  FROM public.user_subscriptions AS subscription
  WHERE subscription.stripe_subscription_id = p_subscription_id
  FOR UPDATE;

  IF projected_user_id IS NULL THEN
    IF p_user_id IS NULL THEN
      RAISE EXCEPTION 'Stripe subscription user metadata missing';
    END IF;

    PERFORM 1
    FROM auth.users AS auth_user
    WHERE auth_user.id = p_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Stripe subscription user does not exist';
    END IF;

    UPDATE public.user_subscriptions AS free_subscription
    SET
      plan_id = resolved_plan_id,
      status = p_status,
      current_period_start = p_period_start,
      current_period_end = p_period_end,
      cancel_at_period_end = p_cancel_at_period_end,
      stripe_subscription_id = p_subscription_id,
      stripe_customer_id = NULLIF(BTRIM(p_customer_id), ''),
      stripe_price_id = p_price_id,
      metadata = COALESCE(free_subscription.metadata, '{}'::JSONB)
        || jsonb_build_object(
          'projection_source',
          'stripe_subscription_updated'
        ),
      updated_at = NOW()
    FROM public.subscription_plans AS free_plan
    WHERE free_subscription.user_id = p_user_id
      AND free_subscription.plan_id = free_plan.id
      AND free_plan.name = 'free'
      AND free_subscription.status = 'active'
      AND free_subscription.stripe_subscription_id IS NULL
    RETURNING
      free_subscription.user_id,
      free_subscription.plan_id,
      FALSE
    INTO
      projected_user_id,
      projected_plan_id,
      previous_cancel_at_period_end;

    IF projected_user_id IS NULL THEN
      IF p_status IN ('active', 'past_due', 'paused', 'trialing', 'incomplete') THEN
        PERFORM 1
        FROM public.user_subscriptions AS current_subscription
        WHERE current_subscription.user_id = p_user_id
          AND current_subscription.status IN (
            'active', 'past_due', 'paused', 'trialing', 'incomplete'
          )
          AND current_subscription.stripe_subscription_id IS DISTINCT FROM
              p_subscription_id
        FOR UPDATE;
        IF FOUND THEN
          RAISE EXCEPTION 'User already has another current subscription';
        END IF;
      END IF;

      INSERT INTO public.user_subscriptions (
        user_id,
        plan_id,
        status,
        current_period_start,
        current_period_end,
        cancel_at_period_end,
        stripe_subscription_id,
        stripe_customer_id,
        stripe_price_id,
        metadata,
        updated_at
      ) VALUES (
        p_user_id,
        resolved_plan_id,
        p_status,
        p_period_start,
        p_period_end,
        p_cancel_at_period_end,
        p_subscription_id,
        NULLIF(BTRIM(p_customer_id), ''),
        p_price_id,
        jsonb_build_object('projection_source', 'stripe_subscription_updated'),
        NOW()
      )
      RETURNING user_id, plan_id, cancel_at_period_end
      INTO projected_user_id, projected_plan_id, previous_cancel_at_period_end;
    END IF;
  ELSE
    IF p_user_id IS NOT NULL AND projected_user_id <> p_user_id THEN
      RAISE EXCEPTION 'Stripe subscription user metadata mismatch';
    END IF;

    UPDATE public.user_subscriptions
    SET
      status = p_status,
      stripe_customer_id = COALESCE(
        NULLIF(BTRIM(p_customer_id), ''),
        stripe_customer_id
      ),
      stripe_price_id = p_price_id,
      plan_id = resolved_plan_id,
      current_period_start = p_period_start,
      current_period_end = p_period_end,
      cancel_at_period_end = p_cancel_at_period_end,
      updated_at = NOW()
    WHERE stripe_subscription_id = p_subscription_id;
    projected_plan_id := resolved_plan_id;
  END IF;

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
      stripe_event_id,
      effect_type,
      subject_type,
      subject_id,
      dedupe_key,
      payload
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
  SET
    status = 'processed',
    processed_at = NOW(),
    failed_at = NULL,
    error_type = NULL
  WHERE stripe_event_id = p_event_id
    AND status = 'processing'
    AND claim_token = p_claim_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stripe webhook finalization failed';
  END IF;

  RETURN jsonb_build_object('finalized', TRUE, 'user_id', projected_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_stripe_subscription_updated(
  TEXT, UUID, TEXT, UUID, TEXT, TEXT, TEXT,
  TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_stripe_subscription_updated(
  TEXT, UUID, TEXT, UUID, TEXT, TEXT, TEXT,
  TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN
) TO service_role;
