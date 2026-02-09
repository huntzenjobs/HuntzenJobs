-- ============================================
-- DAILY QUOTA RESET - Automated Cron Job
-- ============================================
-- Automatically reset quotas daily at midnight UTC
-- Two approaches: pg_cron (if available) or RPC for external cron

-- ============================================
-- APPROACH 1: pg_cron (requires Supabase Pro or self-hosted with pg_cron extension)
-- ============================================

-- Enable pg_cron extension (requires superuser)
-- Note: This may not be available on all Supabase plans
-- Run this manually in Supabase SQL Editor if pg_cron is available:
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  -- Check if pg_cron is available
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove old cron job if exists (avoid duplicates)
    PERFORM cron.unschedule('daily-quota-reset');

    -- Schedule new job: runs at midnight UTC every day
    PERFORM cron.schedule(
      'daily-quota-reset',  -- job name
      '0 0 * * *',          -- cron schedule: midnight UTC daily
      $$
        -- Delete old usage_quotas records (keep last 7 days for audit)
        DELETE FROM usage_quotas WHERE quota_date < CURRENT_DATE - INTERVAL '7 days';
      $$
    );

    RAISE NOTICE '✓ pg_cron job "daily-quota-reset" scheduled successfully - runs at midnight UTC';
  ELSE
    RAISE WARNING '⚠ pg_cron extension not installed - falling back to RPC endpoint for external cron';
    RAISE WARNING 'ℹ Set up external cron (Vercel Cron, GitHub Actions, etc.) to call reset_quotas_rpc()';
  END IF;
END $$;

-- ============================================
-- APPROACH 2: RPC Endpoint for External Cron (Vercel Cron, GitHub Actions, etc.)
-- ============================================
-- Use this if pg_cron is not available (Supabase Free tier)

CREATE OR REPLACE FUNCTION reset_quotas_rpc()
RETURNS JSON AS $$
DECLARE
  rows_deleted INTEGER;
BEGIN
  -- Delete old usage_quotas records (older than 7 days for audit trail)
  DELETE FROM usage_quotas
  WHERE quota_date < CURRENT_DATE - INTERVAL '7 days';

  GET DIAGNOSTICS rows_deleted = ROW_COUNT;

  -- Return success response with stats
  RETURN json_build_object(
    'success', true,
    'rows_deleted', rows_deleted,
    'reset_date', CURRENT_DATE,
    'timestamp', NOW(),
    'message', format('Quota reset completed: %s old records deleted', rows_deleted)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant to service_role only (for external cron with service_role key)
GRANT EXECUTE ON FUNCTION reset_quotas_rpc() TO service_role;

COMMENT ON FUNCTION reset_quotas_rpc IS 'RPC endpoint for external cron jobs to reset daily quotas. Call with service_role key at midnight UTC. Example: POST https://yourproject.supabase.co/rest/v1/rpc/reset_quotas_rpc with Authorization: Bearer SERVICE_ROLE_KEY';

-- ============================================
-- HELPER FUNCTION: Manual quota cleanup (for admins)
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_usage_quotas(p_days_to_keep INTEGER DEFAULT 7)
RETURNS TABLE (
  rows_deleted INTEGER,
  oldest_remaining_date DATE
) AS $$
DECLARE
  v_rows_deleted INTEGER;
  v_oldest_date DATE;
BEGIN
  DELETE FROM usage_quotas
  WHERE quota_date < CURRENT_DATE - (p_days_to_keep || ' days')::INTERVAL;

  GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;

  SELECT MIN(quota_date) INTO v_oldest_date FROM usage_quotas;

  RETURN QUERY SELECT v_rows_deleted, v_oldest_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cleanup_usage_quotas(INTEGER) TO service_role;

COMMENT ON FUNCTION cleanup_usage_quotas IS 'Manual cleanup of old usage_quotas records. Deletes records older than specified days (default: 7). Returns rows deleted and oldest remaining date.';

-- ============================================
-- MONITORING FUNCTION: Get quota reset status
-- ============================================
CREATE OR REPLACE FUNCTION get_quota_reset_info()
RETURNS TABLE (
  total_quota_records INTEGER,
  oldest_quota_date DATE,
  newest_quota_date DATE,
  dates_with_data INTEGER,
  records_ready_for_cleanup INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER AS total_quota_records,
    MIN(quota_date) AS oldest_quota_date,
    MAX(quota_date) AS newest_quota_date,
    COUNT(DISTINCT quota_date)::INTEGER AS dates_with_data,
    COUNT(*) FILTER (WHERE quota_date < CURRENT_DATE - INTERVAL '7 days')::INTEGER AS records_ready_for_cleanup
  FROM usage_quotas;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_quota_reset_info() TO service_role, authenticated;

COMMENT ON FUNCTION get_quota_reset_info IS 'Get statistics about usage_quotas table for monitoring. Shows total records, date range, and records ready for cleanup.';

-- ============================================
-- NOTES FOR DEPLOYMENT
-- ============================================

COMMENT ON FUNCTION reset_quotas_rpc IS E'RPC endpoint for external cron jobs to reset daily quotas.\n\nSETUP INSTRUCTIONS:\n\n1. Vercel Cron (recommended for Vercel deployments):\n   - Add to vercel.json:\n   {\n     "crons": [{\n       "path": "/api/cron/reset-quotas",\n       "schedule": "0 0 * * *"\n     }]\n   }\n   - Create /api/cron/reset-quotas endpoint that calls this RPC\n\n2. GitHub Actions (alternative):\n   - Create .github/workflows/daily-quota-reset.yml:\n   name: Daily Quota Reset\n   on:\n     schedule:\n       - cron: "0 0 * * *"\n   jobs:\n     reset:\n       runs-on: ubuntu-latest\n       steps:\n         - run: curl -X POST https://yourproject.supabase.co/rest/v1/rpc/reset_quotas_rpc \\\n                -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}"\n\n3. Manual testing:\n   - SELECT reset_quotas_rpc();\n\nNOTE: Quotas are date-based in usage_quotas table - they automatically "reset" when quota_date changes.\nThis function only cleans up old records (>7 days) for performance.';
