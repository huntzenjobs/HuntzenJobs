-- ============================================================================
-- Migration: Automated Cleanup Old Records (Cron)
-- ============================================================================
--
-- Objectif: Cleanup automatique des vieux records pour éviter bloat DB
--
-- Tables nettoyées:
-- - stripe_webhook_events: > 30 jours
-- - webhook_failures (resolved): > 90 jours
-- - usage_quotas: > 90 jours
-- - subscription_history: > 1 an
--
-- Méthodes d'exécution:
-- 1. pg_cron (Supabase Pro) - automatique
-- 2. Vercel Cron + RPC endpoint - fallback
--
-- ============================================================================

-- ============================================================================
-- Fonction: Cleanup old records (internal)
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_records()
RETURNS void AS $$
DECLARE
  v_webhook_events_deleted INTEGER;
  v_webhook_failures_deleted INTEGER;
  v_usage_quotas_deleted INTEGER;
  v_subscription_history_deleted INTEGER;
BEGIN
  -- Cleanup old webhook events (keep 30 days)
  DELETE FROM stripe_webhook_events
  WHERE created_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS v_webhook_events_deleted = ROW_COUNT;

  -- Cleanup old webhook failures resolved (keep 90 days)
  DELETE FROM webhook_failures
  WHERE resolved = true
    AND resolved_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS v_webhook_failures_deleted = ROW_COUNT;

  -- Cleanup old usage quotas (keep 90 days)
  DELETE FROM usage_quotas
  WHERE quota_date < CURRENT_DATE - INTERVAL '90 days';
  GET DIAGNOSTICS v_usage_quotas_deleted = ROW_COUNT;

  -- Cleanup old subscription history (keep 1 year)
  DELETE FROM subscription_history
  WHERE created_at < NOW() - INTERVAL '1 year';
  GET DIAGNOSTICS v_subscription_history_deleted = ROW_COUNT;

  -- Log cleanup results
  RAISE NOTICE 'Cleanup completed at %', NOW();
  RAISE NOTICE '  - Webhook events deleted: %', v_webhook_events_deleted;
  RAISE NOTICE '  - Webhook failures deleted: %', v_webhook_failures_deleted;
  RAISE NOTICE '  - Usage quotas deleted: %', v_usage_quotas_deleted;
  RAISE NOTICE '  - Subscription history deleted: %', v_subscription_history_deleted;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- RPC Function: Cleanup old records (exposed to API)
-- ============================================================================
-- Cette fonction est appelée par Vercel Cron endpoint
-- Retourne statistiques de cleanup au lieu de void

CREATE OR REPLACE FUNCTION cleanup_old_records_rpc()
RETURNS TABLE (
  webhook_events_deleted INTEGER,
  webhook_failures_deleted INTEGER,
  usage_quotas_deleted INTEGER,
  subscription_history_deleted INTEGER,
  cleanup_timestamp TIMESTAMPTZ
) AS $$
DECLARE
  v_webhook_events INTEGER := 0;
  v_webhook_failures INTEGER := 0;
  v_usage_quotas INTEGER := 0;
  v_subscription_history INTEGER := 0;
BEGIN
  -- Cleanup old webhook events (keep 30 days)
  DELETE FROM stripe_webhook_events
  WHERE created_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS v_webhook_events = ROW_COUNT;

  -- Cleanup old webhook failures resolved (keep 90 days)
  DELETE FROM webhook_failures
  WHERE resolved = true
    AND resolved_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS v_webhook_failures = ROW_COUNT;

  -- Cleanup old usage quotas (keep 90 days)
  DELETE FROM usage_quotas
  WHERE quota_date < CURRENT_DATE - INTERVAL '90 days';
  GET DIAGNOSTICS v_usage_quotas = ROW_COUNT;

  -- Cleanup old subscription history (keep 1 year)
  DELETE FROM subscription_history
  WHERE created_at < NOW() - INTERVAL '1 year';
  GET DIAGNOSTICS v_subscription_history = ROW_COUNT;

  -- Return stats
  RETURN QUERY SELECT
    v_webhook_events,
    v_webhook_failures,
    v_usage_quotas,
    v_subscription_history,
    NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Helper: Get cleanup info (what would be deleted if cleanup runs now)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_cleanup_info()
