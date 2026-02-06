-- =====================================================
-- Check Current RLS Policies Status
-- =====================================================
-- This script checks for issues that cause linter warnings
-- Run this BEFORE applying migration 20 to see what needs fixing
-- =====================================================

-- =====================================================
-- 1. Check for duplicate permissive policies
-- =====================================================
DO $$
DECLARE
  v_table TEXT;
  v_role TEXT;
  v_cmd TEXT;
  v_count INTEGER;
  v_policies TEXT;
  v_total_issues INTEGER := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '1. DUPLICATE PERMISSIVE POLICIES CHECK';
  RAISE NOTICE '========================================';

  FOR v_table, v_role, v_cmd, v_count, v_policies IN
    SELECT
      p.tablename,
      rol.rolname,
      p.cmd,
      COUNT(*) as policy_count,
      string_agg(p.policyname, ', ' ORDER BY p.policyname) as policies
    FROM pg_policies p
    CROSS JOIN LATERAL unnest(
      CASE
        WHEN p.roles::text = '{}'::text THEN ARRAY['public']
        ELSE p.roles
      END
    ) AS rol(rolname)
    WHERE p.schemaname = 'public'
      AND p.permissive = 'PERMISSIVE'
    GROUP BY p.tablename, rol.rolname, p.cmd
    HAVING COUNT(*) > 1
    ORDER BY p.tablename, rol.rolname, p.cmd
  LOOP
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  Table: %', v_table;
    RAISE NOTICE '    Role: %, Action: %', v_role, v_cmd;
    RAISE NOTICE '    Duplicate policies (% total):', v_count;
    RAISE NOTICE '      %', v_policies;
    v_total_issues := v_total_issues + 1;
  END LOOP;

  IF v_total_issues = 0 THEN
    RAISE NOTICE '';
    RAISE NOTICE '✅ No duplicate permissive policies found!';
  ELSE
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  Total issues: % sets of duplicate policies', v_total_issues;
  END IF;

  RAISE NOTICE '';
END $$;

-- =====================================================
-- 2. Check service_role policies for missing TO clause
-- =====================================================
DO $$
DECLARE
  v_policy RECORD;
  v_has_issues BOOLEAN := false;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '2. SERVICE_ROLE POLICIES WITHOUT TO CLAUSE';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Policies that check service_role but apply to all roles:';
  RAISE NOTICE '';

  FOR v_policy IN
    SELECT
      schemaname,
      tablename,
      policyname,
      roles,
      qual as using_clause
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        qual LIKE '%service_role%'
        OR with_check LIKE '%service_role%'
      )
      AND (
        roles = '{}'
        OR 'anon' = ANY(roles)
        OR 'authenticated' = ANY(roles)
      )
    ORDER BY tablename, policyname
  LOOP
    v_has_issues := true;
    RAISE NOTICE '⚠️  %.% - "%"', v_policy.schemaname, v_policy.tablename, v_policy.policyname;
    RAISE NOTICE '    Applies to roles: %', v_policy.roles;
    RAISE NOTICE '    USING: %', left(v_policy.using_clause, 100);
    RAISE NOTICE '';
  END LOOP;

  IF NOT v_has_issues THEN
    RAISE NOTICE '✅ All service_role policies have correct TO clause!';
    RAISE NOTICE '';
  END IF;
END $$;

-- =====================================================
-- 3. Check for policies using auth functions without InitPlan
-- =====================================================
DO $$
DECLARE
  v_policy RECORD;
  v_has_issues BOOLEAN := false;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '3. AUTH FUNCTIONS WITHOUT INITPLAN';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Policies that may not use InitPlan optimization:';
  RAISE NOTICE '(Looking for auth.uid() or auth.jwt() without subquery)';
  RAISE NOTICE '';

  FOR v_policy IN
    SELECT
      schemaname,
      tablename,
      policyname,
      cmd as action,
      qual as using_clause
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        -- Has auth.uid() but not wrapped in (select ...)
        (qual LIKE '%auth.uid()%' AND qual NOT LIKE '%(select auth.uid())%')
        OR
        -- Has auth.jwt() but not wrapped in (select ...)
        (qual LIKE '%auth.jwt()%' AND qual NOT LIKE '%(select auth.jwt()%')
      )
    ORDER BY tablename, policyname
  LOOP
    v_has_issues := true;
    RAISE NOTICE '⚠️  %.% - "%"', v_policy.schemaname, v_policy.tablename, v_policy.policyname;
    RAISE NOTICE '    Action: %', v_policy.action;
    RAISE NOTICE '    USING: %', left(v_policy.using_clause, 100);
    RAISE NOTICE '';
  END LOOP;

  IF NOT v_has_issues THEN
    RAISE NOTICE '✅ All policies use InitPlan optimization!';
    RAISE NOTICE '';
  END IF;
END $$;

-- =====================================================
-- 4. Summary of policies per table
-- =====================================================
DO $$
DECLARE
  v_table RECORD;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '4. POLICY COUNT BY TABLE';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';

  FOR v_table IN
    SELECT
      tablename,
      COUNT(*) as total_policies,
      COUNT(*) FILTER (WHERE permissive = 'PERMISSIVE') as permissive_count,
      COUNT(*) FILTER (WHERE permissive = 'RESTRICTIVE') as restrictive_count
    FROM pg_policies
    WHERE schemaname = 'public'
    GROUP BY tablename
    ORDER BY tablename
  LOOP
    RAISE NOTICE '% : % policies (% permissive, % restrictive)',
      v_table.tablename,
      v_table.total_policies,
      v_table.permissive_count,
      v_table.restrictive_count;
  END LOOP;

  RAISE NOTICE '';
END $$;

-- =====================================================
-- 5. List all policies by table
-- =====================================================
\echo ''
\echo '========================================'
\echo '5. DETAILED POLICY LIST'
\echo '========================================'
\echo ''

SELECT
  tablename,
  policyname,
  cmd as action,
  CASE
    WHEN roles::text = '{}'::text THEN 'ALL'
    ELSE array_to_string(roles, ', ')
  END as applies_to_roles,
  permissive,
  left(qual, 80) as using_clause
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;
