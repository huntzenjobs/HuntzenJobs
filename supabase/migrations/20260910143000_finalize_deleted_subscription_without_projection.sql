-- Un événement customer.subscription.deleted historique peut arriver après que
-- sa projection locale a déjà été archivée. Ce cas est terminal : il ne doit
-- ni annuler un abonnement de remplacement, ni provoquer des retries Stripe.

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
    INSERT INTO public.stripe_effect_outbox (
      stripe_event_id, effect_type, subject_type, subject_id, dedupe_key, payload
    ) VALUES (
      p_event_id,
      'subscription_cancelled_admin',
      'subscription',
      p_subscription_id,
      'subscription-cancelled-admin:' || p_event_id,
      jsonb_build_object(
        'subscription_id', p_subscription_id,
        'cancellation_mode', 'deleted',
        'projection_missing', TRUE
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

    RETURN jsonb_build_object(
      'finalized', TRUE,
      'user_id', NULL,
      'projection_missing', TRUE
    );
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

REVOKE ALL ON FUNCTION public.apply_stripe_subscription_deleted(TEXT, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_stripe_subscription_deleted(TEXT, UUID, TEXT)
  TO service_role;
