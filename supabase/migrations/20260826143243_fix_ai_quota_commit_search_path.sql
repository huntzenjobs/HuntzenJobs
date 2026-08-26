-- La RPC legacy increment_usage() utilise encore des noms de tables non
-- qualifiés. Le commit sécurisé garde search_path vide et débite directement
-- les deux compteurs couverts par les réservations.
CREATE OR REPLACE FUNCTION public.commit_ai_quota_reservation(
  p_reservation_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  reservation public.ai_quota_reservations%ROWTYPE;
BEGIN
  SELECT *
  INTO reservation
  FROM public.ai_quota_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF reservation.status = 'committed' THEN
    RETURN TRUE;
  END IF;

  IF reservation.status <> 'pending' THEN
    RETURN FALSE;
  END IF;

  IF reservation.expires_at <= NOW() THEN
    UPDATE public.ai_quota_reservations
    SET status = 'expired', finalized_at = NOW()
    WHERE id = p_reservation_id;
    RETURN FALSE;
  END IF;

  INSERT INTO public.usage_quotas (
    user_id,
    quota_date,
    cv_adapt_used,
    cover_letter_used
  ) VALUES (
    reservation.user_id,
    reservation.quota_date,
    CASE WHEN reservation.feature = 'cv_adapt' THEN reservation.amount ELSE 0 END,
    CASE WHEN reservation.feature = 'cover_letter' THEN reservation.amount ELSE 0 END
  )
  ON CONFLICT (user_id, quota_date) DO UPDATE
  SET
    cv_adapt_used = COALESCE(public.usage_quotas.cv_adapt_used, 0)
      + EXCLUDED.cv_adapt_used,
    cover_letter_used = COALESCE(public.usage_quotas.cover_letter_used, 0)
      + EXCLUDED.cover_letter_used,
    updated_at = NOW();

  UPDATE public.ai_quota_reservations
  SET status = 'committed', finalized_at = NOW()
  WHERE id = p_reservation_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_ai_quota_reservation(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_ai_quota_reservation(UUID)
  TO service_role;
