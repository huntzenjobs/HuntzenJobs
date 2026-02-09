-- ============================================
-- WEBHOOK FAILURES TRACKING
-- ============================================
-- Purpose: Track failed webhook events for monitoring and alerting
-- This enables detection of systematic webhook failures without accessing DB logs

CREATE TABLE IF NOT EXISTS webhook_failures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stripe_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  error_traceback TEXT,
  retry_count INTEGER DEFAULT 1,
  first_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_webhook_failures_event_id ON webhook_failures(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_failures_event_type ON webhook_failures(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_failures_created_at ON webhook_failures(created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_failures_resolved ON webhook_failures(resolved) WHERE NOT resolved;

-- ============================================
-- FUNCTION: Log webhook failure
-- ============================================
CREATE OR REPLACE FUNCTION log_webhook_failure(
  p_event_id TEXT,
  p_event_type TEXT,
  p_error_message TEXT,
  p_error_traceback TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_failure_id UUID;
  v_existing_count INTEGER;
BEGIN
  -- Check if this event already has a failure record
  SELECT id, retry_count INTO v_failure_id, v_existing_count
  FROM webhook_failures
  WHERE stripe_event_id = p_event_id
    AND NOT resolved
  LIMIT 1;

  IF v_failure_id IS NOT NULL THEN
    -- Update existing failure record with retry count
    UPDATE webhook_failures
    SET
      retry_count = retry_count + 1,
      last_attempt_at = NOW(),
      error_message = p_error_message,  -- Update with latest error
      error_traceback = COALESCE(p_error_traceback, error_traceback),
      updated_at = NOW()
    WHERE id = v_failure_id;

    RETURN v_failure_id;
  ELSE
    -- Insert new failure record
    INSERT INTO webhook_failures (
      stripe_event_id,
      event_type,
      error_message,
      error_traceback,
      retry_count
    )
    VALUES (
      p_event_id,
      p_event_type,
      p_error_message,
      p_error_traceback,
      1
    )
    RETURNING id INTO v_failure_id;

    RETURN v_failure_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Get failed webhooks count for alerting
-- ============================================
CREATE OR REPLACE FUNCTION get_failed_webhooks_count(
  p_event_id TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_event_id IS NOT NULL THEN
    -- Get retry count for specific event
    SELECT retry_count INTO v_count
    FROM webhook_failures
    WHERE stripe_event_id = p_event_id
      AND NOT resolved
    LIMIT 1;

    RETURN COALESCE(v_count, 0);
  ELSE
    -- Get total unresolved failures in last 24h
    SELECT COUNT(*) INTO v_count
    FROM webhook_failures
    WHERE NOT resolved
      AND created_at > NOW() - INTERVAL '24 hours';

    RETURN COALESCE(v_count, 0);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Get webhook failure statistics (for monitoring endpoint)
-- ============================================
CREATE OR REPLACE FUNCTION get_webhook_failure_stats(
  p_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
  total_failures INTEGER,
  unique_events INTEGER,
  high_retry_events INTEGER,  -- Events with >3 retries
  event_types JSONB,
  recent_failures JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER AS total_failures,
    COUNT(DISTINCT stripe_event_id)::INTEGER AS unique_events,
    COUNT(*) FILTER (WHERE retry_count > 3)::INTEGER AS high_retry_events,

    -- Group by event type
    (
      SELECT jsonb_object_agg(event_type, cnt)
      FROM (
        SELECT event_type, COUNT(*) AS cnt
        FROM webhook_failures
        WHERE NOT resolved
          AND created_at > NOW() - (p_hours || ' hours')::INTERVAL
        GROUP BY event_type
      ) event_counts
    ) AS event_types,

    -- Recent failures (last 10)
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'event_id', stripe_event_id,
          'event_type', event_type,
          'error', error_message,
          'retry_count', retry_count,
          'last_attempt', last_attempt_at
        )
      )
      FROM (
        SELECT *
        FROM webhook_failures
        WHERE NOT resolved
          AND created_at > NOW() - (p_hours || ' hours')::INTERVAL
        ORDER BY last_attempt_at DESC
        LIMIT 10
      ) recent
    ) AS recent_failures

  FROM webhook_failures
  WHERE NOT resolved
    AND created_at > NOW() - (p_hours || ' hours')::INTERVAL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Mark webhook failure as resolved
-- ============================================
CREATE OR REPLACE FUNCTION mark_webhook_failure_resolved(
  p_event_id TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE webhook_failures
  SET
    resolved = TRUE,
    resolved_at = NOW(),
    updated_at = NOW()
  WHERE stripe_event_id = p_event_id
    AND NOT resolved;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Cleanup old webhook failures (>30 days)
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_old_webhook_failures()
RETURNS INTEGER AS $$
DECLARE
  rows_deleted INTEGER;
BEGIN
  DELETE FROM webhook_failures
  WHERE created_at < NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS rows_deleted = ROW_COUNT;
  RETURN rows_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT SELECT ON webhook_failures TO authenticated;
GRANT EXECUTE ON FUNCTION log_webhook_failure(TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_failed_webhooks_count(TEXT) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION get_webhook_failure_stats(INTEGER) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION mark_webhook_failure_resolved(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_webhook_failures() TO service_role;

COMMENT ON TABLE webhook_failures IS 'Tracks failed Stripe webhook processing for monitoring and alerting';
COMMENT ON FUNCTION log_webhook_failure IS 'Log a webhook failure or increment retry count for existing failure';
COMMENT ON FUNCTION get_failed_webhooks_count IS 'Get retry count for specific event or total unresolved failures in 24h';
COMMENT ON FUNCTION get_webhook_failure_stats IS 'Get detailed webhook failure statistics for monitoring dashboard';
COMMENT ON FUNCTION mark_webhook_failure_resolved IS 'Mark a webhook failure as resolved after manual intervention';
COMMENT ON FUNCTION cleanup_old_webhook_failures IS 'Delete webhook failure records older than 30 days (maintenance)';
