-- Migration: Stripe new account migration (FR → new live account)
-- Date: 2026-03-23
-- Context: Changement de compte Stripe. Fresh start (users test uniquement).
-- Nouveaux IDs créés via Stripe CLI en mode Live.

-- ============================================================
-- 1. Mettre à jour les stripe_prices avec les nouveaux IDs
-- ============================================================

-- Starter Monthly
UPDATE stripe_prices SET
  stripe_price_id = 'price_1TDzXyDGN9N43CzqXqZH43ld',
  stripe_product_id = 'prod_UCOKvLYcNAdor6',
  updated_at = NOW()
WHERE plan_id = (SELECT id FROM subscription_plans WHERE name = 'starter')
  AND billing_period = 'monthly';

-- Starter Yearly
UPDATE stripe_prices SET
  stripe_price_id = 'price_1TDzXzDGN9N43CzqLp5wHMcy',
  stripe_product_id = 'prod_UCOKvLYcNAdor6',
  updated_at = NOW()
WHERE plan_id = (SELECT id FROM subscription_plans WHERE name = 'starter')
  AND billing_period = 'yearly';

-- Pro Monthly
UPDATE stripe_prices SET
  stripe_price_id = 'price_1TDzY0DGN9N43CzqxEegna19',
  stripe_product_id = 'prod_UCOKGnLHn0sGAa',
  updated_at = NOW()
WHERE plan_id = (SELECT id FROM subscription_plans WHERE name = 'pro')
  AND billing_period = 'monthly';

-- Pro Yearly
UPDATE stripe_prices SET
  stripe_price_id = 'price_1TDzY0DGN9N43CzqChldAGbL',
  stripe_product_id = 'prod_UCOKGnLHn0sGAa',
  updated_at = NOW()
WHERE plan_id = (SELECT id FROM subscription_plans WHERE name = 'pro')
  AND billing_period = 'yearly';

-- Premium Monthly
UPDATE stripe_prices SET
  stripe_price_id = 'price_1TDzY1DGN9N43CzqEIzxTdVS',
  stripe_product_id = 'prod_UCOKtzNCfXo5X9',
  updated_at = NOW()
WHERE plan_id = (SELECT id FROM subscription_plans WHERE name = 'premium')
  AND billing_period = 'monthly';

-- Premium Yearly
UPDATE stripe_prices SET
  stripe_price_id = 'price_1TDzY2DGN9N43Czqd7Gl3w3m',
  stripe_product_id = 'prod_UCOKtzNCfXo5X9',
  updated_at = NOW()
WHERE plan_id = (SELECT id FROM subscription_plans WHERE name = 'premium')
  AND billing_period = 'yearly';

-- ============================================================
-- 2. Cleanup données test (fresh start)
-- ============================================================

-- Supprimer tous les abonnements test
TRUNCATE user_subscriptions CASCADE;

-- Supprimer l'historique des webhooks test
TRUNCATE stripe_webhook_events CASCADE;
TRUNCATE webhook_failures CASCADE;

-- Supprimer l'historique des abonnements test
TRUNCATE subscription_history CASCADE;

-- Supprimer les demandes recruiter test avec paiement
DELETE FROM recruiter_requests
WHERE stripe_checkout_session_id IS NOT NULL
   OR payment_status = 'paid';

-- ============================================================
-- 3. Nettoyer les références Stripe dans profiles (deprecated)
-- ============================================================

UPDATE profiles
SET stripe_customer_id = NULL
WHERE stripe_customer_id IS NOT NULL;
