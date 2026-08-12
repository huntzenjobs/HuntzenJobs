-- Corrige les erreurs de lint révélées par la reconstruction staging et ferme
-- la dernière table de facturation sans RLS.

ALTER TABLE public.stripe_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.stripe_payments FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.stripe_payments TO service_role;

-- Le payload Stripe complet n'est plus conservé afin de limiter la PII. Garder
-- la signature historique pour compatibilité, mais retourner explicitement NULL.
CREATE OR REPLACE FUNCTION public.get_webhook_event_status(p_event_id TEXT)
RETURNS TABLE (
  processed BOOLEAN,
  event_type TEXT,
  processed_at TIMESTAMPTZ,
  payload JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    true,
    event.event_type,
    event.processed_at,
    NULL::JSONB
  FROM public.stripe_webhook_events AS event
  WHERE event.stripe_event_id = p_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_webhook_event_status(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_webhook_event_status(TEXT) TO service_role;

-- Helper de migration one-shot basé sur profiles.subscription_* (déprécié).
-- Il n'est appelé ni par le backend ni par le frontend et son ON CONFLICT ne
-- correspond plus aux contraintes actuelles de user_subscriptions.
DROP FUNCTION IF EXISTS public.sync_profiles_to_user_subscriptions();
