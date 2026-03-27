-- Fix extend_subscription_days pour les users gratuits (sans subscription active)
-- Bug: un user free qui atteint un palier referral ne recevait pas sa recompense
-- car UPDATE ... WHERE status = 'active' affectait 0 rows.
-- Fix: si 0 rows, creer une subscription temporaire avec le plan reward.

CREATE OR REPLACE FUNCTION extend_subscription_days(
  p_user_id UUID,
  p_days    INTEGER,
  p_plan_id UUID DEFAULT '3f42df0e-6794-414f-9410-97981064fa7e'::UUID  -- pro par defaut
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Tenter d'etendre une subscription active existante
  UPDATE user_subscriptions
  SET current_period_end = current_period_end + (p_days || ' days')::INTERVAL,
      updated_at = NOW()
  WHERE user_id = p_user_id
    AND status = 'active';

  IF FOUND THEN
    RETURN TRUE;
  END IF;

  -- 2. Aucune subscription active : creer une subscription temporaire (cadeau referral)
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
    TRUE  -- expire automatiquement
  )
  ON CONFLICT DO NOTHING;

  RETURN TRUE;
END;
$$;

-- Mettre a jour les permissions (nouvelle signature avec 3 params)
GRANT EXECUTE ON FUNCTION extend_subscription_days(UUID, INTEGER, UUID) TO service_role;
