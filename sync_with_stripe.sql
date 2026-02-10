-- SYNC MANUEL: Mettre à jour la DB avec les vraies données de Stripe
-- Stripe dit: sub_1Sz219F7q8KRoF9a668xLgT0 = Pro Monthly
-- DB dit: sub_1SwoSHF7q8KRoF9a6QovhsDp = Premium (FAUX!)

BEGIN;

-- Récupérer le plan_id de "pro"
DO $$
DECLARE
  v_pro_plan_id UUID;
  v_user_id UUID := '3abda780-30fb-46c8-a5c3-5bfa7938d688';
BEGIN
  -- Get pro plan ID
  SELECT id INTO v_pro_plan_id
  FROM subscription_plans
  WHERE name = 'pro';

  -- Update the subscription with correct Stripe data
  UPDATE user_subscriptions
  SET
    stripe_subscription_id = 'sub_1Sz219F7q8KRoF9a668xLgT0',
    plan_id = v_pro_plan_id,
    stripe_price_id = 'price_1SwkeQF7q8KRoF9azQdPo1o6',  -- Pro Monthly price
    updated_at = NOW()
  WHERE user_id = v_user_id
    AND status = 'active';

  RAISE NOTICE 'Subscription synced with Stripe!';
END $$;

-- Vérifier le résultat
SELECT
  stripe_subscription_id,
  status,
  (SELECT name FROM subscription_plans WHERE id = plan_id) as plan_name,
  stripe_price_id,
  updated_at
FROM user_subscriptions
WHERE user_id = '3abda780-30fb-46c8-a5c3-5bfa7938d688';

-- Vérifier que la RPC retourne "pro"
SELECT * FROM get_user_current_subscription('3abda780-30fb-46c8-a5c3-5bfa7938d688');

COMMIT;
