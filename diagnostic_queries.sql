-- ============================================================================
-- DIAGNOSTIC QUERIES - Synchronisation Stripe/Supabase HuntZen
-- ============================================================================
--
-- INSTRUCTIONS:
-- 1. Exécuter ces queries dans Supabase SQL Editor
-- 2. Capturer les résultats de chaque query
-- 3. Toutes les queries devraient retourner 0 lignes si données sont propres
-- 4. Si > 0 lignes, noter le nombre d'incohérences pour chaque type
--
-- ============================================================================

-- ============================================================================
-- QUERY 1: Users avec subscriptions multiples actives
-- ============================================================================
-- Attendu: 0 lignes (contrainte UNIQUE devrait empêcher)
-- Si > 0: BUG-CRIT-04 confirmé en production

SELECT
  us.user_id,
  COUNT(*) as active_count,
  array_agg(sp.name) as plans,
  array_agg(us.id::text) as subscription_ids,
  array_agg(us.created_at) as created_dates
FROM user_subscriptions us
JOIN subscription_plans sp ON us.plan_id = sp.id
WHERE us.status = 'active'
GROUP BY us.user_id
HAVING COUNT(*) > 1
ORDER BY active_count DESC;

-- ============================================================================
-- QUERY 2: Subscriptions orphelines (sans stripe_subscription_id)
-- ============================================================================
-- Attendu: 0 lignes (plans payants doivent avoir stripe_subscription_id)
-- Si > 0: Subscriptions créées manuellement ou webhook incomplet

SELECT
  us.id,
  us.user_id,
  sp.name,
  us.status,
  us.stripe_subscription_id,
  us.created_at,
  us.updated_at
FROM user_subscriptions us
JOIN subscription_plans sp ON us.plan_id = sp.id
WHERE us.status = 'active'
  AND (us.stripe_subscription_id IS NULL OR us.stripe_subscription_id = '')
  AND sp.name != 'free'
ORDER BY us.created_at DESC;

-- ============================================================================
-- QUERY 3: Subscriptions expirées toujours "active"
-- ============================================================================
-- Attendu: 0 lignes (webhooks devraient cancel auto)
-- Si > 0: Webhooks manqués ou échoués

SELECT
  us.id,
  us.user_id,
  sp.name,
  us.current_period_end,
  NOW() - us.current_period_end as expired_since,
  us.stripe_subscription_id
FROM user_subscriptions us
JOIN subscription_plans sp ON us.plan_id = sp.id
WHERE us.status = 'active'
  AND us.current_period_end < NOW()
  AND sp.name != 'free'
ORDER BY us.current_period_end ASC;

-- ============================================================================
-- QUERY 4: Incohérence profiles vs user_subscriptions
-- ============================================================================
-- Attendu: 0 lignes (sync parfaite)
-- Si > 0: Confirme BUG-CRIT-05 (double source de vérité)

SELECT
  p.id as user_id,
  p.email,
  p.subscription_tier as profile_tier,
  COALESCE(sp.name, 'NO_SUBSCRIPTION') as actual_plan,
  p.updated_at as profile_updated,
  us.updated_at as subscription_updated
FROM profiles p
LEFT JOIN user_subscriptions us ON p.id = us.user_id AND us.status = 'active'
LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
WHERE p.subscription_tier IS DISTINCT FROM COALESCE(sp.name, 'free')
ORDER BY p.updated_at DESC;

-- ============================================================================
-- QUERY 5: État du user affecté spécifiquement
-- ============================================================================
-- Objectif: Voir l'historique complet des subscriptions du user affecté

SELECT
  us.id,
  sp.name as plan,
  us.status,
  us.stripe_subscription_id,
  us.stripe_price_id,
  us.current_period_start,
  us.current_period_end,
  us.cancel_at_period_end,
  us.cancelled_at,
  us.created_at,
  us.updated_at
FROM user_subscriptions us
JOIN subscription_plans sp ON us.plan_id = sp.id
WHERE us.user_id = '3abda780-30fb-46c8-a5c3-5bfa7938d688'
ORDER BY us.created_at DESC;

-- ============================================================================
-- QUERY 6: Vérifier table stripe_prices
-- ============================================================================
-- Objectif: Confirmer que les prix DB matchent Stripe

SELECT
  sp.name as plan,
  sp.sort_order,
  spr.billing_period,
  spr.stripe_price_id,
  spr.is_active
FROM stripe_prices spr
JOIN subscription_plans sp ON spr.plan_id = sp.id
ORDER BY sp.sort_order, spr.billing_period;

-- ============================================================================
-- QUERY 7: Webhook failures récents (7 derniers jours)
-- ============================================================================
-- Objectif: Identifier patterns d'échecs webhook

SELECT
  stripe_event_id,
  event_type,
  error_message,
  retry_count,
  first_attempt_at,
  last_attempt_at,
  resolved
FROM webhook_failures
WHERE first_attempt_at > NOW() - INTERVAL '7 days'
ORDER BY first_attempt_at DESC
LIMIT 20;

-- ============================================================================
-- QUERY BONUS: Statistiques globales
-- ============================================================================

SELECT
  'Total Active Subscriptions' as metric,
  COUNT(*) as count
FROM user_subscriptions
WHERE status = 'active'

UNION ALL

SELECT
  'By Plan: ' || sp.name as metric,
  COUNT(*) as count
FROM user_subscriptions us
JOIN subscription_plans sp ON us.plan_id = sp.id
WHERE us.status = 'active'
GROUP BY sp.name

UNION ALL

SELECT
  'Cancelled Subscriptions' as metric,
  COUNT(*) as count
FROM user_subscriptions
WHERE status = 'cancelled'

UNION ALL

SELECT
  'Webhook Events (last 30 days)' as metric,
  COUNT(*) as count
FROM stripe_webhook_events
WHERE created_at > NOW() - INTERVAL '30 days'

UNION ALL

SELECT
  'Webhook Failures (unresolved)' as metric,
  COUNT(*) as count
FROM webhook_failures
WHERE resolved = false;

-- ============================================================================
-- FIN DES QUERIES DIAGNOSTIQUES
-- ============================================================================
