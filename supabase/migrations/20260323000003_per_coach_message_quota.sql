-- ============================================
-- PER-COACH MESSAGE QUOTA
-- ============================================
-- Purpose: Track assistant messages per coach type (not global).
-- Each coach has its own limit (e.g., 10 messages/day per coach for free plan).
-- 5 coaches × 10 = 50 messages total, but each coach is independent.
--
-- Changes:
--   1. Add assistant_messages_by_coach JSONB column to usage_quotas
--   2. Create increment_coach_message() RPC
--   3. Create check_coach_message_quota() RPC
-- ============================================

-- 1. Add JSONB column for per-coach tracking
ALTER TABLE usage_quotas
  ADD COLUMN IF NOT EXISTS assistant_messages_by_coach JSONB DEFAULT '{}';

-- 2. RPC: Increment message count for a specific coach
CREATE OR REPLACE FUNCTION increment_coach_message(
  p_user_id UUID,
  p_coach_type TEXT,
  p_amount INTEGER DEFAULT 1
) RETURNS BOOLEAN AS $$
BEGIN
  -- Upsert the usage_quotas row for today
  INSERT INTO usage_quotas (user_id, quota_date, assistant_messages_used, assistant_messages_by_coach)
  VALUES (
    p_user_id,
    CURRENT_DATE,
    p_amount,
    jsonb_build_object(p_coach_type, p_amount)
  )
  ON CONFLICT (user_id, quota_date) DO UPDATE SET
    -- Increment global counter
    assistant_messages_used = usage_quotas.assistant_messages_used + p_amount,
    -- Increment per-coach counter
    assistant_messages_by_coach = jsonb_set(
      COALESCE(usage_quotas.assistant_messages_by_coach, '{}'),
      ARRAY[p_coach_type],
      to_jsonb(
        COALESCE((usage_quotas.assistant_messages_by_coach ->> p_coach_type)::integer, 0) + p_amount
      )
    ),
    updated_at = NOW();

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_coach_message(UUID, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_coach_message(UUID, TEXT, INTEGER) TO service_role;

-- 3. RPC: Check if a specific coach has quota remaining
CREATE OR REPLACE FUNCTION check_coach_message_quota(
  p_user_id UUID,
  p_coach_type TEXT
) RETURNS TABLE (
  coach_type TEXT,
  quota_limit INTEGER,
  quota_used INTEGER,
  quota_remaining INTEGER,
  has_access BOOLEAN
) AS $$
DECLARE
  v_limit INTEGER;
  v_used INTEGER;
  v_custom_limit INTEGER;
BEGIN
  -- Get the per-coach limit from the user's plan (assistant_messages = per-coach limit)
  SELECT
    COALESCE(
      (us.custom_limits->>'assistant_messages')::integer,
      (sp.limits->>'assistant_messages')::integer,
      10
    ) INTO v_limit
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = p_user_id
    AND us.status = 'active'
    AND us.current_period_end > NOW()
  ORDER BY us.created_at DESC
  LIMIT 1;

  -- Fallback to free plan if no active subscription
  IF v_limit IS NULL THEN
    SELECT (sp.limits->>'assistant_messages')::integer INTO v_limit
    FROM subscription_plans sp
    WHERE sp.name = 'free'
    LIMIT 1;
    v_limit := COALESCE(v_limit, 10);
  END IF;

  -- Get usage for this specific coach today
  SELECT COALESCE(
    (uq.assistant_messages_by_coach ->> p_coach_type)::integer,
    0
  ) INTO v_used
  FROM usage_quotas uq
  WHERE uq.user_id = p_user_id
    AND uq.quota_date = CURRENT_DATE;

  v_used := COALESCE(v_used, 0);

  RETURN QUERY SELECT
    p_coach_type,
    v_limit,
    v_used,
    CASE WHEN v_limit = -1 THEN -1 ELSE GREATEST(0, v_limit - v_used) END,
    CASE WHEN v_limit = -1 THEN TRUE ELSE v_used < v_limit END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION check_coach_message_quota(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION check_coach_message_quota(UUID, TEXT) TO service_role;
