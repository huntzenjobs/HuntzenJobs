-- ============================================
-- Fix 1: Include past_due in unified view
-- Fix 2: Add cancel_at_period_end to RPC
-- ============================================
-- past_due users had status='past_due' but the view filtered it out
-- so frontend was showing them as free plan. This fixes that.

-- Update view to include past_due subscriptions
CREATE OR REPLACE VIEW user_subscription_unified AS
SELECT
  us.user_id,
  sp.id AS plan_id,
  sp.name AS plan_name,
  sp.display_name AS plan_display_name,
  sp.price_monthly,
  sp.price_yearly,
  sp.limits AS plan_limits,
  sp.features AS plan_features,

  us.id AS subscription_id,
  us.status AS subscription_status,
  us.stripe_subscription_id,
  us.stripe_customer_id,
  us.stripe_price_id,
  us.current_period_start,
  us.current_period_end,
  us.cancel_at_period_end,
  us.trial_start,
  us.trial_end,

  us.created_at AS subscription_created_at,
  us.updated_at AS subscription_updated_at

FROM user_subscriptions us
JOIN subscription_plans sp ON us.plan_id = sp.id
WHERE us.status IN ('active', 'trialing', 'past_due');
-- past_due = payment failed but grace period still active, user keeps access

GRANT SELECT ON user_subscription_unified TO authenticated, service_role;

-- Update RPC to expose cancel_at_period_end
-- DROP first because PostgreSQL cannot change return type with CREATE OR REPLACE
DROP FUNCTION IF EXISTS get_user_current_subscription(UUID);
CREATE OR REPLACE FUNCTION get_user_current_subscription(p_user_id UUID)
RETURNS TABLE (
  plan_name TEXT,
  plan_display_name TEXT,
  plan_limits JSONB,
  subscription_status TEXT,
  stripe_subscription_id TEXT,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    usu.plan_name,
    usu.plan_display_name,
    usu.plan_limits,
    usu.subscription_status,
    usu.stripe_subscription_id,
    usu.current_period_end,
    usu.cancel_at_period_end
  FROM user_subscription_unified usu
  JOIN subscription_plans sp ON usu.plan_id = sp.id
  WHERE usu.user_id = p_user_id
  ORDER BY sp.sort_order DESC, usu.subscription_created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_user_current_subscription(UUID) TO authenticated, service_role;
