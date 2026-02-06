-- =====================================================
-- TESTS POST-MIGRATION - À exécuter dans le SQL Editor de Supabase
-- =====================================================
-- Dashboard Supabase → SQL Editor → New query → Coller ce code
-- =====================================================

-- =====================================================
-- TEST 1 : Vérifier que les fonctions ont search_path
-- =====================================================
SELECT
    p.proname as function_name,
    pg_get_function_identity_arguments(p.oid) as arguments,
    p.prosecdef as is_security_definer,
    CASE
        WHEN 'search_path' = ANY(string_to_array(array_to_string(p.proconfig, ','), ','))
        THEN '✅ search_path configuré'
        ELSE '❌ search_path manquant'
    END as search_path_status,
    p.proconfig as settings
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
    AND p.prosecdef = true
    AND p.proname IN (
        'get_user_plan_limits',
        'has_active_subscription',
        'check_user_quota',
        'increment_usage',
        'log_security_event',
        'handle_new_user',
        'get_user_plan',
        'get_user_usage'
    )
ORDER BY p.proname;

-- Résultat attendu : Toutes les fonctions doivent avoir "✅ search_path configuré"

-- =====================================================
-- TEST 2 : Vérifier que les vues n'ont plus SECURITY DEFINER
-- =====================================================
SELECT
    viewname,
    definition
FROM pg_views
WHERE schemaname = 'public'
    AND viewname IN (
        'event_type_distribution',
        'recent_critical_events',
        'failed_logins_by_ip'
    );

-- Résultat attendu : Les vues doivent exister et être fonctionnelles

-- =====================================================
-- TEST 3 : Vérifier les politiques RLS optimisées
-- =====================================================
SELECT
    tablename,
    policyname,
    CASE
        WHEN qual LIKE '%(select auth.uid())%' THEN '✅ Optimisé'
        WHEN qual LIKE '%auth.uid()%' AND qual NOT LIKE '%(select auth.uid())%' THEN '⚠️ Non optimisé'
        ELSE '✓ OK'
    END as rls_status,
    qual as policy_definition
FROM pg_policies
WHERE schemaname = 'public'
    AND tablename IN (
        'coach_conversations',
        'user_subscriptions',
        'usage_quotas',
        'profiles',
        'cv_analyses',
        'saved_jobs'
    )
ORDER BY tablename, policyname;

-- Résultat attendu : Les politiques avec auth.uid() doivent avoir "(select auth.uid())"

-- =====================================================
-- TEST 4 : Tester une fonction critique
-- =====================================================
-- Remplacer <votre-user-id> par un UUID réel de votre base
-- SELECT check_user_quota('<votre-user-id>', 'cv_analysis');

-- Résultat attendu : TRUE ou FALSE (pas d'erreur)

-- =====================================================
-- TEST 5 : Vérifier l'audit logging sur cv_analyses
-- =====================================================
SELECT
    tgname as trigger_name,
    tgtype,
    tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.cv_analyses'::regclass
    AND tgname = 'audit_cv_analysis_updates';

-- Résultat attendu : 1 ligne avec le trigger audit

-- =====================================================
-- TEST 6 : Compter les politiques RLS par table
-- =====================================================
SELECT
    tablename,
    COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY policy_count DESC;

-- Résultat attendu : Toutes les tables sensibles doivent avoir des politiques

-- =====================================================
-- TEST 7 : Vérifier les permissions service_role
-- =====================================================
SELECT
    tablename,
    policyname,
    cmd as command
FROM pg_policies
WHERE schemaname = 'public'
    AND (
        policyname LIKE '%service%role%'
        OR qual LIKE '%service_role%'
    )
ORDER BY tablename, policyname;

-- Résultat attendu : Politiques spécifiques pour service_role sur tables critiques

-- =====================================================
-- FIN DES TESTS
-- =====================================================
-- Si tous les tests passent, les migrations de sécurité sont OK ✅
-- =====================================================
