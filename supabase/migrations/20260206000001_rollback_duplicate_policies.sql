-- =====================================================
-- Rollback Migration 20 - Remove all policies to start fresh
-- =====================================================

-- Remove all policies from affected tables
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Drop all policies from subscription_plans
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'subscription_plans'
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON public.subscription_plans';
  END LOOP;

  -- Drop all policies from usage_quotas
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'usage_quotas'
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON public.usage_quotas';
  END LOOP;

  -- Drop all policies from user_sessions
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_sessions'
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON public.user_sessions';
  END LOOP;

  -- Drop all policies from user_subscriptions
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_subscriptions'
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON public.user_subscriptions';
  END LOOP;

  RAISE NOTICE '✅ All policies dropped, ready for clean migration';
END $$;
