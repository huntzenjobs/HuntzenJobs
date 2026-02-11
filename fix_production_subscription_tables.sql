-- ============================================
-- EMERGENCY FIX: Create subscription_plans table in Production
-- ============================================
-- Issue: #9 - Table subscription_plans missing in production
-- Date: 2026-02-11
--
-- This script safely creates the subscription infrastructure
-- without affecting existing data.
-- ============================================

BEGIN;

-- ============================================
-- 1. CREATE subscription_plans TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  price_monthly DECIMAL(10,2) NOT NULL DEFAULT 0,
  price_yearly DECIMAL(10,2),
  limits JSONB NOT NULL,
  features JSONB,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_subscription_plans_active
  ON subscription_plans(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_subscription_plans_name
  ON subscription_plans(name);

-- Enable RLS
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Everyone can read active plans
DROP POLICY IF EXISTS "subscription_plans_public_read" ON subscription_plans;
CREATE POLICY "subscription_plans_public_read" ON subscription_plans
  FOR SELECT TO authenticated, anon
  USING (is_active = true);

-- ============================================
-- 2. CREATE user_subscriptions TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMPTZ,
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  stripe_price_id TEXT,
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_status CHECK (status IN ('active', 'canceled', 'past_due', 'paused', 'trialing', 'incomplete')),
  CONSTRAINT valid_period CHECK (current_period_end > current_period_start)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id
  ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status
  ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_customer
  ON user_subscriptions(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_active_period
  ON user_subscriptions(user_id, status, current_period_end) WHERE status = 'active';

-- Unique constraint: one active subscription per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_subscription_per_user
  ON user_subscriptions(user_id) WHERE status = 'active';

-- Enable RLS
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "user_subscriptions_own_read" ON user_subscriptions;
CREATE POLICY "user_subscriptions_own_read" ON user_subscriptions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_subscriptions_own_update" ON user_subscriptions;
CREATE POLICY "user_subscriptions_own_update" ON user_subscriptions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 3. CREATE usage_quotas TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS usage_quotas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quota_date DATE NOT NULL DEFAULT CURRENT_DATE,
  cv_analyses_used INTEGER DEFAULT 0 CHECK (cv_analyses_used >= 0),
  coach_seconds_used INTEGER DEFAULT 0 CHECK (coach_seconds_used >= 0),
  job_searches_used INTEGER DEFAULT 0 CHECK (job_searches_used >= 0),
  last_reset_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT daily_quota UNIQUE(user_id, quota_date)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_usage_quotas_user_date
  ON usage_quotas(user_id, quota_date);
CREATE INDEX IF NOT EXISTS idx_usage_quotas_date
  ON usage_quotas(quota_date);

-- Enable RLS
ALTER TABLE usage_quotas ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "usage_quotas_own_read" ON usage_quotas;
CREATE POLICY "usage_quotas_own_read" ON usage_quotas
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "usage_quotas_own_insert" ON usage_quotas;
CREATE POLICY "usage_quotas_own_insert" ON usage_quotas
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "usage_quotas_own_update" ON usage_quotas;
CREATE POLICY "usage_quotas_own_update" ON usage_quotas
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 4. SEED SUBSCRIPTION PLANS
-- ============================================

INSERT INTO subscription_plans (name, display_name, description, price_monthly, price_yearly, limits, features, sort_order)
VALUES
  (
    'free',
    'Free',
    'Perfect for trying out HuntZen',
    0.00,
    0.00,
    '{"cv_analyses": 1, "coach_seconds": 300, "job_searches": 3}'::jsonb,
    '["1 CV Analysis per day", "5 minutes Career Coach per day", "3 Job Searches per day", "Basic job matching"]'::jsonb,
    1
  ),
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
-- 5. ASSIGN FREE PLAN TO EXISTING USERS
-- ============================================

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

  -- Assign free plan to all users without active subscription
  INSERT INTO user_subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
  SELECT
    u.id,
    free_plan_id,
    'active',
    NOW(),
    NOW() + INTERVAL '100 years'
  FROM auth.users u
  WHERE NOT EXISTS (
    SELECT 1 FROM user_subscriptions us
    WHERE us.user_id = u.id AND us.status = 'active'
  );

  GET DIAGNOSTICS users_migrated = ROW_COUNT;

  RAISE NOTICE '✅ Migrated % users to Free plan', users_migrated;
END $$;

-- ============================================
-- 6. CREATE HELPER FUNCTIONS
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
-- 7. VERIFICATION
-- ============================================

DO $$
DECLARE
  plans_count INTEGER;
  subscriptions_count INTEGER;
  users_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO plans_count FROM subscription_plans WHERE is_active = true;
  SELECT COUNT(*) INTO subscriptions_count FROM user_subscriptions WHERE status = 'active';
  SELECT COUNT(*) INTO users_count FROM auth.users;

  RAISE NOTICE '=== FIX VERIFICATION ===';
  RAISE NOTICE 'Active subscription plans: %', plans_count;
  RAISE NOTICE 'Active subscriptions: %', subscriptions_count;
  RAISE NOTICE 'Total users: %', users_count;

  IF plans_count != 4 THEN
    RAISE WARNING 'Expected 4 plans, found %', plans_count;
  ELSE
    RAISE NOTICE '✅ All 4 subscription plans created';
  END IF;

  IF subscriptions_count != users_count THEN
    RAISE WARNING 'Mismatch: % users but only % subscriptions', users_count, subscriptions_count;
  ELSE
    RAISE NOTICE '✅ All users have active subscriptions';
  END IF;
END $$;

COMMIT;

-- ============================================
-- TEST QUERIES
-- ============================================
-- Run these after applying the fix:
--
-- 1. Check plans exist:
-- SELECT name, display_name, price_monthly FROM subscription_plans ORDER BY sort_order;
--
-- 2. Check user subscriptions:
-- SELECT COUNT(*) FROM user_subscriptions WHERE status = 'active';
--
-- 3. Test signup:
-- Try creating a new user via huntzenjobs.com/auth/signup
-- ============================================
