-- La production historique ne possédait pas encore cette colonne, alors que
-- le staging l'utilise déjà pour tracer la provenance des projections.
-- L'ajout idempotent aligne les deux schémas avant de recréer une projection.
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB;

-- Aligne la projection locale sur les statuts Stripe réellement traités.
-- L'état "expired" est conservé pour l'historique local existant.
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT constraint_row.conname
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS relation ON relation.oid = constraint_row.conrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'user_subscriptions'
      AND constraint_row.contype = 'c'
      AND pg_get_constraintdef(constraint_row.oid) ILIKE '%status%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.user_subscriptions DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END;
$$;

ALTER TABLE public.user_subscriptions
  ADD CONSTRAINT user_subscriptions_status_check
  CHECK (status IN (
    'active', 'canceled', 'expired', 'past_due',
    'paused', 'trialing', 'incomplete'
  ));

-- Nouvelle surcharge : si Stripe connaît un abonnement encore absent de la
-- projection, l'événement "subscription.updated" peut désormais le recréer
-- atomiquement à partir du user_id signé dans les métadonnées Checkout.
-- L'ancienne signature reste disponible pendant le déploiement progressif.
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

-- Réconciliation ciblée de l'instantané Stripe live contrôlé le 28 août 2026.
-- Ces identifiants n'existent pas dans le projet staging : ce bloc y est un no-op.
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
)
SELECT
  '110e573d-c5aa-49a3-bfb4-ba407a7d5946'::UUID,
  'd18ddf08-784d-471c-b2d7-7586b4e5472c'::UUID,
  'active',
  '2026-08-20T20:52:05Z'::TIMESTAMPTZ,
  '2026-09-20T20:52:05Z'::TIMESTAMPTZ,
  TRUE,
  'sub_1TOOnbDGN9N43CzqEcFGfNPn',
  'cus_UN95Wv3Z9KkJtY',
  'price_1TDzXyDGN9N43CzqXqZH43ld',
  jsonb_build_object('reconciled_from', 'stripe_snapshot_2026_08_28'),
  NOW()
FROM auth.users AS auth_user
WHERE auth_user.id = '110e573d-c5aa-49a3-bfb4-ba407a7d5946'::UUID
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_subscriptions AS subscription
    WHERE subscription.stripe_subscription_id =
          'sub_1TOOnbDGN9N43CzqEcFGfNPn'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_subscriptions AS subscription
    WHERE subscription.user_id = auth_user.id
      AND subscription.status IN (
        'active', 'past_due', 'paused', 'trialing', 'incomplete'
      )
  )
ON CONFLICT (stripe_subscription_id) DO NOTHING;

WITH stripe_snapshot (
  stripe_subscription_id,
  plan_id,
  status,
  stripe_price_id,
  current_period_start,
  current_period_end,
  cancel_at_period_end
) AS (
  VALUES
    (
      'sub_1TEDHnDGN9N43Czqvfe5MMwi',
      'd18ddf08-784d-471c-b2d7-7586b4e5472c'::UUID,
      'canceled', 'price_1TDzXyDGN9N43CzqXqZH43ld',
      '2026-05-23T18:32:52Z'::TIMESTAMPTZ,
      '2026-06-23T18:32:52Z'::TIMESTAMPTZ, FALSE
    ),
    (
      'sub_1TFDeUDGN9N43Czq4edN9SrH',
      'd18ddf08-784d-471c-b2d7-7586b4e5472c'::UUID,
      'canceled', 'price_1TDzXyDGN9N43CzqXqZH43ld',
      '2026-03-26T13:08:42Z'::TIMESTAMPTZ,
      '2026-04-26T13:08:42Z'::TIMESTAMPTZ, TRUE
    ),
    (
      'sub_1THn6zDGN9N43Czqs3zn1cM2',
      '3f42df0e-6794-414f-9410-97981064fa7e'::UUID,
      'canceled', 'price_1TDzY0DGN9N43CzqxEegna19',
      '2026-07-02T15:22:21Z'::TIMESTAMPTZ,
      '2026-08-02T15:22:21Z'::TIMESTAMPTZ, FALSE
    ),
    (
      'sub_1TOZVCDGN9N43CzqE9qTCuRP',
      'd18ddf08-784d-471c-b2d7-7586b4e5472c'::UUID,
      'canceled', 'price_1TDzXyDGN9N43CzqXqZH43ld',
      '2026-04-21T08:17:37Z'::TIMESTAMPTZ,
      '2026-05-21T08:17:37Z'::TIMESTAMPTZ, TRUE
    ),
    (
      'sub_1TRoBIDGN9N43Czqec6dyzWQ',
      'd18ddf08-784d-471c-b2d7-7586b4e5472c'::UUID,
      'canceled', 'price_1TDzXyDGN9N43CzqXqZH43ld',
      '2026-04-30T06:33:54Z'::TIMESTAMPTZ,
      '2026-05-30T06:33:54Z'::TIMESTAMPTZ, TRUE
    ),
    (
      'sub_1TgguqDGN9N43CzqdxkZIvyZ',
      '3f42df0e-6794-414f-9410-97981064fa7e'::UUID,
      'canceled', 'price_1TDzY0DGN9N43CzqxEegna19',
      '2026-08-10T07:51:10Z'::TIMESTAMPTZ,
      '2026-09-10T07:51:10Z'::TIMESTAMPTZ, FALSE
    ),
    (
      'sub_1Th15mDGN9N43CzqyfYARZaP',
      'd18ddf08-784d-471c-b2d7-7586b4e5472c'::UUID,
      'active', 'price_1TDzXyDGN9N43CzqXqZH43ld',
      '2026-08-11T05:23:47Z'::TIMESTAMPTZ,
      '2026-09-11T05:23:47Z'::TIMESTAMPTZ, FALSE
    ),
    (
      'sub_1Tlt6cDGN9N43CzqQNetA5wG',
      'd18ddf08-784d-471c-b2d7-7586b4e5472c'::UUID,
      'past_due', 'price_1TDzXyDGN9N43CzqXqZH43ld',
      '2026-08-24T15:52:25Z'::TIMESTAMPTZ,
      '2026-09-24T15:52:25Z'::TIMESTAMPTZ, FALSE
    )
)
UPDATE public.user_subscriptions AS subscription
SET
  plan_id = snapshot.plan_id,
  status = snapshot.status,
  stripe_price_id = snapshot.stripe_price_id,
  current_period_start = snapshot.current_period_start,
  current_period_end = snapshot.current_period_end,
  cancel_at_period_end = snapshot.cancel_at_period_end,
  updated_at = NOW()
FROM stripe_snapshot AS snapshot
WHERE subscription.stripe_subscription_id = snapshot.stripe_subscription_id;
