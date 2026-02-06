-- =====================================================
-- Optimize RLS Policies (Performance Fix)
-- https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan
-- =====================================================
-- Issue: Using auth.uid() directly in RLS causes it to be re-evaluated for each row
-- Solution: Wrap in subquery (select auth.uid()) to evaluate once per query
-- Performance Impact: Significant improvement on queries returning many rows
-- =====================================================

-- =====================================================
-- COACH_CONVERSATIONS TABLE
-- =====================================================

DROP POLICY IF EXISTS "Users can view own conversations" ON coach_conversations;
CREATE POLICY "Users can view own conversations"
  ON coach_conversations
  FOR SELECT
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own conversations" ON coach_conversations;
CREATE POLICY "Users can insert own conversations"
  ON coach_conversations
  FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own conversations" ON coach_conversations;
CREATE POLICY "Users can update own conversations"
  ON coach_conversations
  FOR UPDATE
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own conversations" ON coach_conversations;
CREATE POLICY "Users can delete own conversations"
  ON coach_conversations
  FOR DELETE
  USING (user_id = (select auth.uid()));

-- Also update legacy policies if they exist
DROP POLICY IF EXISTS "Users can view own coach conversations" ON coach_conversations;
DROP POLICY IF EXISTS "Users can insert own coach conversations" ON coach_conversations;
DROP POLICY IF EXISTS "Users can update own coach conversations" ON coach_conversations;
DROP POLICY IF EXISTS "Users can delete own coach conversations" ON coach_conversations;

-- =====================================================
-- USER_SUBSCRIPTIONS TABLE
-- =====================================================

DROP POLICY IF EXISTS "Users can view own subscriptions" ON user_subscriptions;
CREATE POLICY "Users can view own subscriptions"
  ON user_subscriptions
  FOR SELECT
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "user_subscriptions_own_read" ON user_subscriptions;
CREATE POLICY "user_subscriptions_own_read"
  ON user_subscriptions
  FOR SELECT
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "user_subscriptions_own_update" ON user_subscriptions;
CREATE POLICY "user_subscriptions_own_update"
  ON user_subscriptions
  FOR UPDATE
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- =====================================================
-- USAGE_QUOTAS TABLE
-- =====================================================

DROP POLICY IF EXISTS "Users can view own usage" ON usage_quotas;
CREATE POLICY "Users can view own usage"
  ON usage_quotas
  FOR SELECT
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "usage_quotas_own_read" ON usage_quotas;
CREATE POLICY "usage_quotas_own_read"
  ON usage_quotas
  FOR SELECT
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "usage_quotas_own_insert" ON usage_quotas;
CREATE POLICY "usage_quotas_own_insert"
  ON usage_quotas
  FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "usage_quotas_own_update" ON usage_quotas;
CREATE POLICY "usage_quotas_own_update"
  ON usage_quotas
  FOR UPDATE
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- =====================================================
-- PROFILES TABLE
-- =====================================================

DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile"
  ON profiles
  FOR SELECT
  USING (id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  USING (id = (select auth.uid()))
  WITH CHECK (
    id = (select auth.uid())
    AND subscription_tier = (SELECT subscription_tier FROM profiles WHERE id = (select auth.uid()))
    AND cv_analyses_limit = (SELECT cv_analyses_limit FROM profiles WHERE id = (select auth.uid()))
    AND coach_messages_limit = (SELECT coach_messages_limit FROM profiles WHERE id = (select auth.uid()))
    AND job_searches_limit = (SELECT job_searches_limit FROM profiles WHERE id = (select auth.uid()))
  );

-- =====================================================
-- CV_ANALYSES TABLE
-- =====================================================

-- Authenticated user policies
DROP POLICY IF EXISTS "Users can view own cv analyses" ON cv_analyses;
CREATE POLICY "Users can view own cv analyses"
  ON cv_analyses
  FOR SELECT
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read own CV analyses" ON cv_analyses;
CREATE POLICY "Authenticated users can read own CV analyses"
  ON cv_analyses
  FOR SELECT
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own cv analyses" ON cv_analyses;
CREATE POLICY "Users can insert own cv analyses"
  ON cv_analyses
  FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can insert own CV analyses" ON cv_analyses;
CREATE POLICY "Authenticated users can insert own CV analyses"
  ON cv_analyses
  FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own cv analyses" ON cv_analyses;
CREATE POLICY "Users can update own cv analyses"
  ON cv_analyses
  FOR UPDATE
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own CV analyses" ON cv_analyses;
CREATE POLICY "Users can delete own CV analyses"
  ON cv_analyses
  FOR DELETE
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can delete own CV analyses" ON cv_analyses;
CREATE POLICY "Authenticated users can delete own CV analyses"
  ON cv_analyses
  FOR DELETE
  USING (user_id = (select auth.uid()));

-- =====================================================
-- SAVED_JOBS TABLE
-- =====================================================

DROP POLICY IF EXISTS "Users can view their own saved jobs" ON saved_jobs;
CREATE POLICY "Users can view their own saved jobs"
  ON saved_jobs
  FOR SELECT
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert their own saved jobs" ON saved_jobs;
CREATE POLICY "Users can insert their own saved jobs"
  ON saved_jobs
  FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update their own saved jobs" ON saved_jobs;
CREATE POLICY "Users can update their own saved jobs"
  ON saved_jobs
  FOR UPDATE
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete their own saved jobs" ON saved_jobs;
CREATE POLICY "Users can delete their own saved jobs"
  ON saved_jobs
  FOR DELETE
  USING (user_id = (select auth.uid()));

-- =====================================================
-- JOB_SEARCHES TABLE (if exists)
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'job_searches') THEN
    DROP POLICY IF EXISTS "Users can view own job searches" ON job_searches;
    CREATE POLICY "Users can view own job searches"
      ON job_searches
      FOR SELECT
      USING (user_id = (select auth.uid()));

    DROP POLICY IF EXISTS "Users can insert own job searches" ON job_searches;
    CREATE POLICY "Users can insert own job searches"
      ON job_searches
      FOR INSERT
      WITH CHECK (user_id = (select auth.uid()));

    DROP POLICY IF EXISTS "Users can update own job searches" ON job_searches;
    CREATE POLICY "Users can update own job searches"
      ON job_searches
      FOR UPDATE
      USING (user_id = (select auth.uid()));
  END IF;
