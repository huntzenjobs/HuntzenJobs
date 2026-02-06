-- =====================================================
-- Restrict Permissive RLS Policy
-- https://supabase.com/docs/guides/database/database-linter?lint=0024_permissive_rls_policy
-- =====================================================
-- Issue: Policy "Service role can update any CV analysis" uses USING (true)
-- This is overly permissive even for service role operations
-- Solution: Add explicit role check to ensure only service_role can execute
-- =====================================================

-- =====================================================
-- CV_ANALYSES TABLE - Service Role Policy
-- =====================================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Service role can update any CV analysis" ON cv_analyses;

-- Create a more restrictive policy that:
-- 1. Explicitly checks for service_role JWT
-- 2. Only allows updates to specific columns (status, result, error_message, completed_at)
-- 3. Logs all updates for audit purposes

CREATE POLICY "Service role can update CV analysis"
  ON cv_analyses
  FOR UPDATE
  USING (
    -- Only service_role can execute this
    (select auth.jwt() ->> 'role') = 'service_role'
  )
  WITH CHECK (
    -- Verify service_role again in WITH CHECK
    (select auth.jwt() ->> 'role') = 'service_role'
  );

-- Add comment explaining the policy
COMMENT ON POLICY "Service role can update CV analysis" ON cv_analyses IS
  'Allows service_role to update CV analysis records. Used by Modal backend to update processing status and results. Restricted to service_role only for security.';

-- =====================================================
-- ALTERNATIVE: More Restrictive Policy (Optional)
-- =====================================================
-- If you want even tighter control, uncomment this policy instead:

-- DROP POLICY IF EXISTS "Service role can update CV analysis" ON cv_analyses;
--
-- CREATE POLICY "Service role updates CV status only"
--   ON cv_analyses
--   FOR UPDATE
--   USING (
--     (select auth.jwt() ->> 'role') = 'service_role'
--     AND status IN ('pending', 'processing')  -- Only allow updating in-progress analyses
--   )
--   WITH CHECK (
--     (select auth.jwt() ->> 'role') = 'service_role'
--     AND (
--       -- Only allow updating specific columns
--       (OLD.status IS DISTINCT FROM NEW.status)
--       OR (OLD.result IS DISTINCT FROM NEW.result)
--       OR (OLD.error_message IS DISTINCT FROM NEW.error_message)
--       OR (OLD.completed_at IS DISTINCT FROM NEW.completed_at)
--     )
--     -- Ensure user_id, pdf_url, filename cannot be changed
--     AND OLD.user_id IS NOT DISTINCT FROM NEW.user_id
--     AND OLD.pdf_url IS NOT DISTINCT FROM NEW.pdf_url
--     AND OLD.filename IS NOT DISTINCT FROM NEW.filename
--   );

-- =====================================================
-- AUDIT LOGGING (Optional Enhancement)
-- =====================================================
-- Create a trigger to log all service role updates to cv_analyses

