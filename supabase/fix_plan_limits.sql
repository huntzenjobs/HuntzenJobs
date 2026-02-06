-- ============================================
-- Fix Subscription Plan Limits
-- ============================================
-- Purpose: Update existing subscription plans with correct limits
-- Date: 2026-02-03
-- Issue: Paid plans had limited CV analyses instead of unlimited
-- ============================================

-- Update Starter plan: 5 CV analyses, 30min coach, unlimited searches
UPDATE subscription_plans
SET
  price_monthly = 8.90,
  price_yearly = 85.00,
  limits = '{"cv_analyses": 5, "coach_seconds": 1800, "job_searches": -1}'::jsonb,
  features = '["5 CV Analyses per day", "30 minutes Career Coach per day", "Unlimited Job Searches", "Advanced filters", "Favorites management", "Visual compatibility score"]'::jsonb,
  updated_at = NOW()
WHERE name = 'starter';

-- Update Pro plan: 20 CV analyses, unlimited coach, unlimited searches
UPDATE subscription_plans
SET
  price_monthly = 13.90,
  price_yearly = 133.00,
  limits = '{"cv_analyses": 20, "coach_seconds": -1, "job_searches": -1}'::jsonb,
  features = '["20 CV Analyses per day", "Unlimited Career Coach", "Unlimited Job Searches", "PDF Export", "Interview simulations", "Priority support"]'::jsonb,
  updated_at = NOW()
WHERE name = 'pro';

-- Update Premium plan: Confirm unlimited + premium features
UPDATE subscription_plans
SET
  price_monthly = 19.90,
  price_yearly = 191.00,
  limits = '{"cv_analyses": -1, "coach_seconds": -1, "job_searches": -1}'::jsonb,
  features = '["Unlimited CV Analyses", "Unlimited Career Coach", "Unlimited Job Searches", "Unlimited CV history", "Personalized tips", "Instant email alerts", "VIP support", "Early access to new features"]'::jsonb,
  updated_at = NOW()
WHERE name = 'premium';

-- Verify the updates
SELECT
  name,
  display_name,
  price_monthly,
  price_yearly,
  limits,
  updated_at
FROM subscription_plans
ORDER BY sort_order;
