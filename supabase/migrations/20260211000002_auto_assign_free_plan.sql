-- ============================================================================
-- Migration: Auto-assign Free Plan to New Users
-- ============================================================================
--
-- Objectif: Assigner automatiquement plan "free" aux nouveaux users signup
--
-- Comportement:
-- - Trigger sur auth.users AFTER INSERT
-- - Crée automatiquement une subscription "free" active
-- - Idempotent (ON CONFLICT DO NOTHING)
--
-- Impact: IMPORTANT pour signup flow cohérent
--
-- ============================================================================

-- ============================================================================
-- Fonction trigger: Assign free plan to new user
-- ============================================================================

CREATE OR REPLACE FUNCTION assign_free_plan_to_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_free_plan_id UUID;
  v_subscription_id UUID;
BEGIN
  -- Get free plan ID
  SELECT id INTO v_free_plan_id
  FROM subscription_plans
  WHERE name = 'free'
  LIMIT 1;

  -- Vérifier que free plan existe
  IF v_free_plan_id IS NULL THEN
    RAISE WARNING 'Free plan not found! User % will not have initial subscription', NEW.id;
    RETURN NEW;
  END IF;

  -- Insert free subscription
  INSERT INTO user_subscriptions (
    user_id,
    plan_id,
    status,
    current_period_start,
    current_period_end,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    v_free_plan_id,
    'active',
    NOW(),
    NOW() + INTERVAL '100 years',  -- Free plan never expires
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) WHERE status = 'active' DO NOTHING
  RETURNING id INTO v_subscription_id;

  -- Log success
  IF v_subscription_id IS NOT NULL THEN
    RAISE NOTICE 'Assigned free plan to new user % (subscription ID: %)', NEW.id, v_subscription_id;
  ELSE
    RAISE NOTICE 'User % already has active subscription, skipped free plan assignment', NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Trigger: Execute AFTER INSERT on auth.users
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_assign_free_plan_new_user ON auth.users;

CREATE TRIGGER trigger_assign_free_plan_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION assign_free_plan_to_new_user();

-- ============================================================================
-- Documentation
-- ============================================================================

COMMENT ON FUNCTION assign_free_plan_to_new_user() IS
  'Automatically assigns free plan to newly signed up users. Ensures all users have a subscription from the start.';

-- ============================================================================
-- Backfill: Assign free plan to existing users without subscription
-- ============================================================================
-- Note: Ce script assign free à TOUS users existants sans subscription active
-- Exécuter seulement si nécessaire (généralement après migration initiale)

DO $$
DECLARE
  v_free_plan_id UUID;
  v_affected_count INTEGER;
BEGIN
  -- Get free plan ID
  SELECT id INTO v_free_plan_id
  FROM subscription_plans
  WHERE name = 'free'
  LIMIT 1;

  IF v_free_plan_id IS NULL THEN
    RAISE WARNING 'Free plan not found! Skipping backfill.';
    RETURN;
  END IF;

  -- Insert free subscription for existing users without any active subscription
  INSERT INTO user_subscriptions (
    user_id,
    plan_id,
    status,
    current_period_start,
    current_period_end,
    created_at,
    updated_at
  )
  SELECT
    u.id,
    v_free_plan_id,
    'active',
    NOW(),
    NOW() + INTERVAL '100 years',
    NOW(),
    NOW()
  FROM auth.users u
  WHERE NOT EXISTS (
    SELECT 1
    FROM user_subscriptions us
    WHERE us.user_id = u.id
      AND us.status = 'active'
  )
  ON CONFLICT (user_id) WHERE status = 'active' DO NOTHING;

  GET DIAGNOSTICS v_affected_count = ROW_COUNT;

  RAISE NOTICE 'Backfill completed: assigned free plan to % existing users', v_affected_count;
END $$;

-- ============================================================================
-- Test du trigger (optionnel - décommenter pour tester)
-- ============================================================================
/*
DO $$
DECLARE
  v_test_email TEXT;
  v_test_user_id UUID;
  v_has_subscription BOOLEAN;
BEGIN
  -- Generate unique test email
  v_test_email := 'test_' || gen_random_uuid() || '@example.com';

  -- Insert test user (trigger should fire)
  INSERT INTO auth.users (email, encrypted_password)
  VALUES (v_test_email, crypt('test123', gen_salt('bf')))
  RETURNING id INTO v_test_user_id;

  RAISE NOTICE 'Created test user: % (%)', v_test_email, v_test_user_id;

  -- Wait a bit for trigger to execute
  PERFORM pg_sleep(0.1);

  -- Check if subscription was created
  SELECT EXISTS (
    SELECT 1
    FROM user_subscriptions us
    JOIN subscription_plans sp ON us.plan_id = sp.id
    WHERE us.user_id = v_test_user_id
      AND us.status = 'active'
      AND sp.name = 'free'
  ) INTO v_has_subscription;

  IF v_has_subscription THEN
    RAISE NOTICE '✅ TEST PASSED: Free subscription auto-created';
  ELSE
    RAISE WARNING '❌ TEST FAILED: No free subscription found';
  END IF;

  -- Cleanup test user
  DELETE FROM auth.users WHERE id = v_test_user_id;
END $$;
*/
