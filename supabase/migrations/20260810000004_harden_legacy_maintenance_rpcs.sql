-- Ferme les RPC de maintenance historiques qui contournaient la RLS via
-- SECURITY DEFINER tout en restant exécutables par PUBLIC/anon.

CREATE OR REPLACE FUNCTION public.cleanup_old_user_sessions(
  p_days_old INTEGER DEFAULT 30
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  IF p_days_old < 1 OR p_days_old > 3650 THEN
    RAISE EXCEPTION 'p_days_old must be between 1 and 3650';
  END IF;

  DELETE FROM public.user_sessions
  WHERE updated_at < (NOW() - make_interval(days => p_days_old));

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_old_user_sessions(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_user_sessions(INTEGER)
  TO service_role;

REVOKE ALL ON FUNCTION public.cleanup_expired_cache()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_cache() TO service_role;
ALTER FUNCTION public.cleanup_expired_cache()
  SET search_path = pg_catalog, public;

REVOKE ALL ON TABLE public.webhook_failures
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.webhook_failures TO service_role;

REVOKE ALL ON FUNCTION public.log_webhook_failure(TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_failed_webhooks_count(TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_webhook_failure_stats(INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_webhook_failure_resolved(TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_old_webhook_failures()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.log_webhook_failure(TEXT, TEXT, TEXT, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_failed_webhooks_count(TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_webhook_failure_stats(INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_webhook_failure_resolved(TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_webhook_failures()
  TO service_role;

ALTER FUNCTION public.log_webhook_failure(TEXT, TEXT, TEXT, TEXT)
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.get_failed_webhooks_count(TEXT)
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.get_webhook_failure_stats(INTEGER)
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.mark_webhook_failure_resolved(TEXT)
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.cleanup_old_webhook_failures()
  SET search_path = pg_catalog, public;
