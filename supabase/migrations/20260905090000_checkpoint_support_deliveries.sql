-- Durcir le nettoyage Storage et reprendre chaque canal de livraison sans doublon.

DROP POLICY IF EXISTS "user_delete_own_support" ON storage.objects;
CREATE POLICY "user_delete_own_support"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'support-attachments'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
  );

ALTER TABLE public.support_delivery_outbox
  ADD COLUMN IF NOT EXISTS email_delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notification_delivered_at TIMESTAMPTZ;

COMMENT ON COLUMN public.support_delivery_outbox.email_delivered_at IS
  'Checkpoint durable posé immédiatement après la livraison email.';
COMMENT ON COLUMN public.support_delivery_outbox.notification_delivered_at IS
  'Checkpoint durable posé immédiatement après la notification applicative.';

CREATE OR REPLACE FUNCTION public.mark_support_delivery_channel_succeeded(
  p_delivery_id UUID,
  p_worker_id UUID,
  p_channel TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  delivery public.support_delivery_outbox%ROWTYPE;
BEGIN
  IF p_delivery_id IS NULL
     OR p_worker_id IS NULL
     OR p_channel NOT IN ('email', 'notification') THEN
    RAISE EXCEPTION 'paramètres de checkpoint invalides';
  END IF;

  UPDATE public.support_delivery_outbox
  SET email_delivered_at = CASE
        WHEN p_channel = 'email'
          THEN COALESCE(email_delivered_at, pg_catalog.now())
        ELSE email_delivered_at
      END,
      notification_delivered_at = CASE
        WHEN p_channel = 'notification'
          THEN COALESCE(notification_delivered_at, pg_catalog.now())
        ELSE notification_delivered_at
      END,
      updated_at = pg_catalog.now()
  WHERE id = p_delivery_id
    AND status = 'processing'
    AND lease_owner = p_worker_id
  RETURNING * INTO delivery;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('updated', false);
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'updated', true,
    'email_delivered_at', delivery.email_delivered_at,
    'notification_delivered_at', delivery.notification_delivered_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_support_delivery_channel_succeeded(UUID, UUID, TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_support_delivery_channel_succeeded(UUID, UUID, TEXT)
TO service_role;

-- ROLLBACK NON DESTRUCTIF : arrêter le cron support, attendre la fin des leases,
-- retirer la fonction et la policy ajoutées, puis retirer les deux colonnes seulement
-- si aucun déploiement applicatif ne les lit encore. Aucune ligne métier n'est supprimée.
