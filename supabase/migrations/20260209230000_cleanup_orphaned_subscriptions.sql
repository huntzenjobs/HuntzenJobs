-- Cleanup orphaned active subscriptions
-- Problem: Multiple 'active' subscriptions per user due to failed plan change logic
-- Solution: Keep only the most recent subscription, mark others as 'cancelled'

BEGIN;

-- Mark all old active subscriptions as cancelled, keeping only the most recent per user
WITH ranked_subscriptions AS (
  SELECT
    id,
    user_id,
    stripe_subscription_id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY updated_at DESC, created_at DESC
    ) as rn
  FROM user_subscriptions
  WHERE status = 'active'
)
UPDATE user_subscriptions us
SET
  status = 'canceled',
  updated_at = NOW()
FROM ranked_subscriptions rs
WHERE us.id = rs.id
  AND rs.rn > 1  -- Keep only the most recent (rn=1)
  AND us.status = 'active';

-- Log the cleanup
DO $$
DECLARE
  affected_count INTEGER;
BEGIN
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RAISE NOTICE 'Cleaned up % orphaned subscriptions', affected_count;
END $$;

-- Verify: Show remaining active subscriptions per user
SELECT
  user_id,
  COUNT(*) as active_count,
  STRING_AGG(stripe_subscription_id, ', ') as subscription_ids
FROM user_subscriptions
WHERE status = 'active'
GROUP BY user_id
HAVING COUNT(*) > 1;

COMMIT;

-- Post-migration note:
COMMENT ON TABLE user_subscriptions IS 'Subscription data. Cleanup migration 20260209230000 removed orphaned active subscriptions caused by failed plan change logic.';
