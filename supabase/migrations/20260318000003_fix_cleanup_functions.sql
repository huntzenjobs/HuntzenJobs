-- Migration: Fix cleanup_old_records functions
-- =============================================
-- Problème : Les fonctions cleanup_old_records() et cleanup_old_records_rpc()
-- référencent stripe_webhook_events et webhook_failures, supprimées dans
-- 20260211120000_cleanup_stripe_complexity.sql → plante au runtime.
--
-- Fix : Recréer les fonctions sans les DELETE sur ces tables supprimées.

-- DROP existing functions first to allow return type changes
DROP FUNCTION IF EXISTS cleanup_old_records();
DROP FUNCTION IF EXISTS cleanup_old_records_rpc();
DROP FUNCTION IF EXISTS get_cleanup_info();

CREATE OR REPLACE FUNCTION cleanup_old_records()
RETURNS void AS $$
DECLARE
  v_usage_quotas_deleted INTEGER;
  v_subscription_history_deleted INTEGER;
BEGIN
  -- Cleanup old usage quotas (keep 90 days)
  DELETE FROM usage_quotas
  WHERE quota_date < CURRENT_DATE - INTERVAL '90 days';
  GET DIAGNOSTICS v_usage_quotas_deleted = ROW_COUNT;

  -- Cleanup old subscription history (keep 1 year)
  DELETE FROM subscription_history
  WHERE created_at < NOW() - INTERVAL '1 year';
  GET DIAGNOSTICS v_subscription_history_deleted = ROW_COUNT;

  RAISE NOTICE 'Cleanup completed at %', NOW();
  RAISE NOTICE '  - Usage quotas deleted: %', v_usage_quotas_deleted;
  RAISE NOTICE '  - Subscription history deleted: %', v_subscription_history_deleted;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION cleanup_old_records_rpc()
RETURNS TABLE (
  usage_quotas_deleted INTEGER,
  subscription_history_deleted INTEGER,
  cleanup_timestamp TIMESTAMPTZ
) AS $$
DECLARE
  v_usage_quotas INTEGER := 0;
  v_subscription_history INTEGER := 0;
BEGIN
  -- Cleanup old usage quotas (keep 90 days)
  DELETE FROM usage_quotas
  WHERE quota_date < CURRENT_DATE - INTERVAL '90 days';
  GET DIAGNOSTICS v_usage_quotas = ROW_COUNT;

  -- Cleanup old subscription history (keep 1 year)
  DELETE FROM subscription_history
  WHERE created_at < NOW() - INTERVAL '1 year';
  GET DIAGNOSTICS v_subscription_history = ROW_COUNT;

  RETURN QUERY SELECT
    v_usage_quotas,
    v_subscription_history,
    NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION get_cleanup_info()
RETURNS TABLE (
  usage_quotas_count INTEGER,
  usage_quotas_oldest DATE,
  subscription_history_count INTEGER,
  subscription_history_oldest TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::INTEGER FROM usage_quotas
     WHERE quota_date < CURRENT_DATE - INTERVAL '90 days'),
    (SELECT MIN(quota_date) FROM usage_quotas
     WHERE quota_date < CURRENT_DATE - INTERVAL '90 days'),
    (SELECT COUNT(*)::INTEGER FROM subscription_history
     WHERE created_at < NOW() - INTERVAL '1 year'),
    (SELECT MIN(created_at) FROM subscription_history
     WHERE created_at < NOW() - INTERVAL '1 year');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Permissions (identiques à avant)
REVOKE EXECUTE ON FUNCTION cleanup_old_records() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_old_records() TO service_role;

REVOKE EXECUTE ON FUNCTION cleanup_old_records_rpc() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_old_records_rpc() TO service_role;

GRANT EXECUTE ON FUNCTION get_cleanup_info() TO authenticated, service_role;

COMMENT ON FUNCTION cleanup_old_records() IS
  'Cleanup usage_quotas (>90j) et subscription_history (>1an). stripe_webhook_events et webhook_failures supprimées dans 20260211120000.';

COMMENT ON FUNCTION cleanup_old_records_rpc() IS
  'RPC public pour le cleanup, retourne les stats. Appelé par Vercel Cron /api/cron/cleanup-old-records.';
