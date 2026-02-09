-- ============================================
-- CLEANUP DUPLICATE SUBSCRIPTIONS
-- ============================================
-- Purpose: Désactiver les abonnements "free" si user a un abonnement payant actif
-- This fixes the bug where users have both "free" and "pro" subscriptions active
-- causing indeterministic results in queries

-- Désactiver tous les abonnements "free" si user a un abonnement payant actif
UPDATE user_subscriptions
SET
  status = 'cancelled',
  updated_at = NOW()
WHERE user_id IN (
  -- Users avec au moins 1 abonnement payant actif
  SELECT DISTINCT us1.user_id
  FROM user_subscriptions us1
  JOIN subscription_plans sp ON us1.plan_id = sp.id
  WHERE us1.status = 'active'
    AND sp.name != 'free'
    AND us1.current_period_end > NOW()
)
AND plan_id = (SELECT id FROM subscription_plans WHERE name = 'free')
AND status = 'active';

-- Log combien de subscriptions ont été nettoyées
DO $$
DECLARE
  v_cleaned_count INTEGER;
BEGIN
  GET DIAGNOSTICS v_cleaned_count = ROW_COUNT;
  RAISE NOTICE 'Cleaned up % duplicate free subscriptions', v_cleaned_count;
END $$;

COMMENT ON TABLE user_subscriptions IS 'User subscriptions table. IMPORTANT: Users should only have ONE active subscription at a time. Free subscriptions are automatically cancelled when a paid subscription is activated.';
