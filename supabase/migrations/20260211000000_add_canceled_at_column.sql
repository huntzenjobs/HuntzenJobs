-- ============================================================================
-- Migration: Add canceled_at column to user_subscriptions
-- ============================================================================
--
-- Objectif: Ajouter colonne pour tracer date d'annulation des subscriptions
--
-- Cette colonne permet de:
-- - Tracer quand une subscription a été canceled
-- - Audit trail des changements de plan
-- - Debugging des problèmes de synchronisation
--
-- Note: Cette migration doit s'exécuter AVANT 20260211000001 (trigger)
--
-- ============================================================================

-- Add canceled_at column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_subscriptions'
      AND column_name = 'canceled_at'
  ) THEN
    ALTER TABLE user_subscriptions
    ADD COLUMN canceled_at TIMESTAMPTZ;

    RAISE NOTICE 'Column canceled_at added to user_subscriptions';
  ELSE
    RAISE NOTICE 'Column canceled_at already exists, skipping';
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN user_subscriptions.canceled_at IS
  'Timestamp when the subscription was canceled. NULL if subscription is still active or never canceled.';

-- Create index for performance (queries filtering by canceled_at)
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_canceled_at
  ON user_subscriptions(canceled_at)
  WHERE canceled_at IS NOT NULL;

-- ============================================================================
-- Backfill: Set canceled_at for existing canceled subscriptions
-- ============================================================================
-- Pour les subscriptions déjà canceled, on set canceled_at = updated_at
-- (approximation, mais mieux que NULL)

DO $$
DECLARE
  v_affected_count INTEGER;
BEGIN
  UPDATE user_subscriptions
  SET canceled_at = updated_at
  WHERE status = 'canceled'
    AND canceled_at IS NULL;

  GET DIAGNOSTICS v_affected_count = ROW_COUNT;

  IF v_affected_count > 0 THEN
    RAISE NOTICE 'Backfilled canceled_at for % existing canceled subscriptions', v_affected_count;
  ELSE
    RAISE NOTICE 'No canceled subscriptions to backfill';
  END IF;
END $$;

-- ============================================================================
-- Documentation
-- ============================================================================

-- Cette colonne sera automatiquement populée par:
-- 1. Le trigger auto_cancel_previous_subscriptions() (migration 00001)
-- 2. Les webhooks Stripe lors d'annulation manuelle
-- 3. Les scripts de cleanup/admin
