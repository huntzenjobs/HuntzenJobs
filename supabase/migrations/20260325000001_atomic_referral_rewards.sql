-- ============================================================
-- ATOMIC REFERRAL REWARDS
-- ============================================================
-- RC-2: extend_subscription_days — UPDATE atomique sans SELECT préalable
-- RC-3: idx_referral_rewards_tier_unique — contrainte UNIQUE pour ON CONFLICT
-- RC-1: apply_quota_bonus — décrémente les compteurs used pour donner du bonus
-- ============================================================

-- ============================================================
-- RC-2: Extend subscription by N days (atomic)
-- Remplace le SELECT+UPDATE non atomique dans _apply_free_days.
-- ============================================================
CREATE OR REPLACE FUNCTION extend_subscription_days(
  p_user_id UUID,
  p_days    INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_subscriptions
  SET current_period_end = current_period_end + (p_days || ' days')::INTERVAL,
      updated_at = NOW()
  WHERE user_id = p_user_id
    AND status = 'active';
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION extend_subscription_days(UUID, INTEGER) TO service_role;

-- ============================================================
-- RC-3: Unique index on (referrer_id, tier_index) in referral_rewards
-- Permet ON CONFLICT DO NOTHING pour éliminer la race condition SELECT+INSERT.
-- tier_index est stocké dans reward_value JSONB.
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_rewards_tier_unique
ON referral_rewards (
  referrer_id,
  ((reward_value->>'tier_index')::integer)
)
WHERE reward_value->>'tier_index' IS NOT NULL;

-- ============================================================
-- RC-3 bis: insert_tier_reward — INSERT avec ON CONFLICT DO NOTHING nu.
-- PostgREST cible ON CONFLICT (id) par défaut, ce qui ne couvre PAS
-- l'index fonctionnel idx_referral_rewards_tier_unique.
-- Cette RPC utilise ON CONFLICT DO NOTHING sans cible → attrape TOUTES
-- les contraintes unique, y compris l'index fonctionnel sur JSONB.
-- Retourne l'UUID du reward créé, ou NULL si doublon.
-- ============================================================
CREATE OR REPLACE FUNCTION insert_tier_reward(
  p_referral_signup_id UUID,
  p_referrer_id        UUID,
  p_reward_type        TEXT,
  p_reward_value       JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reward_id UUID;
BEGIN
  INSERT INTO referral_rewards (
    referral_signup_id, referrer_id, reward_type, reward_value, applied
  )
  VALUES (p_referral_signup_id, p_referrer_id, p_reward_type, p_reward_value, FALSE)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_reward_id;

  RETURN v_reward_id;
END;
$$;

GRANT EXECUTE ON FUNCTION insert_tier_reward(UUID, UUID, TEXT, JSONB) TO service_role;

-- ============================================================
-- RC-1: Apply quota bonus (decrement used counters)
-- Remplace l'UPDATE sur des colonnes inexistantes (_remaining).
-- Utilise GREATEST(0, ...) pour ne jamais passer sous zéro.
-- ============================================================
CREATE OR REPLACE FUNCTION apply_quota_bonus(
  p_user_id       UUID,
  p_cv_analyses   INTEGER DEFAULT 0,
  p_coach_seconds INTEGER DEFAULT 0,
  p_job_searches  INTEGER DEFAULT 0
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_cv_analyses = 0 AND p_coach_seconds = 0 AND p_job_searches = 0 THEN
    RETURN TRUE;
  END IF;

  INSERT INTO usage_quotas (
    user_id, quota_date,
    cv_analyses_used, coach_seconds_used, job_searches_used
  )
  VALUES (p_user_id, CURRENT_DATE, 0, 0, 0)
  ON CONFLICT (user_id, quota_date) DO UPDATE SET
    cv_analyses_used   = GREATEST(0, usage_quotas.cv_analyses_used   - p_cv_analyses),
    coach_seconds_used = GREATEST(0, usage_quotas.coach_seconds_used - p_coach_seconds),
    job_searches_used  = GREATEST(0, usage_quotas.job_searches_used  - p_job_searches),
    updated_at         = NOW();

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION apply_quota_bonus(UUID, INTEGER, INTEGER, INTEGER) TO service_role;
