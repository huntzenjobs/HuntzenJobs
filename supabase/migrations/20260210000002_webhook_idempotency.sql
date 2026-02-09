-- ============================================
-- WEBHOOK IDEMPOTENCY TABLE
-- ============================================
-- Track processed webhook events to prevent duplicate processing
-- Stripe can send the same event multiple times (network retries, etc.)
-- This table ensures each event is processed exactly once

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  payload JSONB,

  -- For cleanup (events older than 30 days can be deleted)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_event_id ON stripe_webhook_events(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_event_type ON stripe_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_created_at ON stripe_webhook_events(created_at);

-- ============================================
-- FUNCTION: Check if webhook event already processed
-- ============================================
CREATE OR REPLACE FUNCTION is_webhook_event_processed(p_event_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM stripe_webhook_events
    WHERE stripe_event_id = p_event_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Mark webhook event as processed
-- ============================================
CREATE OR REPLACE FUNCTION mark_webhook_event_processed(
  p_event_id TEXT,
  p_event_type TEXT,
  p_payload JSONB DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  INSERT INTO stripe_webhook_events (stripe_event_id, event_type, payload)
  VALUES (p_event_id, p_event_type, p_payload)
  ON CONFLICT (stripe_event_id) DO NOTHING;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Get webhook event processing status
-- ============================================
CREATE OR REPLACE FUNCTION get_webhook_event_status(p_event_id TEXT)
RETURNS TABLE (
  processed BOOLEAN,
  event_type TEXT,
  processed_at TIMESTAMPTZ,
  payload JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    true AS processed,
    swe.event_type,
    swe.processed_at,
    swe.payload
  FROM stripe_webhook_events swe
  WHERE swe.stripe_event_id = p_event_id;

  -- If no row found, return false
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::JSONB;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Cleanup old webhook events (maintenance)
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_old_webhook_events()
RETURNS INTEGER AS $$
DECLARE
  rows_deleted INTEGER;
BEGIN
  DELETE FROM stripe_webhook_events
  WHERE created_at < NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS rows_deleted = ROW_COUNT;
  RETURN rows_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Get webhook processing statistics
-- ============================================
CREATE OR REPLACE FUNCTION get_webhook_processing_stats(
  p_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
  total_events INTEGER,
  events_by_type JSONB,
  oldest_event TIMESTAMPTZ,
  newest_event TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER AS total_events,

    -- Group by event type
    (
      SELECT jsonb_object_agg(event_type, cnt)
      FROM (
        SELECT event_type, COUNT(*) AS cnt
        FROM stripe_webhook_events
        WHERE created_at > NOW() - (p_hours || ' hours')::INTERVAL
        GROUP BY event_type
      ) type_counts
    ) AS events_by_type,

    MIN(created_at) AS oldest_event,
    MAX(created_at) AS newest_event

  FROM stripe_webhook_events
  WHERE created_at > NOW() - (p_hours || ' hours')::INTERVAL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION is_webhook_event_processed(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION mark_webhook_event_processed(TEXT, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION get_webhook_event_status(TEXT) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_webhook_events() TO service_role;
GRANT EXECUTE ON FUNCTION get_webhook_processing_stats(INTEGER) TO service_role, authenticated;

-- Comments
COMMENT ON TABLE stripe_webhook_events IS 'Tracks processed Stripe webhook events to ensure idempotency. Prevents duplicate processing when Stripe retries webhook delivery.';
COMMENT ON FUNCTION is_webhook_event_processed IS 'Check if a webhook event has already been processed. Returns true if event_id exists in table.';
COMMENT ON FUNCTION mark_webhook_event_processed IS 'Mark a webhook event as processed. Uses ON CONFLICT DO NOTHING for idempotency - safe to call multiple times.';
COMMENT ON FUNCTION get_webhook_event_status IS 'Get processing status and details for a specific webhook event.';
COMMENT ON FUNCTION cleanup_old_webhook_events IS 'Delete webhook event records older than 30 days. Call this periodically (daily cron job).';
COMMENT ON FUNCTION get_webhook_processing_stats IS 'Get webhook processing statistics for monitoring. Returns event counts by type for specified time period.';