END $$;

-- =====================================================
-- SECURITY_EVENTS TABLE
-- =====================================================

DROP POLICY IF EXISTS "Users can read own security events" ON security_events;
CREATE POLICY "Users can read own security events"
  ON security_events
  FOR SELECT
  USING (user_id = (select auth.uid()));

-- =====================================================
-- COACH_CONVERSATION_METADATA TABLE (if exists)
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'coach_conversation_metadata') THEN
    DROP POLICY IF EXISTS "Users can view own conversation metadata" ON coach_conversation_metadata;
    CREATE POLICY "Users can view own conversation metadata"
      ON coach_conversation_metadata
      FOR SELECT
      USING (
        (select auth.uid()) = (
          SELECT user_id FROM coach_conversations WHERE id = conversation_id
        )
      );

    DROP POLICY IF EXISTS "Users can insert own conversation metadata" ON coach_conversation_metadata;
    CREATE POLICY "Users can insert own conversation metadata"
      ON coach_conversation_metadata
      FOR INSERT
      WITH CHECK (
        (select auth.uid()) = (
          SELECT user_id FROM coach_conversations WHERE id = conversation_id
        )
      );

    DROP POLICY IF EXISTS "Users can update own conversation metadata" ON coach_conversation_metadata;
    CREATE POLICY "Users can update own conversation metadata"
      ON coach_conversation_metadata
      FOR UPDATE
      USING (
        (select auth.uid()) = (
          SELECT user_id FROM coach_conversations WHERE id = conversation_id
        )
      );
  END IF;
END $$;

-- =====================================================
-- STORAGE POLICIES
-- =====================================================

-- CVs bucket
DROP POLICY IF EXISTS "Users can upload own CV" ON storage.objects;
CREATE POLICY "Users can upload own CV"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'cvs' AND
    (storage.foldername(name))[1] = (select auth.uid())::text
  );

DROP POLICY IF EXISTS "Users can read own CV" ON storage.objects;
CREATE POLICY "Users can read own CV"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'cvs' AND
    (storage.foldername(name))[1] = (select auth.uid())::text
  );

DROP POLICY IF EXISTS "Users can delete own CV" ON storage.objects;
CREATE POLICY "Users can delete own CV"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'cvs' AND
    (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Avatars bucket
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
CREATE POLICY "Users can upload own avatar"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = (select auth.uid())::text
  );

DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
CREATE POLICY "Users can update own avatar"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = (select auth.uid())::text
  );

DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
CREATE POLICY "Users can delete own avatar"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- =====================================================
-- Migration Complete
-- =====================================================
-- All RLS policies now use (select auth.uid()) instead of auth.uid()
-- This causes auth.uid() to be evaluated once per query (InitPlan)
-- instead of once per row (SubPlan), dramatically improving performance
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ RLS policies optimized';
  RAISE NOTICE 'Changed auth.uid() to (select auth.uid()) in 30+ policies';
  RAISE NOTICE 'Expected performance improvement: 10-100x on large result sets';
END $$;
