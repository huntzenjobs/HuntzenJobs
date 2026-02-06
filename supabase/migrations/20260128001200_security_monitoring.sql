-- =====================================================
-- Security Monitoring System
-- Tracks security events for anomaly detection & alerts
-- =====================================================

-- 1. Create security_events table
-- =====================================================
CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical', 'emergency')),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT,
  ip_address INET,
  user_agent TEXT,
  event_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast querying
CREATE INDEX IF NOT EXISTS idx_security_events_user_id ON security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_event_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_ip_address ON security_events(ip_address);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_security_events_user_type ON security_events(user_id, event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_severity_created ON security_events(severity, created_at DESC);

-- 2. Enable Row Level Security
-- =====================================================
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can read own security events" ON security_events;
DROP POLICY IF EXISTS "Service role full access" ON security_events;

-- Only authenticated users can read their own events
CREATE POLICY "Users can read own security events"
  ON security_events
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can read/write all events (for backend)
CREATE POLICY "Service role full access"
  ON security_events
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- 3. Create log_security_event() function
-- =====================================================
CREATE OR REPLACE FUNCTION log_security_event(
  p_event_type TEXT,
  p_severity TEXT DEFAULT 'info',
  p_user_id UUID DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_event_data JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  -- Validate severity
  IF p_severity NOT IN ('info', 'warning', 'critical', 'emergency') THEN
    RAISE EXCEPTION 'Invalid severity level: %. Must be info, warning, critical, or emergency', p_severity;
  END IF;

  -- Insert security event
  INSERT INTO security_events (
    event_type,
    severity,
    user_id,
    session_id,
    ip_address,
    user_agent,
    event_data
  ) VALUES (
    p_event_type,
    p_severity,
    COALESCE(p_user_id, auth.uid()),
    p_session_id,
    CAST(p_ip_address AS INET),
    p_user_agent,
    p_event_data
  )
  RETURNING id INTO v_event_id;

  -- Log to PostgreSQL logs for critical/emergency events
  IF p_severity IN ('critical', 'emergency') THEN
    RAISE NOTICE 'SECURITY ALERT [%]: % for user % (IP: %)',
      p_severity,
      p_event_type,
      COALESCE(p_user_id::TEXT, 'anonymous'),
      COALESCE(p_ip_address, 'unknown');
  END IF;

  RETURN v_event_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION log_security_event(TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

-- 4. Create helper functions for common queries
-- =====================================================

-- Get recent events for a user
CREATE OR REPLACE FUNCTION get_user_security_events(
  p_user_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  event_type TEXT,
  severity TEXT,
  created_at TIMESTAMPTZ,
  ip_address INET,
  event_data JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    se.id,
    se.event_type,
    se.severity,
    se.created_at,
    se.ip_address,
    se.event_data
  FROM security_events se
  WHERE se.user_id = COALESCE(p_user_id, auth.uid())
  ORDER BY se.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_security_events(UUID, INT) TO authenticated;

-- Detect anomalies (e.g., multiple failed logins)
CREATE OR REPLACE FUNCTION detect_failed_login_anomaly(
  p_user_id UUID,
  p_threshold INT DEFAULT 5,
  p_time_window INTERVAL DEFAULT '15 minutes'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_failed_count INT;
BEGIN
  SELECT COUNT(*)
  INTO v_failed_count
  FROM security_events
  WHERE
    user_id = p_user_id
    AND event_type = 'auth.failed_login'
    AND created_at > (now() - p_time_window);

  RETURN v_failed_count >= p_threshold;
END;
$$;

GRANT EXECUTE ON FUNCTION detect_failed_login_anomaly(UUID, INT, INTERVAL) TO authenticated, service_role;

-- 5. Create automatic cleanup job (delete old events)
-- =====================================================
-- Note: This requires pg_cron extension (available on Supabase Pro)
-- For now, we'll create the function and you can schedule it manually

CREATE OR REPLACE FUNCTION cleanup_old_security_events(
  p_retention_days INT DEFAULT 90
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INT;
BEGIN
  DELETE FROM security_events
  WHERE created_at < (now() - (p_retention_days || ' days')::INTERVAL)
    AND severity = 'info';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RAISE NOTICE 'Deleted % old security events', v_deleted_count;
  RETURN v_deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION cleanup_old_security_events(INT) TO service_role;

-- 6. Create views for monitoring dashboards
-- =====================================================

-- Recent critical events (last 24 hours)
CREATE OR REPLACE VIEW recent_critical_events AS
SELECT
  id,
  event_type,
  severity,
  user_id,
  ip_address,
  created_at,
  event_data
FROM security_events
WHERE
  severity IN ('critical', 'emergency')
  AND created_at > (now() - INTERVAL '24 hours')
ORDER BY created_at DESC;

-- Failed login attempts by IP (last hour)
CREATE OR REPLACE VIEW failed_logins_by_ip AS
SELECT
  ip_address,
  COUNT(*) as attempt_count,
  MAX(created_at) as last_attempt,
  array_agg(DISTINCT user_id) as attempted_user_ids
FROM security_events
WHERE
  event_type = 'auth.failed_login'
  AND created_at > (now() - INTERVAL '1 hour')
GROUP BY ip_address
HAVING COUNT(*) >= 3
ORDER BY attempt_count DESC;

-- Event type distribution (last 24 hours)
CREATE OR REPLACE VIEW event_type_distribution AS
SELECT
  event_type,
  COUNT(*) as event_count,
  COUNT(DISTINCT user_id) as unique_users
FROM security_events
WHERE created_at > (now() - INTERVAL '24 hours')
GROUP BY event_type
ORDER BY event_count DESC;

-- 7. Initial seed data for testing
-- =====================================================
COMMENT ON TABLE security_events IS 'Security audit log for monitoring authentication, RLS violations, and suspicious activity';
COMMENT ON FUNCTION log_security_event(TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB) IS 'Logs a security event with automatic severity validation and critical event logging';
COMMENT ON FUNCTION detect_failed_login_anomaly(UUID, INT, INTERVAL) IS 'Detects if a user has exceeded failed login threshold within time window';

-- =====================================================
-- Migration Complete
-- =====================================================
