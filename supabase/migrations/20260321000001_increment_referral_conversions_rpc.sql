-- Migration: Atomic increment for referral conversions
-- Fixes race condition where SELECT + UPDATE could lose concurrent conversions

CREATE OR REPLACE FUNCTION increment_referral_conversions(p_referral_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE referrals
  SET total_conversions = total_conversions + 1
  WHERE id = p_referral_id;
$$;
