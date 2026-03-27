-- ============================================================================
-- Migration: Active Coach Sessions Table
-- ============================================================================
--
-- Objectif: Empêcher exploitation limites coach via multi-onglets
--
-- Problème résolu:
-- - User ouvre 2 onglets → 2 sessions coach simultanées
-- - Timer stocké uniquement en localStorage → backend ne peut détecter
--
-- Solution:
-- - Table server-side pour tracker sessions actives
-- - Endpoint /api/subscription/coach-session valide AVANT start
-- - Contrainte UNIQUE empêche 2 sessions actives per user
--
-- ============================================================================

-- ============================================================================
-- Table: active_coach_sessions
-- ============================================================================

CREATE TABLE IF NOT EXISTS active_coach_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User reference
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Session timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Metadata
  user_agent TEXT,  -- Optionnel: tracking browser/device
  ip_address INET,  -- Optionnel: tracking IP pour debug

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Constraints: Only one active session per user
-- ============================================================================

CREATE UNIQUE INDEX idx_active_coach_sessions_user
  ON active_coach_sessions(user_id);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX idx_active_coach_sessions_started
  ON active_coach_sessions(started_at DESC);

-- ============================================================================
-- RLS (Row Level Security)
-- ============================================================================

ALTER TABLE active_coach_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own active sessions
CREATE POLICY "Users can view own active coach sessions"
  ON active_coach_sessions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own sessions (via stop endpoint)
CREATE POLICY "Users can delete own active coach sessions"
  ON active_coach_sessions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Policy: Service role can manage all sessions
CREATE POLICY "Service role can manage all active coach sessions"
  ON active_coach_sessions
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- Helper: Get user's active session
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_active_coach_session(p_user_id UUID)
RETURNS TABLE (
  session_id UUID,
  started_at TIMESTAMPTZ,
  elapsed_seconds INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    id as session_id,
    acs.started_at,
    EXTRACT(EPOCH FROM (NOW() - acs.started_at))::INTEGER as elapsed_seconds
  FROM active_coach_sessions acs
  WHERE acs.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Helper: Cleanup stale sessions (older than 24h)
-- ============================================================================
-- Sessions qui sont restées "actives" > 24h sont probablement bugs
-- (user a fermé l'onglet sans stop session)

CREATE OR REPLACE FUNCTION cleanup_stale_coach_sessions()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM active_coach_sessions
  WHERE started_at < NOW() - INTERVAL '24 hours';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  IF v_deleted_count > 0 THEN
    RAISE NOTICE 'Cleaned up % stale coach sessions', v_deleted_count;
  END IF;

  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Helper: Get active sessions stats (monitoring)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_active_coach_sessions_stats()
RETURNS TABLE (
  total_active_sessions INTEGER,
  oldest_session_started_at TIMESTAMPTZ,
  longest_session_duration INTERVAL,
  sessions_older_than_1h INTEGER,
  sessions_older_than_24h INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_active_sessions,
    MIN(started_at) as oldest_session_started_at,
    MAX(NOW() - started_at) as longest_session_duration,
    COUNT(*) FILTER (WHERE started_at < NOW() - INTERVAL '1 hour')::INTEGER as sessions_older_than_1h,
    COUNT(*) FILTER (WHERE started_at < NOW() - INTERVAL '24 hours')::INTEGER as sessions_older_than_24h
  FROM active_coach_sessions;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Trigger: Auto-cleanup on quota increment
-- ============================================================================
-- Quand usage coach est incrémenté, supprimer la session active si elle existe
-- (cas edge: session active mais increment_usage appelé directement)

CREATE OR REPLACE FUNCTION auto_cleanup_coach_session_on_usage()
RETURNS TRIGGER AS $$
BEGIN
  -- Si usage coach incrémenté, supprimer session active du user
  IF TG_TABLE_NAME = 'usage_quotas' AND NEW.coach_seconds_used > COALESCE(OLD.coach_seconds_used, 0) THEN
    DELETE FROM active_coach_sessions
    WHERE user_id = NEW.user_id;

    RAISE NOTICE 'Auto-cleaned coach session for user % after usage increment', NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_cleanup_coach_session ON usage_quotas;

CREATE TRIGGER trigger_auto_cleanup_coach_session
  AFTER UPDATE ON usage_quotas
  FOR EACH ROW
  WHEN (NEW.coach_seconds_used > COALESCE(OLD.coach_seconds_used, 0))
  EXECUTE FUNCTION auto_cleanup_coach_session_on_usage();

-- ============================================================================
-- Documentation
-- ============================================================================

COMMENT ON TABLE active_coach_sessions IS
  'Tracks active coach sessions server-side to prevent multi-tab exploitation of coaching time limits.';

COMMENT ON FUNCTION get_user_active_coach_session(UUID) IS
  'Returns the active coach session for a user, if any. Used by frontend to sync state.';

COMMENT ON FUNCTION cleanup_stale_coach_sessions() IS
  'Removes coach sessions older than 24 hours (likely stale due to user closing tab without stopping).';

COMMENT ON FUNCTION get_active_coach_sessions_stats() IS
  'Returns statistics about currently active coach sessions for monitoring.';

COMMENT ON FUNCTION auto_cleanup_coach_session_on_usage() IS
  'Automatically removes active coach session when usage is incremented (safety cleanup).';

-- ============================================================================
-- Permissions
-- ============================================================================

-- Allow authenticated users to query their own active session
GRANT EXECUTE ON FUNCTION get_user_active_coach_session(UUID) TO authenticated;

-- Only service role can cleanup stale sessions and view stats
REVOKE EXECUTE ON FUNCTION cleanup_stale_coach_sessions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_stale_coach_sessions() TO service_role;

REVOKE EXECUTE ON FUNCTION get_active_coach_sessions_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_active_coach_sessions_stats() TO service_role, authenticated;

-- ============================================================================
-- Add to cleanup cron (if using pg_cron)
-- ============================================================================
/*
-- Add stale session cleanup to daily cron (runs at 3 AM)
SELECT cron.schedule(
  'cleanup-stale-coach-sessions',
  '0 3 * * *',  -- Every day at 3 AM
  'SELECT cleanup_stale_coach_sessions();'
);
*/

-- ============================================================================
-- Initial cleanup (one-time)
-- ============================================================================
-- Cleanup any existing orphaned sessions from before migration
-- Décommenter si nécessaire:

/*
DO $$
DECLARE
  v_cleaned_count INTEGER;
BEGIN
  SELECT cleanup_stale_coach_sessions() INTO v_cleaned_count;
  RAISE NOTICE 'Initial cleanup: removed % stale coach sessions', v_cleaned_count;
END $$;
*/