RETURNS TABLE (
  webhook_events_count INTEGER,
  webhook_events_oldest TIMESTAMPTZ,
  webhook_failures_count INTEGER,
  webhook_failures_oldest TIMESTAMPTZ,
  usage_quotas_count INTEGER,
  usage_quotas_oldest DATE,
  subscription_history_count INTEGER,
  subscription_history_oldest TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::INTEGER FROM stripe_webhook_events WHERE created_at < NOW() - INTERVAL '30 days'),
    (SELECT MIN(created_at) FROM stripe_webhook_events WHERE created_at < NOW() - INTERVAL '30 days'),
    (SELECT COUNT(*)::INTEGER FROM webhook_failures WHERE resolved = true AND resolved_at < NOW() - INTERVAL '90 days'),
    (SELECT MIN(resolved_at) FROM webhook_failures WHERE resolved = true AND resolved_at < NOW() - INTERVAL '90 days'),
    (SELECT COUNT(*)::INTEGER FROM usage_quotas WHERE quota_date < CURRENT_DATE - INTERVAL '90 days'),
    (SELECT MIN(quota_date) FROM usage_quotas WHERE quota_date < CURRENT_DATE - INTERVAL '90 days'),
    (SELECT COUNT(*)::INTEGER FROM subscription_history WHERE created_at < NOW() - INTERVAL '1 year'),
    (SELECT MIN(created_at) FROM subscription_history WHERE created_at < NOW() - INTERVAL '1 year');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- pg_cron Setup (Supabase Pro only)
-- ============================================================================
-- Si Supabase Pro avec pg_cron disponible, décommenter les lignes suivantes:

/*
-- Installer extension si pas déjà fait
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule cleanup daily at 2 AM UTC
SELECT cron.schedule(
  'cleanup-old-records',
  '0 2 * * *',  -- Cron expression: every day at 2 AM
  'SELECT cleanup_old_records();'
);

-- Vérifier les jobs schedulés
-- SELECT * FROM cron.job;

-- Vérifier l'historique d'exécution
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
*/

-- ============================================================================
-- Documentation
-- ============================================================================

COMMENT ON FUNCTION cleanup_old_records() IS
  'Internal function to cleanup old records from webhook_events, webhook_failures, usage_quotas, and subscription_history tables. Called by pg_cron or manually.';

COMMENT ON FUNCTION cleanup_old_records_rpc() IS
  'Public RPC function for cleanup, returns statistics. Called by Vercel Cron endpoint at /api/cron/cleanup-old-records.';

COMMENT ON FUNCTION get_cleanup_info() IS
  'Returns information about records that would be deleted if cleanup runs now. Useful for monitoring.';

-- ============================================================================
-- Permissions
-- ============================================================================

-- Revoke from public, grant to service_role only
REVOKE EXECUTE ON FUNCTION cleanup_old_records() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_old_records() TO service_role;

REVOKE EXECUTE ON FUNCTION cleanup_old_records_rpc() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_old_records_rpc() TO service_role;

-- Allow authenticated users to view cleanup info (monitoring)
GRANT EXECUTE ON FUNCTION get_cleanup_info() TO authenticated, service_role;

-- ============================================================================
-- Initial Cleanup (one-time, optional)
-- ============================================================================
-- Exécute un cleanup immédiat pour nettoyer vieux records existants
-- Décommenter si nécessaire:

/*
DO $$
DECLARE
  v_result RECORD;
BEGIN
  SELECT * INTO v_result FROM cleanup_old_records_rpc();

  RAISE NOTICE 'Initial cleanup completed:';
  RAISE NOTICE '  - Webhook events: %', v_result.webhook_events_deleted;
  RAISE NOTICE '  - Webhook failures: %', v_result.webhook_failures_deleted;
  RAISE NOTICE '  - Usage quotas: %', v_result.usage_quotas_deleted;
  RAISE NOTICE '  - Subscription history: %', v_result.subscription_history_deleted;
END $$;
*/
