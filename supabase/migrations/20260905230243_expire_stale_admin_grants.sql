-- Nettoie uniquement les droits accordés manuellement dont la période est
-- terminée. Les abonnements Stripe, les droits futurs et l'historique sont
-- conservés.

SELECT SET_CONFIG(
  'huntzen_migration.previous_lock_timeout',
  CURRENT_SETTING('lock_timeout'),
  TRUE
);
SELECT SET_CONFIG(
  'huntzen_migration.previous_statement_timeout',
  CURRENT_SETTING('statement_timeout'),
  TRUE
);
SELECT SET_CONFIG('lock_timeout', '5s', TRUE);
SELECT SET_CONFIG('statement_timeout', '30s', TRUE);

UPDATE public.user_subscriptions
SET
  status = 'expired',
  updated_at = NOW(),
  metadata = COALESCE(metadata, '{}'::JSONB) || JSONB_BUILD_OBJECT(
    'previous_status', 'active',
    'reconciled_by', '20260905230243_expire_stale_admin_grants'
  )
WHERE status = 'active'
  AND current_period_end <= NOW()
  AND STARTS_WITH(stripe_subscription_id, 'admin_granted:');

SELECT SET_CONFIG(
  'statement_timeout',
  CURRENT_SETTING('huntzen_migration.previous_statement_timeout'),
  TRUE
);
SELECT SET_CONFIG(
  'lock_timeout',
  CURRENT_SETTING('huntzen_migration.previous_lock_timeout'),
  TRUE
);
