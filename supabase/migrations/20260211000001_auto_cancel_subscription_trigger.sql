-- ============================================================================
-- Migration: Auto-cancel Previous Subscriptions Trigger
-- ============================================================================
--
-- Objectif: Empêcher 2 subscriptions actives simultanées pour un même user
--
-- Comportement:
-- - Quand une nouvelle subscription devient 'active'
-- - Automatiquement cancel toutes les autres subscriptions actives du user
-- - Évite race conditions webhook à scale
--
-- Impact: CRITIQUE pour production à 10K+ users
--
-- ============================================================================

-- ============================================================================
-- Fonction trigger: Auto-cancel previous subscriptions
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_cancel_previous_subscriptions()
RETURNS TRIGGER AS $$
DECLARE
  v_cancelled_count INTEGER;
  v_cancelled_ids TEXT[];
BEGIN
  -- Si nouvelle subscription est 'active', cancel toutes les autres
  IF NEW.status = 'active' THEN

    -- Collect IDs des subscriptions à cancel (pour logging)
    SELECT array_agg(id::text)
    INTO v_cancelled_ids
    FROM user_subscriptions
    WHERE user_id = NEW.user_id
      AND id != NEW.id
      AND status IN ('active', 'trialing');

    -- Update subscriptions
    UPDATE user_subscriptions
    SET
      status = 'canceled',
      canceled_at = NOW(),
      updated_at = NOW()
    WHERE user_id = NEW.user_id
      AND id != NEW.id
      AND status IN ('active', 'trialing');

    GET DIAGNOSTICS v_cancelled_count = ROW_COUNT;

    -- Log action si des subscriptions ont été cancelled
    IF v_cancelled_count > 0 THEN
      RAISE NOTICE 'Auto-cancelled % previous subscription(s) for user % (IDs: %)',
        v_cancelled_count,
        NEW.user_id,
        v_cancelled_ids;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Trigger: Execute BEFORE INSERT OR UPDATE
-- ============================================================================
-- Note: BEFORE (pas AFTER) pour cancel les anciennes subscriptions AVANT la contrainte UNIQUE

DROP TRIGGER IF EXISTS trigger_auto_cancel_previous_subscriptions ON user_subscriptions;

CREATE TRIGGER trigger_auto_cancel_previous_subscriptions
  BEFORE INSERT OR UPDATE OF status ON user_subscriptions
  FOR EACH ROW
  WHEN (NEW.status = 'active')
  EXECUTE FUNCTION auto_cancel_previous_subscriptions();

-- ============================================================================
-- Documentation
-- ============================================================================

COMMENT ON FUNCTION auto_cancel_previous_subscriptions() IS
  'Automatically cancels previous subscriptions when a new one becomes active. Prevents race conditions in webhook processing at scale.';

COMMENT ON TRIGGER trigger_auto_cancel_previous_subscriptions ON user_subscriptions IS
  'Ensures only one active subscription per user by auto-cancelling previous ones.';

-- ============================================================================
-- Test du trigger (optionnel - décommenter pour tester)
-- ============================================================================
/*
DO $$
DECLARE
  v_test_user_id UUID;
  v_free_plan_id UUID;
  v_pro_plan_id UUID;
  v_sub1_id UUID;
  v_sub2_id UUID;
  v_active_count INTEGER;
BEGIN
  -- Setup test data
  SELECT id INTO v_test_user_id FROM auth.users LIMIT 1;
  SELECT id INTO v_free_plan_id FROM subscription_plans WHERE name = 'free';
  SELECT id INTO v_pro_plan_id FROM subscription_plans WHERE name = 'pro';

  -- Create first subscription (free)
  INSERT INTO user_subscriptions (user_id, plan_id, status)
  VALUES (v_test_user_id, v_free_plan_id, 'active')
  RETURNING id INTO v_sub1_id;

  RAISE NOTICE 'Created sub 1: %', v_sub1_id;

  -- Create second subscription (pro) - should auto-cancel first
  INSERT INTO user_subscriptions (user_id, plan_id, status)
  VALUES (v_test_user_id, v_pro_plan_id, 'active')
  RETURNING id INTO v_sub2_id;

  RAISE NOTICE 'Created sub 2: %', v_sub2_id;

  -- Verify only one active
  SELECT COUNT(*) INTO v_active_count
  FROM user_subscriptions
  WHERE user_id = v_test_user_id
    AND status = 'active';

  IF v_active_count = 1 THEN
    RAISE NOTICE '✅ TEST PASSED: Only 1 active subscription';
  ELSE
    RAISE WARNING '❌ TEST FAILED: Found % active subscriptions', v_active_count;
  END IF;

  -- Cleanup test data
  DELETE FROM user_subscriptions WHERE id IN (v_sub1_id, v_sub2_id);
END $$;
*/
