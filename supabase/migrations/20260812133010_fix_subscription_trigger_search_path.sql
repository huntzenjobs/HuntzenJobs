-- Le trigger héritait du search_path vide des RPC Stripe appelantes.
-- Toutes les relations doivent donc être qualifiées explicitement.
CREATE OR REPLACE FUNCTION public.auto_cancel_previous_subscriptions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_cancelled_count integer;
  v_cancelled_ids text[];
BEGIN
  IF NEW.status = 'active' THEN
    SELECT array_agg(subscription.id::text)
    INTO v_cancelled_ids
    FROM public.user_subscriptions AS subscription
    WHERE subscription.user_id = NEW.user_id
      AND subscription.id <> NEW.id
      AND subscription.status IN ('active', 'trialing');

    UPDATE public.user_subscriptions AS subscription
    SET
      status = 'canceled',
      canceled_at = now(),
      updated_at = now()
    WHERE subscription.user_id = NEW.user_id
      AND subscription.id <> NEW.id
      AND subscription.status IN ('active', 'trialing');

    GET DIAGNOSTICS v_cancelled_count = ROW_COUNT;

    IF v_cancelled_count > 0 THEN
      RAISE NOTICE 'Auto-cancelled % previous subscription(s) for user % (IDs: %)',
        v_cancelled_count,
        NEW.user_id,
        v_cancelled_ids;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.auto_cancel_previous_subscriptions() IS
  'Automatically cancels previous subscriptions when a new one becomes active. Uses schema-qualified relations so Stripe RPCs with an empty search_path remain safe.';
