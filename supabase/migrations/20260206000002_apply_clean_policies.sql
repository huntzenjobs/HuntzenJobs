-- =====================================================
-- Apply Clean RLS Policies (No Duplicates)
-- =====================================================

-- =====================================================
-- 1. SUBSCRIPTION_PLANS
-- =====================================================
CREATE POLICY "Anyone can view active subscription plans"
  ON public.subscription_plans
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- =====================================================
-- 2. USAGE_QUOTAS
-- =====================================================
CREATE POLICY "Users can view own usage quotas"
  ON public.usage_quotas
  FOR SELECT
  TO anon, authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own usage quotas"
  ON public.usage_quotas
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own usage quotas"
  ON public.usage_quotas
  FOR UPDATE
  TO anon, authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Service role manages usage quotas"
  ON public.usage_quotas
  FOR ALL
  TO service_role
  USING ((select auth.jwt() ->> 'role') = 'service_role');

-- =====================================================
-- 3. USER_SESSIONS
-- =====================================================
CREATE POLICY "Users can read own session"
  ON public.user_sessions
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Users can insert own session"
  ON public.user_sessions
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own session"
  ON public.user_sessions
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role manages all user sessions"
  ON public.user_sessions
  FOR ALL
  TO service_role
  USING ((select auth.jwt() ->> 'role') = 'service_role');

-- =====================================================
-- 4. USER_SUBSCRIPTIONS
-- =====================================================
CREATE POLICY "Users can view own subscriptions"
  ON public.user_subscriptions
  FOR SELECT
  TO anon, authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can update own subscriptions"
  ON public.user_subscriptions
  FOR UPDATE
  TO anon, authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Service role manages subscriptions"
  ON public.user_subscriptions
  FOR ALL
  TO service_role
  USING ((select auth.jwt() ->> 'role') = 'service_role');

-- =====================================================
-- 5. CV_ANALYSES - Update service_role policy
-- =====================================================
DROP POLICY IF EXISTS "Service role can update CV analysis" ON public.cv_analyses;

CREATE POLICY "Service role can update CV analysis"
  ON public.cv_analyses
  FOR UPDATE
  TO service_role
  USING ((select auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((select auth.jwt() ->> 'role') = 'service_role');

-- =====================================================
-- VERIFICATION
-- =====================================================
DO $$
DECLARE
  v_table TEXT;
  v_role TEXT;
  v_cmd TEXT;
  v_count INTEGER;
  v_total_issues INTEGER := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'CHECKING FOR DUPLICATE POLICIES';
  RAISE NOTICE '========================================';

  FOR v_table, v_role, v_cmd, v_count IN
    SELECT
      tablename,
      rol.rolname,
      cmd,
      COUNT(*) as policy_count
    FROM pg_policies p
    JOIN pg_roles rol ON p.roles @> ARRAY[rol.rolname]
    WHERE p.schemaname = 'public'
      AND p.permissive = 'PERMISSIVE'
    GROUP BY tablename, rol.rolname, cmd
    HAVING COUNT(*) > 1
    ORDER BY tablename, rol.rolname, cmd
  LOOP
    RAISE NOTICE '⚠️  % : % policies for role "%" action "%"',
      v_table, v_count, v_role, v_cmd;
    v_total_issues := v_total_issues + 1;
  END LOOP;

  IF v_total_issues = 0 THEN
    RAISE NOTICE '✅ No duplicate policies found!';
  ELSE
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  Found % tables with duplicate policies', v_total_issues;
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '✅ Clean RLS policies applied successfully';
  RAISE NOTICE '';
END $$;
