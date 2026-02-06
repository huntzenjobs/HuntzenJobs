-- =====================================================
-- Optimize Service Role RLS Policies
-- =====================================================
-- Issue: Policies using auth.jwt() ->> 'role' are not optimized
-- Solution: Replace with (select auth.jwt() ->> 'role') for better performance
-- =====================================================

-- =====================================================
-- 1. SUBSCRIPTION_PLANS - Optimize service_role policies
-- =====================================================

DROP POLICY IF EXISTS "Service role can delete plans" ON public.subscription_plans;
CREATE POLICY "Service role can delete plans"
  ON public.subscription_plans
  FOR DELETE
  USING ((select auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Service role can insert plans" ON public.subscription_plans;
CREATE POLICY "Service role can insert plans"
  ON public.subscription_plans
  FOR INSERT
  WITH CHECK ((select auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Service role can update plans" ON public.subscription_plans;
CREATE POLICY "Service role can update plans"
  ON public.subscription_plans
  FOR UPDATE
  USING ((select auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((select auth.jwt() ->> 'role') = 'service_role');

-- =====================================================
-- 2. USAGE_QUOTAS - Optimize service_role policies
-- =====================================================

DROP POLICY IF EXISTS "Service role can insert quotas" ON public.usage_quotas;
CREATE POLICY "Service role can insert quotas"
  ON public.usage_quotas
  FOR INSERT
  WITH CHECK ((select auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Service role can update quotas" ON public.usage_quotas;
CREATE POLICY "Service role can update quotas"
  ON public.usage_quotas
  FOR UPDATE
  USING ((select auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((select auth.jwt() ->> 'role') = 'service_role');

-- =====================================================
-- 3. USER_SUBSCRIPTIONS - Optimize service_role policies
-- =====================================================

DROP POLICY IF EXISTS "Service role can insert subscriptions" ON public.user_subscriptions;
CREATE POLICY "Service role can insert subscriptions"
  ON public.user_subscriptions
  FOR INSERT
  WITH CHECK ((select auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Service role can update subscriptions" ON public.user_subscriptions;
CREATE POLICY "Service role can update subscriptions"
  ON public.user_subscriptions
  FOR UPDATE
  USING ((select auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((select auth.jwt() ->> 'role') = 'service_role');

-- =====================================================
-- 4. CV_ANALYSES - Already optimized in migration 000013
-- =====================================================
-- The policy "Service role can update CV analysis" is already optimized

-- =====================================================
-- 5. SECURITY_EVENTS - Optimize all service_role policies
-- =====================================================

DROP POLICY IF EXISTS "Service role can delete security events" ON public.security_events;
CREATE POLICY "Service role can delete security events"
  ON public.security_events
  FOR DELETE
  USING ((select auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Service role can insert security events" ON public.security_events;
CREATE POLICY "Service role can insert security events"
  ON public.security_events
  FOR INSERT
  WITH CHECK ((select auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Service role can read all security events" ON public.security_events;
CREATE POLICY "Service role can read all security events"
  ON public.security_events
  FOR SELECT
  USING ((select auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Service role can update security events" ON public.security_events;
CREATE POLICY "Service role can update security events"
  ON public.security_events
  FOR UPDATE
  USING ((select auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((select auth.jwt() ->> 'role') = 'service_role');

-- =====================================================
-- 6. JOB_SEARCH_CACHE - Optimize service_role policy
-- =====================================================

DROP POLICY IF EXISTS "Service role manages job search cache" ON public.job_search_cache;
CREATE POLICY "Service role manages job search cache"
  ON public.job_search_cache
  FOR ALL
  USING ((select auth.jwt() ->> 'role') = 'service_role');

-- =====================================================
-- 7. RECRUITER_CACHE - Optimize service_role policy
-- =====================================================

DROP POLICY IF EXISTS "Service role manages recruiter cache" ON public.recruiter_cache;
CREATE POLICY "Service role manages recruiter cache"
  ON public.recruiter_cache
  FOR ALL
  USING ((select auth.jwt() ->> 'role') = 'service_role');

-- =====================================================
-- 8. USER_SESSIONS - Optimize service_role policy
-- =====================================================

DROP POLICY IF EXISTS "Service role manages user sessions" ON public.user_sessions;
CREATE POLICY "Service role manages user sessions"
  ON public.user_sessions
  FOR ALL
  USING ((select auth.jwt() ->> 'role') = 'service_role');

-- =====================================================
-- Migration Complete
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Service role policies optimized';
  RAISE NOTICE 'All policies now use (select auth.jwt() ->> ''role'') for better performance';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables optimized:';
  RAISE NOTICE '  - subscription_plans (3 policies)';
  RAISE NOTICE '  - usage_quotas (2 policies)';
  RAISE NOTICE '  - user_subscriptions (2 policies)';
  RAISE NOTICE '  - security_events (4 policies)';
  RAISE NOTICE '  - job_search_cache (1 policy)';
  RAISE NOTICE '  - recruiter_cache (1 policy)';
  RAISE NOTICE '  - user_sessions (1 policy)';
END $$;
