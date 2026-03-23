-- ============================================
-- PROMO CODES SYSTEM
-- ============================================
-- Tables for promo code management and user-code linking.

-- Table: promo_codes
CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'free_days', 'fixed_amount')),
  discount_value NUMERIC NOT NULL,
  plan TEXT,
  stripe_coupon_id TEXT,
  max_uses INTEGER DEFAULT NULL,
  current_uses INTEGER DEFAULT 0,
  starts_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  campaign TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: user_promo_codes (links users to applied promo codes)
CREATE TABLE IF NOT EXISTS user_promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  promo_code_id UUID NOT NULL REFERENCES promo_codes(id),
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  used_at TIMESTAMPTZ,
  UNIQUE(user_id, promo_code_id)
);

-- RLS
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_promo_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active promo codes" ON promo_codes
  FOR SELECT TO anon, authenticated USING (is_active = true);

CREATE POLICY "Service role manages promo codes" ON promo_codes
  FOR ALL TO service_role USING (true);

CREATE POLICY "Users can view own promo codes" ON user_promo_codes
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Service role manages user promo codes" ON user_promo_codes
  FOR ALL TO service_role USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_promo_codes_campaign ON promo_codes(campaign) WHERE campaign IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_promo_codes_user ON user_promo_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_promo_codes_unused ON user_promo_codes(user_id) WHERE used_at IS NULL;
