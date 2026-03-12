-- Paliers de récompenses pour HuntZen Boost (parrainage gamifié)

ALTER TABLE referral_config
  ADD COLUMN IF NOT EXISTS tiers JSONB DEFAULT '[
    {
      "friends": 1,
      "reward_type": "quota_bonus",
      "searches": 10,
      "coach_minutes": 10,
      "label": "+10 recherches + 10 min Coach IA"
    },
    {
      "friends": 3,
      "reward_type": "free_days",
      "days": 2,
      "plan": "starter",
      "label": "48h Starter offerts"
    },
    {
      "friends": 5,
      "reward_type": "free_days",
      "days": 7,
      "plan": "pro",
      "label": "7 jours Pro offerts"
    },
    {
      "friends": 10,
      "reward_type": "stripe_coupon",
      "discount_percent": 50,
      "plan": "pro",
      "label": "-50% Pro ou 1 mois Starter"
    }
  ]'::jsonb;
