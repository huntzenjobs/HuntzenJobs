-- ============================================
-- HuntZen JobSearch - Subscription Infrastructure
-- Sprint 6 - Ticket S6-2
-- ============================================
-- Purpose: Create subscription management system with plans, user subscriptions, and usage tracking
-- Author: HuntZen Team
-- Date: 2026-01-28
-- Migration: 20260128000000_subscription_infrastructure
--
-- Business Context:
-- - Free: 1 CV/day, 5 min coach, 3 searches ($0)
-- - Starter: 5 CV/day, 15 min coach, 10 searches ($9.99/mo)
-- - Pro: 20 CV/day, 60 min coach, unlimited searches ($19.99/mo)
-- - Premium: Unlimited everything ($49.99/mo)
-- ============================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. SUBSCRIPTION PLANS TABLE
-- ============================================
-- Static table with 4 subscription tiers
-- Limits stored as JSONB for flexibility

CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,  -- 'free', 'starter', 'pro', 'premium'
  display_name TEXT NOT NULL,  -- 'Free', 'Starter', 'Pro', 'Premium'
  description TEXT,
  price_monthly DECIMAL(10,2) NOT NULL DEFAULT 0,
  price_yearly DECIMAL(10,2),  -- NULL means not available for yearly
  limits JSONB NOT NULL,  -- {"cv_analyses": 1, "coach_seconds": 300, "job_searches": 3}
  features JSONB,  -- ["CV Analysis", "Career Coach", "Job Search"] for marketing
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,  -- For displaying plans in order
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for active plans lookup
CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON subscription_plans(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_subscription_plans_name ON subscription_plans(name);

-- ============================================
-- 2. USER SUBSCRIPTIONS TABLE
-- ============================================
-- Links users to their active subscription plan
-- Supports Stripe integration for paid plans

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMPTZ,

  -- Stripe integration (for paid plans)
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  stripe_price_id TEXT,

  -- Trial period support
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_status CHECK (status IN ('active', 'canceled', 'past_due', 'paused', 'trialing', 'incomplete')),
  CONSTRAINT valid_period CHECK (current_period_end > current_period_start)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_customer ON user_subscriptions(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_active_period ON user_subscriptions(user_id, status, current_period_end)
  WHERE status = 'active';

-- Partial unique index to enforce one active subscription per user
-- This is equivalent to: UNIQUE(user_id, status) WHERE status = 'active'
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_subscription_per_user
  ON user_subscriptions(user_id)
  WHERE status = 'active';

-- ============================================
-- 3. USAGE QUOTAS TABLE
-- ============================================
-- Daily usage tracking per user per feature
-- Resets daily at midnight UTC

CREATE TABLE IF NOT EXISTS usage_quotas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quota_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Usage counters per feature
  cv_analyses_used INTEGER DEFAULT 0 CHECK (cv_analyses_used >= 0),
  coach_seconds_used INTEGER DEFAULT 0 CHECK (coach_seconds_used >= 0),
  job_searches_used INTEGER DEFAULT 0 CHECK (job_searches_used >= 0),

  -- Metadata for auditing
  last_reset_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One quota record per user per day
  CONSTRAINT daily_quota UNIQUE(user_id, quota_date)
);

-- Indexes for fast quota lookups
CREATE INDEX IF NOT EXISTS idx_usage_quotas_user_date ON usage_quotas(user_id, quota_date);
CREATE INDEX IF NOT EXISTS idx_usage_quotas_date ON usage_quotas(quota_date);

-- ============================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_quotas ENABLE ROW LEVEL SECURITY;

-- Subscription Plans: Everyone can read (for pricing page)
CREATE POLICY "subscription_plans_public_read" ON subscription_plans
  FOR SELECT TO authenticated, anon
  USING (is_active = true);

-- User Subscriptions: Users can only see their own
CREATE POLICY "user_subscriptions_own_read" ON user_subscriptions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user_subscriptions_own_update" ON user_subscriptions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Usage Quotas: Users can only see/update their own
CREATE POLICY "usage_quotas_own_read" ON usage_quotas
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "usage_quotas_own_insert" ON usage_quotas
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "usage_quotas_own_update" ON usage_quotas
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 5. SEED DATA - SUBSCRIPTION PLANS
-- ============================================

INSERT INTO subscription_plans (name, display_name, description, price_monthly, price_yearly, limits, features, sort_order)
VALUES
  -- Free Plan (Default for all users)
  (
    'free',
    'Free',
    'Perfect for trying out HuntZen',
    0.00,
    0.00,  -- Changed from NULL to 0.00 to match NOT NULL constraint
    '{"cv_analyses": 1, "coach_seconds": 300, "job_searches": 3}'::jsonb,
    '["1 CV Analysis per day", "5 minutes Career Coach per day", "3 Job Searches per day", "Basic job matching"]'::jsonb,
    1
  ),

  -- Starter Plan
  (
    'starter',
    'Starter',
    'Great for active job seekers',
    8.90,
    85.00,
    '{"cv_analyses": 5, "coach_seconds": 1800, "job_searches": -1}'::jsonb,
    '["5 CV Analyses per day", "30 minutes Career Coach per day", "Unlimited Job Searches", "Advanced filters", "Favorites management", "Visual compatibility score"]'::jsonb,
    2
  ),

  -- Pro Plan
  (
    'pro',
    'Pro',
    'For serious career advancement',
    13.90,
    133.00,
    '{"cv_analyses": 20, "coach_seconds": -1, "job_searches": -1}'::jsonb,
    '["20 CV Analyses per day", "Unlimited Career Coach", "Unlimited Job Searches", "PDF Export", "Interview simulations", "Priority support"]'::jsonb,
    3
  ),

  -- Premium Plan
  (
    'premium',
    'Premium',
    'Unlimited access to everything',
    19.90,
    191.00,
    '{"cv_analyses": -1, "coach_seconds": -1, "job_searches": -1}'::jsonb,
    '["Unlimited CV Analyses", "Unlimited Career Coach", "Unlimited Job Searches", "Unlimited CV history", "Personalized tips", "Instant email alerts", "VIP support", "Early access to new features"]'::jsonb,
    4
  )
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  limits = EXCLUDED.limits,
  features = EXCLUDED.features,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- ============================================
-- 6. MIGRATE EXISTING USERS TO FREE PLAN
-- ============================================
-- Assign all existing users to the Free plan with infinite validity

DO $$
DECLARE
  free_plan_id UUID;
  users_migrated INTEGER := 0;
BEGIN
  -- Get Free plan ID
  SELECT id INTO free_plan_id FROM subscription_plans WHERE name = 'free' LIMIT 1;

  IF free_plan_id IS NULL THEN
    RAISE EXCEPTION 'Free plan not found - cannot migrate existing users';
  END IF;

  -- Insert subscriptions for all users who don't have one
  -- The WHERE NOT EXISTS clause prevents duplicates, so ON CONFLICT is not needed
  INSERT INTO user_subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
  SELECT
    u.id,
    free_plan_id,
    'active',
    NOW(),
    NOW() + INTERVAL '100 years'  -- Free plan never expires
  FROM auth.users u
  WHERE NOT EXISTS (
    SELECT 1 FROM user_subscriptions us
    WHERE us.user_id = u.id AND us.status = 'active'
  );

  GET DIAGNOSTICS users_migrated = ROW_COUNT;

  RAISE NOTICE 'Migrated % users to Free plan', users_migrated;
END $$;

-- ============================================
-- 7. HELPER FUNCTIONS (For later use in S6-3)
-- ============================================

-- Function to get user's current plan limits
CREATE OR REPLACE FUNCTION get_user_plan_limits(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_limits JSONB;
BEGIN
  SELECT sp.limits INTO v_limits
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = p_user_id
    AND us.status = 'active'
    AND us.current_period_end > NOW()
  ORDER BY us.created_at DESC
  LIMIT 1;

  RETURN COALESCE(v_limits, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has active subscription
CREATE OR REPLACE FUNCTION has_active_subscription(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_subscriptions
    WHERE user_id = p_user_id
      AND status = 'active'
      AND current_period_end > NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 8. VALIDATION QUERIES
-- ============================================

DO $$
DECLARE
  plans_count INTEGER;
  subscriptions_count INTEGER;
  users_count INTEGER;
BEGIN
  -- Count plans
  SELECT COUNT(*) INTO plans_count FROM subscription_plans WHERE is_active = true;

  -- Count subscriptions
  SELECT COUNT(*) INTO subscriptions_count FROM user_subscriptions WHERE status = 'active';

  -- Count users
  SELECT COUNT(*) INTO users_count FROM auth.users;

  -- Log results
  RAISE NOTICE '=== MIGRATION VALIDATION ===';
  RAISE NOTICE 'Active subscription plans: %', plans_count;
  RAISE NOTICE 'Active subscriptions: %', subscriptions_count;
  RAISE NOTICE 'Total users: %', users_count;

  -- Validate: All users should have subscriptions
  IF subscriptions_count != users_count THEN
    RAISE WARNING 'Mismatch: % users but only % subscriptions', users_count, subscriptions_count;
  ELSE
    RAISE NOTICE '✅ All users have active subscriptions';
  END IF;

  -- Validate: Should have 4 plans
  IF plans_count != 4 THEN
    RAISE WARNING 'Expected 4 plans, found %', plans_count;
  ELSE
    RAISE NOTICE '✅ All 4 subscription plans created';
  END IF;
END $$;

-- ============================================
-- END OF MIGRATION
-- ============================================
-- Run validation with:
-- SELECT * FROM subscription_plans;
-- SELECT COUNT(*) FROM user_subscriptions WHERE status = 'active';
-- SELECT get_user_plan_limits(auth.uid());
-- ============================================
