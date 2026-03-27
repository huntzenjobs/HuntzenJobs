-- ============================================================
-- Referral System
-- ============================================================

-- Table principale : un code de parrainage par utilisateur
CREATE TABLE IF NOT EXISTS referrals (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code   TEXT        UNIQUE NOT NULL,
  total_clicks    INTEGER     NOT NULL DEFAULT 0,
  total_signups   INTEGER     NOT NULL DEFAULT 0,
  total_conversions INTEGER   NOT NULL DEFAULT 0,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inscriptions via un lien de parrainage
CREATE TABLE IF NOT EXISTS referral_signups (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id          UUID        NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  referred_user_id     UUID        UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signed_up_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  converted_to_paid_at TIMESTAMPTZ,
  converted_plan       TEXT
);

-- Récompenses distribuées aux référents
CREATE TABLE IF NOT EXISTS referral_rewards (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_signup_id  UUID        NOT NULL REFERENCES referral_signups(id) ON DELETE CASCADE,
  referrer_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reward_type         TEXT        NOT NULL CHECK (reward_type IN ('free_days', 'quota_bonus', 'stripe_coupon')),
  reward_value        JSONB       NOT NULL,
  applied             BOOLEAN     NOT NULL DEFAULT FALSE,
  applied_at          TIMESTAMPTZ,
  stripe_coupon_id    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Configuration singleton (toujours UPDATE, jamais INSERT)
CREATE TABLE IF NOT EXISTS referral_config (
  id                       INTEGER     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  signup_reward_type       TEXT        CHECK (signup_reward_type IN ('free_days', 'quota_bonus', 'stripe_coupon', 'none')),
  signup_reward_value      JSONB,
  conversion_reward_type   TEXT        NOT NULL CHECK (conversion_reward_type IN ('free_days', 'quota_bonus', 'stripe_coupon')),
  conversion_reward_value  JSONB       NOT NULL,
  is_active                BOOLEAN     NOT NULL DEFAULT TRUE,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Valeur par défaut : 7 jours offerts au référent quand son filleul souscrit
INSERT INTO referral_config (id, signup_reward_type, signup_reward_value, conversion_reward_type, conversion_reward_value, is_active)
VALUES (1, 'none', NULL, 'free_days', '{"days": 7}', TRUE)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE referrals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_signups ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_config  ENABLE ROW LEVEL SECURITY;

-- Users: lecture de leurs propres données
CREATE POLICY "users_select_own_referral" ON referrals
  FOR SELECT USING (auth.uid() = referrer_id);

CREATE POLICY "users_select_own_signups" ON referral_signups
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM referrals r
      WHERE r.id = referral_signups.referral_id
        AND r.referrer_id = auth.uid()
    )
  );

CREATE POLICY "users_select_own_rewards" ON referral_rewards
  FOR SELECT USING (referrer_id = auth.uid());

CREATE POLICY "config_public_read" ON referral_config
  FOR SELECT USING (TRUE);

-- Admins: accès complet
CREATE POLICY "admin_full_referrals" ON referrals
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

CREATE POLICY "admin_full_referral_signups" ON referral_signups
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

CREATE POLICY "admin_full_referral_rewards" ON referral_rewards
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

CREATE POLICY "admin_full_referral_config" ON referral_config
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- ============================================================
-- Index
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id    ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code           ON referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_ref_signups_referral_id  ON referral_signups(referral_id);
CREATE INDEX IF NOT EXISTS idx_ref_signups_referred_user ON referral_signups(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_ref_rewards_referrer     ON referral_rewards(referrer_id);

-- ============================================================
-- RPC: generate_referral_code (helper interne)
-- ============================================================

CREATE OR REPLACE FUNCTION generate_referral_code(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code  TEXT;
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i       INTEGER;
BEGIN
  LOOP
    v_code := 'HZN-';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_chars, (floor(random() * length(v_chars)))::INTEGER + 1, 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM referrals WHERE referral_code = v_code) THEN
      RETURN v_code;
    END IF;
  END LOOP;
END;
$$;

-- ============================================================
-- RPC: get_or_create_referral_code (appelée par le backend)
-- ============================================================

CREATE OR REPLACE FUNCTION get_or_create_referral_code(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_code TEXT;
  v_new_code      TEXT;
BEGIN
  SELECT referral_code INTO v_existing_code
  FROM referrals
  WHERE referrer_id = p_user_id AND is_active = TRUE
  LIMIT 1;

  IF v_existing_code IS NOT NULL THEN
    RETURN v_existing_code;
  END IF;

  v_new_code := generate_referral_code(p_user_id);

  INSERT INTO referrals (referrer_id, referral_code)
  VALUES (p_user_id, v_new_code);

  RETURN v_new_code;
END;
$$;
