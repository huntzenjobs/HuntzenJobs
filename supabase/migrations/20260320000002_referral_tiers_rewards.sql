-- ============================================================
-- Update referral_config tiers with structured reward system
-- ============================================================
-- Replaces the old tier format (searches, coach_minutes, label)
-- with a richer structure (name, description, reward_plan, reward_value).

UPDATE referral_config
SET tiers = '[
  {
    "name": "Bronze",
    "friends": 1,
    "reward_type": "free_days",
    "reward_value": 3,
    "reward_plan": "pro",
    "description": "3 jours Accélérateur offerts"
  },
  {
    "name": "Argent",
    "friends": 3,
    "reward_type": "free_days",
    "reward_value": 7,
    "reward_plan": "pro",
    "description": "7 jours Accélérateur offerts"
  },
  {
    "name": "Or",
    "friends": 5,
    "reward_type": "free_days",
    "reward_value": 14,
    "reward_plan": "pro",
    "description": "14 jours Accélérateur offerts"
  },
  {
    "name": "Ambassadeur",
    "friends": 10,
    "reward_type": "free_days",
    "reward_value": 30,
    "reward_plan": "pro",
    "description": "30 jours Accélérateur offerts"
  }
]'::jsonb,
updated_at = NOW()
WHERE id = 1;
