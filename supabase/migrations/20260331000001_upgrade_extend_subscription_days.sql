-- ============================================
-- Improve extend_subscription_days for promo/referral upgrades
-- ============================================
-- Goal: when a user is free-only, a promo/referral that grants
--       free days on a paid plan should actually upgrade the
--       active subscription to that plan for N days.
--
-- Behaviour:
-- 1) If the user already has an active non-free subscription,
--    we simply extend its current_period_end by p_days.
-- 2) Otherwise (free or no subscription), we either:
--    - update the existing active row to the reward plan, or
--    - create a new active row on the reward plan.
--
-- This keeps the partial unique index (one active sub per user)
-- while allowing temporary upgrades from the default free plan.

CREATE OR REPLACE FUNCTION extend_subscription_days(
  p_user_id UUID,
  p_days    INTEGER,
  p_plan_id UUID DEFAULT '3f42df0e-6794-414f-9410-97981064fa7e'::UUID  -- pro par defaut
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_free_plan_id UUID;
BEGIN
  -- Resolve the free plan id (used to detect pure freemium rows)
  SELECT id INTO v_free_plan_id
  FROM subscription_plans
  WHERE name = 'free'
  LIMIT 1;

  -- 1) If user already has an active non-free subscription, just extend it
  UPDATE user_subscriptions
  SET current_period_end = COALESCE(current_period_end, NOW()) + (p_days || ' days')::INTERVAL,
      updated_at = NOW()
  WHERE user_id = p_user_id
    AND status = 'active'
    AND (v_free_plan_id IS NULL OR plan_id <> v_free_plan_id);

  IF FOUND THEN
    RETURN TRUE;
  END IF;

  -- 2) Otherwise (only free or no active sub): upgrade/insert reward plan
  -- Try to reuse the existing active row (typically free) and turn it into the reward plan
  UPDATE user_subscriptions
  SET plan_id = p_plan_id,
      current_period_start = NOW(),
      current_period_end = NOW() + (p_days || ' days')::INTERVAL,
      cancel_at_period_end = TRUE,
      updated_at = NOW()
  WHERE user_id = p_user_id
    AND status = 'active';

  IF FOUND THEN
    RETURN TRUE;
  END IF;

  -- No active row at all: create a fresh temporary subscription on reward plan
  INSERT INTO user_subscriptions (
    user_id,
    plan_id,
    status,
    current_period_start,
    current_period_end,
    cancel_at_period_end
  ) VALUES (
    p_user_id,
    p_plan_id,
    'active',
    NOW(),
    NOW() + (p_days || ' days')::INTERVAL,
    TRUE
  )
  ON CONFLICT DO NOTHING;

  RETURN TRUE;
END;
$$;

-- Ensure service_role still has execute rights on the updated signature
GRANT EXECUTE ON FUNCTION extend_subscription_days(UUID, INTEGER, UUID) TO service_role;