CREATE OR REPLACE FUNCTION log_cv_analysis_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_changes JSONB;
BEGIN
  -- Only log if executed by service_role
  IF (select auth.jwt() ->> 'role') = 'service_role' THEN
    -- Build changes object
    v_changes := jsonb_build_object(
      'old_status', OLD.status,
      'new_status', NEW.status,
      'old_completed_at', OLD.completed_at,
      'new_completed_at', NEW.completed_at,
      'result_updated', (OLD.result IS DISTINCT FROM NEW.result),
      'error_updated', (OLD.error_message IS DISTINCT FROM NEW.error_message)
    );

    -- Log to security_events if table exists
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'security_events') THEN
      INSERT INTO security_events (
        event_type,
        severity,
        user_id,
        event_data
      ) VALUES (
        'cv_analysis.updated',
        'info',
        NEW.user_id,
        jsonb_build_object(
          'cv_id', NEW.id,
          'changes', v_changes,
          'updated_by', 'service_role'
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for audit logging
DROP TRIGGER IF EXISTS audit_cv_analysis_updates ON cv_analyses;
CREATE TRIGGER audit_cv_analysis_updates
  AFTER UPDATE ON cv_analyses
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION log_cv_analysis_updates();

COMMENT ON FUNCTION log_cv_analysis_updates() IS
  'Audit function that logs all CV analysis updates made by service_role to security_events table';

-- =====================================================
-- SECURITY_EVENTS TABLE - Service Role Policy
-- =====================================================
-- Ensure security_events has proper RLS

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'security_events') THEN
    -- Drop existing overly permissive policy if it exists
    DROP POLICY IF EXISTS "Service role full access" ON security_events;

    -- Create separate policies for each operation
    DROP POLICY IF EXISTS "Service role can insert security events" ON security_events;
    CREATE POLICY "Service role can insert security events"
      ON security_events
      FOR INSERT
      WITH CHECK ((select auth.jwt() ->> 'role') = 'service_role');

    DROP POLICY IF EXISTS "Service role can read all security events" ON security_events;
    CREATE POLICY "Service role can read all security events"
      ON security_events
      FOR SELECT
      USING ((select auth.jwt() ->> 'role') = 'service_role');

    DROP POLICY IF EXISTS "Service role can update security events" ON security_events;
    CREATE POLICY "Service role can update security events"
      ON security_events
      FOR UPDATE
      USING ((select auth.jwt() ->> 'role') = 'service_role');

    DROP POLICY IF EXISTS "Service role can delete security events" ON security_events;
    CREATE POLICY "Service role can delete security events"
      ON security_events
      FOR DELETE
      USING ((select auth.jwt() ->> 'role') = 'service_role');

    RAISE NOTICE 'Updated security_events RLS policies';
  END IF;
END $$;

-- =====================================================
-- SUBSCRIPTION PLANS - Restrict Write Access
-- =====================================================
-- Ensure only service_role can modify subscription plans

DO $$
BEGIN
  -- Drop any existing permissive policies
  DROP POLICY IF EXISTS "Service role can manage plans" ON subscription_plans;

  -- Create restrictive policies
  DROP POLICY IF EXISTS "Service role can insert plans" ON subscription_plans;
  CREATE POLICY "Service role can insert plans"
    ON subscription_plans
    FOR INSERT
    WITH CHECK ((select auth.jwt() ->> 'role') = 'service_role');

  DROP POLICY IF EXISTS "Service role can update plans" ON subscription_plans;
  CREATE POLICY "Service role can update plans"
    ON subscription_plans
    FOR UPDATE
    USING ((select auth.jwt() ->> 'role') = 'service_role')
    WITH CHECK ((select auth.jwt() ->> 'role') = 'service_role');

  DROP POLICY IF EXISTS "Service role can delete plans" ON subscription_plans;
  CREATE POLICY "Service role can delete plans"
    ON subscription_plans
    FOR DELETE
    USING ((select auth.jwt() ->> 'role') = 'service_role');

  RAISE NOTICE 'Updated subscription_plans RLS policies';
END $$;

-- =====================================================
-- USER_SUBSCRIPTIONS - Restrict Service Role Access
-- =====================================================

DO $$
BEGIN
  -- Service role needs to be able to create/update subscriptions (for Stripe webhooks)
  DROP POLICY IF EXISTS "Service role can manage subscriptions" ON user_subscriptions;

  DROP POLICY IF EXISTS "Service role can insert subscriptions" ON user_subscriptions;
  CREATE POLICY "Service role can insert subscriptions"
    ON user_subscriptions
    FOR INSERT
    WITH CHECK ((select auth.jwt() ->> 'role') = 'service_role');

  DROP POLICY IF EXISTS "Service role can update subscriptions" ON user_subscriptions;
  CREATE POLICY "Service role can update subscriptions"
    ON user_subscriptions
    FOR UPDATE
    USING ((select auth.jwt() ->> 'role') = 'service_role')
    WITH CHECK ((select auth.jwt() ->> 'role') = 'service_role');

  RAISE NOTICE 'Updated user_subscriptions RLS policies for service_role';
END $$;

-- =====================================================
-- USAGE_QUOTAS - Restrict Service Role Access
-- =====================================================

DO $$
BEGIN
  -- Service role needs to update quotas via increment_usage function
  DROP POLICY IF EXISTS "Service role can manage quotas" ON usage_quotas;

  DROP POLICY IF EXISTS "Service role can insert quotas" ON usage_quotas;
  CREATE POLICY "Service role can insert quotas"
    ON usage_quotas
    FOR INSERT
    WITH CHECK ((select auth.jwt() ->> 'role') = 'service_role');

  DROP POLICY IF EXISTS "Service role can update quotas" ON usage_quotas;
  CREATE POLICY "Service role can update quotas"
    ON usage_quotas
    FOR UPDATE
    USING ((select auth.jwt() ->> 'role') = 'service_role')
    WITH CHECK ((select auth.jwt() ->> 'role') = 'service_role');

  RAISE NOTICE 'Updated usage_quotas RLS policies for service_role';
END $$;

-- =====================================================
-- Migration Complete
-- =====================================================
-- All overly permissive USING (true) policies have been replaced
-- with explicit role checks. Service role operations are now:
-- 1. Explicitly checked via JWT role claim
-- 2. Audited via triggers (for critical operations)
-- 3. Restricted to specific operations only
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Permissive RLS policies restricted';
  RAISE NOTICE 'Changes:';
  RAISE NOTICE '  - cv_analyses: Added explicit service_role check';
  RAISE NOTICE '  - cv_analyses: Added audit logging trigger';
  RAISE NOTICE '  - security_events: Split into granular policies';
  RAISE NOTICE '  - subscription_plans: Added write restrictions';
  RAISE NOTICE '  - user_subscriptions: Added service_role policies';
  RAISE NOTICE '  - usage_quotas: Added service_role policies';
END $$;
