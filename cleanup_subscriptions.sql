-- Cleanup orphaned subscriptions for user
-- Only keep the one matching current Stripe subscription

BEGIN;

-- Show current state BEFORE cleanup
SELECT
  stripe_subscription_id,
  plan_id,
  status,
  stripe_price_id,
  created_at,
  (SELECT name FROM subscription_plans WHERE id = plan_id) as plan_name
FROM user_subscriptions
WHERE user_id = '3abda780-30fb-46c8-a5c3-5bfa7938d688'
ORDER BY created_at DESC;

-- Mark all subscriptions as cancelled EXCEPT the one matching Stripe
UPDATE user_subscriptions
SET
  status = 'cancelled',
  cancelled_at = NOW(),
  updated_at = NOW()
WHERE user_id = '3abda780-30fb-46c8-a5c3-5bfa7938d688'
  AND stripe_subscription_id != 'sub_1Sz219F7q8KRoF9a668xLgT0'
  AND status = 'active';

-- Show state AFTER cleanup
SELECT
  stripe_subscription_id,
  plan_id,
  status,
  stripe_price_id,
  created_at,
  (SELECT name FROM subscription_plans WHERE id = plan_id) as plan_name
FROM user_subscriptions
WHERE user_id = '3abda780-30fb-46c8-a5c3-5bfa7938d688'
ORDER BY created_at DESC;

-- Verify RPC returns correct plan
SELECT * FROM get_user_current_subscription('3abda780-30fb-46c8-a5c3-5bfa7938d688');

COMMIT;
