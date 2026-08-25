-- Restaure l'idempotence applicative des webhooks Stripe.
-- Stripe retente les événements mais ne déduplique pas les effets côté marchand.

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'processed', 'failed')),
  claim_token UUID NOT NULL DEFAULT gen_random_uuid(),
  processing_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Compatibilité avec une base où l'ancienne table aurait survécu au nettoyage.
ALTER TABLE public.stripe_webhook_events
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS claim_token UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_type TEXT;

UPDATE public.stripe_webhook_events
SET status = 'processed'
WHERE status IS NULL;

ALTER TABLE public.stripe_webhook_events
  ALTER COLUMN status SET DEFAULT 'processing',
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.stripe_webhook_events
  DROP COLUMN IF EXISTS payload;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'stripe_webhook_events_status_check'
      AND conrelid = 'public.stripe_webhook_events'::regclass
  ) THEN
    ALTER TABLE public.stripe_webhook_events
      ADD CONSTRAINT stripe_webhook_events_status_check
      CHECK (status IN ('processing', 'processed', 'failed'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_status
  ON public.stripe_webhook_events (status);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_created_at
  ON public.stripe_webhook_events (created_at);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages stripe webhook events"
  ON public.stripe_webhook_events;

CREATE POLICY "Service role manages stripe webhook events"
  ON public.stripe_webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.stripe_webhook_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.stripe_webhook_events
  TO service_role;

-- Supprimer les signatures historiques pour éviter tout overload encore exposé.
DROP FUNCTION IF EXISTS public.is_webhook_event_processed(TEXT);
DROP FUNCTION IF EXISTS public.mark_webhook_event_processed(TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.mark_webhook_event_processed(TEXT);
DROP FUNCTION IF EXISTS public.mark_webhook_event_failed(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.claim_stripe_webhook_event(
  p_event_id TEXT,
  p_event_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_status TEXT;
  new_claim_token UUID := gen_random_uuid();
BEGIN
  INSERT INTO public.stripe_webhook_events (
    stripe_event_id,
    event_type,
    status,
    claim_token,
    processing_started_at
  )
  VALUES (
    p_event_id,
    p_event_type,
    'processing',
    new_claim_token,
    NOW()
  )
  ON CONFLICT (stripe_event_id) DO NOTHING;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'claimed',
      'claim_token', new_claim_token::TEXT
    );
  END IF;

  SELECT status
  INTO current_status
  FROM public.stripe_webhook_events
  WHERE stripe_event_id = p_event_id;

  IF current_status = 'processed' THEN
    RETURN jsonb_build_object('status', 'processed', 'claim_token', NULL);
  END IF;

  UPDATE public.stripe_webhook_events
  SET
    status = 'processing',
    claim_token = new_claim_token,
    processing_started_at = NOW(),
    failed_at = NULL,
    error_type = NULL
  WHERE stripe_event_id = p_event_id
    AND (
      status = 'failed'
      OR (
        status = 'processing'
        AND processing_started_at < NOW() - INTERVAL '5 minutes'
      )
    );

  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'claimed',
      'claim_token', new_claim_token::TEXT
    );
  END IF;

  RETURN jsonb_build_object('status', 'processing', 'claim_token', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_webhook_event_processed(
  p_event_id TEXT,
  p_claim_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.stripe_webhook_events
  SET
    status = 'processed',
    processed_at = NOW(),
    failed_at = NULL,
    error_type = NULL
  WHERE stripe_event_id = p_event_id
    AND status = 'processing'
    AND claim_token = p_claim_token;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_webhook_event_failed(
  p_event_id TEXT,
  p_claim_token UUID,
  p_error_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.stripe_webhook_events
  SET
    status = 'failed',
    failed_at = NOW(),
    error_type = LEFT(p_error_type, 120)
  WHERE stripe_event_id = p_event_id
    AND status = 'processing'
    AND claim_token = p_claim_token;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_stripe_webhook_event(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_webhook_event_processed(TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_webhook_event_failed(TEXT, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_stripe_webhook_event(TEXT, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_webhook_event_processed(TEXT, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_webhook_event_failed(TEXT, UUID, TEXT)
  TO service_role;

COMMENT ON TABLE public.stripe_webhook_events IS
  'Verrou et statut des webhooks Stripe, sans payload client. Service_role uniquement.';

COMMENT ON FUNCTION public.claim_stripe_webhook_event(TEXT, TEXT) IS
  'Réserve atomiquement un événement Stripe et retourne son statut et un token propriétaire.';

-- Rollback manuel :
-- DROP FUNCTION IF EXISTS public.mark_webhook_event_failed(TEXT, UUID, TEXT);
-- DROP FUNCTION IF EXISTS public.mark_webhook_event_processed(TEXT, UUID);
-- DROP FUNCTION IF EXISTS public.claim_stripe_webhook_event(TEXT, TEXT);
-- DROP TABLE IF EXISTS public.stripe_webhook_events;
