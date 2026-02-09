-- ============================================
-- STRIPE PRICE CONFIGURATION TABLE
-- ============================================
-- Store Stripe price IDs in database instead of hardcoding in backend code
-- Allows updating prices without code deployment
-- Supports multiple billing periods per plan

CREATE TABLE IF NOT EXISTS stripe_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
  billing_period TEXT NOT NULL CHECK (billing_period IN ('monthly', 'yearly')),
  stripe_price_id TEXT NOT NULL UNIQUE,
  stripe_product_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One active price per plan per billing period
  UNIQUE(plan_id, billing_period)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_stripe_prices_plan_period ON stripe_prices(plan_id, billing_period);
CREATE INDEX IF NOT EXISTS idx_stripe_prices_stripe_id ON stripe_prices(stripe_price_id);
CREATE INDEX IF NOT EXISTS idx_stripe_prices_active ON stripe_prices(is_active) WHERE is_active = true;

-- ============================================
-- SEED EXISTING PRICE IDS FROM CODE
-- ============================================
-- Migrate hardcoded price IDs from backend/src/services/stripe.py
-- These are the current production price IDs

DO $$
DECLARE
  v_starter_plan_id UUID;
  v_pro_plan_id UUID;
  v_premium_plan_id UUID;
BEGIN
  -- Get plan IDs
  SELECT id INTO v_starter_plan_id FROM subscription_plans WHERE name = 'starter' LIMIT 1;
  SELECT id INTO v_pro_plan_id FROM subscription_plans WHERE name = 'pro' LIMIT 1;
  SELECT id INTO v_premium_plan_id FROM subscription_plans WHERE name = 'premium' LIMIT 1;

  -- Insert monthly prices
  INSERT INTO stripe_prices (plan_id, billing_period, stripe_price_id)
  VALUES
    (v_starter_plan_id, 'monthly', 'price_1SwkaNF7q8KRoF9a8cVsijpc'),
    (v_pro_plan_id, 'monthly', 'price_1SwkeQF7q8KRoF9azQdPo1o6'),
    (v_premium_plan_id, 'monthly', 'price_1SwlC1F7q8KRoF9a8FXeooCj')
  ON CONFLICT (plan_id, billing_period) DO NOTHING;

  -- Insert yearly prices
  INSERT INTO stripe_prices (plan_id, billing_period, stripe_price_id)
  VALUES
    (v_starter_plan_id, 'yearly', 'price_1SwkacF7q8KRoF9aEmn5s5aL'),
    (v_pro_plan_id, 'yearly', 'price_1SwlBkF7q8KRoF9agySwklWJ'),
    (v_premium_plan_id, 'yearly', 'price_1SwlCBF7q8KRoF9aG8uNTsiH')
  ON CONFLICT (plan_id, billing_period) DO NOTHING;

  RAISE NOTICE 'Stripe price IDs seeded successfully';
END $$;

-- ============================================
-- FUNCTION: Get Stripe price ID for plan + billing period
-- ============================================
CREATE OR REPLACE FUNCTION get_stripe_price_id(
  p_plan_name TEXT,
  p_billing_period TEXT
)
RETURNS TEXT AS $$
DECLARE
  v_price_id TEXT;
BEGIN
  SELECT sp.stripe_price_id INTO v_price_id
  FROM stripe_prices sp
  JOIN subscription_plans spl ON sp.plan_id = spl.id
  WHERE spl.name = p_plan_name
    AND sp.billing_period = p_billing_period
    AND sp.is_active = true
  LIMIT 1;

  IF v_price_id IS NULL THEN
    RAISE EXCEPTION 'No active Stripe price found for plan % with billing period %', p_plan_name, p_billing_period;
  END IF;

  RETURN v_price_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Get all active prices for a plan
-- ============================================
CREATE OR REPLACE FUNCTION get_plan_prices(p_plan_name TEXT)
RETURNS TABLE (
  billing_period TEXT,
  stripe_price_id TEXT,
  stripe_product_id TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sp.billing_period,
    sp.stripe_price_id,
    sp.stripe_product_id
  FROM stripe_prices sp
  JOIN subscription_plans spl ON sp.plan_id = spl.id
  WHERE spl.name = p_plan_name
    AND sp.is_active = true
  ORDER BY
    CASE sp.billing_period
      WHEN 'monthly' THEN 1
      WHEN 'yearly' THEN 2
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Update Stripe price ID (for price changes)
-- ============================================
CREATE OR REPLACE FUNCTION update_stripe_price(
  p_plan_name TEXT,
  p_billing_period TEXT,
  p_new_price_id TEXT,
  p_new_product_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_plan_id UUID;
BEGIN
  -- Get plan ID
  SELECT id INTO v_plan_id
  FROM subscription_plans
  WHERE name = p_plan_name
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Plan % not found', p_plan_name;
  END IF;

  -- Deactivate old price
  UPDATE stripe_prices
  SET is_active = false, updated_at = NOW()
  WHERE plan_id = v_plan_id
    AND billing_period = p_billing_period
    AND is_active = true;

  -- Insert new price
  INSERT INTO stripe_prices (
    plan_id,
    billing_period,
    stripe_price_id,
    stripe_product_id,
    is_active
  )
  VALUES (
    v_plan_id,
    p_billing_period,
    p_new_price_id,
    p_new_product_id,
    true
  )
  ON CONFLICT (plan_id, billing_period) DO UPDATE
  SET
    stripe_price_id = EXCLUDED.stripe_price_id,
    stripe_product_id = EXCLUDED.stripe_product_id,
    is_active = true,
    updated_at = NOW();

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT SELECT ON stripe_prices TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_stripe_price_id(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_plan_prices(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION update_stripe_price(TEXT, TEXT, TEXT, TEXT) TO service_role;

-- Comments
COMMENT ON TABLE stripe_prices IS 'Stores Stripe price IDs for subscription plans. Allows updating prices without code deployment.';
COMMENT ON FUNCTION get_stripe_price_id IS 'Get active Stripe price ID for a plan and billing period. Raises exception if not found.';
COMMENT ON FUNCTION get_plan_prices IS 'Get all active price IDs (monthly + yearly) for a plan.';
COMMENT ON FUNCTION update_stripe_price IS 'Update Stripe price ID for a plan. Deactivates old price and activates new one. Use when price changes in Stripe Dashboard.';
