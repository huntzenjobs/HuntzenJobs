-- ============================================================================
-- DIAGNOSTIC ET FIX: Migrations manquantes causant erreur d'abonnement
-- ============================================================================
--
-- PROBLÈME: Frontend reçoit "Impossible de récupérer vos informations d'abonnement"
-- CAUSE: La fonction get_user_current_subscription() n'existe pas sur Supabase prod
-- SOLUTION: Appliquer les migrations manquantes
--
-- ============================================================================

-- ============================================================================
-- ÉTAPE 1: DIAGNOSTIC - Vérifier les fonctions manquantes
-- ============================================================================

SELECT '========================================' AS info;
SELECT 'DIAGNOSTIC: Fonctions RPC critiques' AS info;
SELECT '========================================' AS info;

SELECT
  routine_name,
  routine_type,
  'EXISTS ✅' AS status
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'get_user_current_subscription',
    'get_quota_status',
    'assign_free_plan_to_new_user',
    'increment_usage',
    'reset_quotas_rpc'
  )
UNION ALL
SELECT
  unnest(ARRAY[
    'get_user_current_subscription',
    'get_quota_status',
    'assign_free_plan_to_new_user',
    'increment_usage',
    'reset_quotas_rpc'
  ]) AS routine_name,
  'FUNCTION' AS routine_type,
  'MISSING ❌' AS status
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.routines
  WHERE routine_schema = 'public'
    AND routine_name = unnest
)
ORDER BY routine_name;

-- ============================================================================
-- ÉTAPE 2: Vérifier les tables critiques
-- ============================================================================

SELECT '========================================' AS info;
SELECT 'DIAGNOSTIC: Tables critiques' AS info;
SELECT '========================================' AS info;

SELECT
  table_name,
  'EXISTS ✅' AS status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'user_subscriptions',
    'subscription_plans',
    'usage_quotas',
    'stripe_webhook_events',
    'webhook_failures'
  )
ORDER BY table_name;

-- ============================================================================
-- ÉTAPE 3: Vérifier les vues
-- ============================================================================

SELECT '========================================' AS info;
SELECT 'DIAGNOSTIC: Vues critiques' AS info;
SELECT '========================================' AS info;

SELECT
  table_name AS view_name,
  'EXISTS ✅' AS status
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name = 'user_subscription_unified';

-- ============================================================================
-- ÉTAPE 4: FIX - Appliquer les migrations manquantes
-- ============================================================================
-- NOTE: Exécutez les fichiers de migration dans l'ordre suivant:
--
-- 1. supabase/migrations/20260128000000_subscription_infrastructure.sql
-- 2. supabase/migrations/20260128000100_quota_functions.sql
-- 3. supabase/migrations/20260210000001_deprecate_profiles_subscription.sql
-- 4. supabase/migrations/20260210000002_webhook_idempotency.sql
-- 5. supabase/migrations/20260210000003_stripe_price_config.sql
-- 6. supabase/migrations/20260211000002_auto_assign_free_plan.sql
--
-- ============================================================================

SELECT '========================================' AS info;
SELECT 'INSTRUCTIONS DE FIX' AS info;
SELECT '========================================' AS info;
SELECT 'Appliquez les migrations dans l''ordre chronologique depuis Supabase Dashboard:' AS instruction
UNION ALL
SELECT '1. Allez sur https://supabase.com/dashboard/project/[PROJECT_ID]/sql/new' AS instruction
UNION ALL
SELECT '2. Copiez le contenu de chaque migration SQL' AS instruction
UNION ALL
SELECT '3. Exécutez-les une par une dans l''ordre' AS instruction
UNION ALL
SELECT '4. Vérifiez que get_user_current_subscription() existe après' AS instruction;
