CREATE UNIQUE INDEX idx_user_notifications_payment_failed_invoice_unique
  ON public.user_notifications (user_id, ((data->>'invoice_id')))
  WHERE type = 'payment_failed' AND data ? 'invoice_id';

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
  transitioned BOOLEAN := FALSE;
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

    transitioned := previous_status IS DISTINCT FROM 'past_due';
  END IF;

  IF projected_user_id IS NOT NULL THEN
    INSERT INTO public.user_notifications (user_id, type, title, body, data)
    VALUES (
      projected_user_id,
      'payment_failed',
      'Paiement échoué',
      'Votre paiement a échoué. Veuillez mettre à jour votre moyen de paiement pour conserver votre abonnement.',
      jsonb_build_object('invoice_id', p_invoice_id)
    )
    ON CONFLICT DO NOTHING;
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
    'transitioned', transitioned
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_stripe_payment_failed(TEXT, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_stripe_payment_failed(TEXT, UUID, TEXT, TEXT)
  TO service_role;
