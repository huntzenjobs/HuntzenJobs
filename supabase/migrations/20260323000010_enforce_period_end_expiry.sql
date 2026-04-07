-- Fix: user_subscription_unified n'expire pas les subscriptions dont current_period_end est depassee
--
-- Avant : filtre uniquement sur status IN ('active', 'trialing', 'past_due')
-- Apres : ajoute current_period_end > NOW() pour que les plans admin-granted expirent
--
-- Impact :
--   - Stripe subs reelles : current_period_end toujours dans le futur (Stripe renouvelle avant)
--   - Admin-granted 30j : disparait apres 30j → user retombe sur free
--   - past_due Stripe : current_period_end toujours dans le futur pendant la grace period Stripe
--   - NULL period_end : garde l'acces (cas legacy)

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
WHERE us.status IN ('active', 'trialing', 'past_due')
  AND (us.current_period_end IS NULL OR us.current_period_end > NOW());
-- current_period_end > NOW() : expiration naturelle des plans admin-granted
-- IS NULL : compatibilite legacy (anciennes entrees sans date)

GRANT SELECT ON user_subscription_unified TO authenticated, service_role;
