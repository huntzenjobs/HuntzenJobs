-- ============================================
-- DEBUG: Vérifier l'abonnement de l'utilisateur
-- ============================================
-- User ID: 3abda780-30fb-46c8-a5c3-5bfa7938d688

-- 1. Vérifier toutes les subscriptions actives (SANS ORDER BY)
SELECT
  us.id,
  us.status,
  us.created_at,
  sp.name AS plan_name,
  sp.display_name,
  sp.sort_order,
  us.current_period_end,
  (us.current_period_end > NOW()) AS is_still_valid
FROM user_subscriptions us
JOIN subscription_plans sp ON us.plan_id = sp.id
WHERE us.user_id = '3abda780-30fb-46c8-a5c3-5bfa7938d688'
  AND us.status = 'active';

-- 2. Tester la fonction RPC get_user_current_subscription
SELECT * FROM get_user_current_subscription('3abda780-30fb-46c8-a5c3-5bfa7938d688');

-- 3. Vérifier la vue user_subscription_unified
SELECT
  plan_name,
  plan_display_name,
  subscription_status,
  stripe_subscription_id,
  current_period_end
FROM user_subscription_unified
WHERE user_id = '3abda780-30fb-46c8-a5c3-5bfa7938d688';

-- 4. Vérifier le sort_order des plans (pour comprendre la priorité)
SELECT id, name, display_name, sort_order
FROM subscription_plans
ORDER BY sort_order DESC;
