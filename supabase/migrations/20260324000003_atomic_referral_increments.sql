-- ============================================
-- ATOMIC REFERRAL INCREMENTS
-- ============================================
-- Fix race conditions in track_click and register_referral.
-- Both used SELECT + UPDATE which loses concurrent increments.
-- Now uses SQL-level atomic increment (same pattern as increment_referral_conversions).
-- ============================================

CREATE OR REPLACE FUNCTION increment_referral_clicks(p_referral_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE referrals
  SET total_clicks = total_clicks + 1
  WHERE id = p_referral_id;
$$;

GRANT EXECUTE ON FUNCTION increment_referral_clicks(UUID) TO service_role;

CREATE OR REPLACE FUNCTION increment_referral_signups(p_referral_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE referrals
  SET total_signups = total_signups + 1
  WHERE id = p_referral_id;
$$;

GRANT EXECUTE ON FUNCTION increment_referral_signups(UUID) TO service_role;
