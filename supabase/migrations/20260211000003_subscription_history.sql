-- ============================================================================
-- Migration: Subscription History Audit Trail
-- ============================================================================
--
-- Objectif: Tracer TOUS les changements de subscription pour audit/debug
--
-- Tables:
-- - subscription_history: Enregistre chaque CREATE/UPDATE/DELETE/CANCEL
--
-- Usage:
-- - Debug: "Quel plan avait user X le 15 janvier?"
-- - Audit: "Combien de users ont upgrade de free à pro ce mois?"
-- - Support: "Historique complet des changements pour user affecté"
--
-- ============================================================================

-- ============================================================================
-- Table: subscription_history
-- ============================================================================

CREATE TABLE IF NOT EXISTS subscription_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relations
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL,  -- Note: pas FK car subscription peut être deleted
  plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,

  -- Action type
  action_type TEXT NOT NULL CHECK (
    action_type IN ('created', 'updated', 'cancelled', 'deleted', 'upgraded', 'downgraded', 'trialing', 'renewed')
  ),

  -- Old vs new values (JSONB pour flexibilité)
  old_values JSONB,
  new_values JSONB,

  -- Metadata
  triggered_by TEXT,  -- 'webhook', 'admin', 'user', 'system', 'trigger'
  stripe_event_id TEXT,  -- Référence au webhook Stripe qui a causé le changement
  notes TEXT,  -- Notes additionnelles (ex: raison du changement)

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Indexes pour performance
-- ============================================================================

CREATE INDEX idx_subscription_history_user
  ON subscription_history(user_id, created_at DESC);

CREATE INDEX idx_subscription_history_subscription
  ON subscription_history(subscription_id, created_at DESC);

CREATE INDEX idx_subscription_history_created
  ON subscription_history(created_at DESC);

CREATE INDEX idx_subscription_history_action_type
  ON subscription_history(action_type, created_at DESC);

CREATE INDEX idx_subscription_history_stripe_event
  ON subscription_history(stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;

-- ============================================================================
-- RLS (Row Level Security)
-- ============================================================================

ALTER TABLE subscription_history ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own history
CREATE POLICY "Users can view own subscription history"
  ON subscription_history
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Service role can view all
CREATE POLICY "Service role can view all subscription history"
  ON subscription_history
  FOR SELECT
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Policy: Service role can insert
CREATE POLICY "Service role can insert subscription history"
  ON subscription_history
  FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- Fonction trigger: Track subscription changes
-- ============================================================================

CREATE OR REPLACE FUNCTION track_subscription_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_action_type TEXT;
  v_old_plan_name TEXT;
  v_new_plan_name TEXT;
BEGIN
  -- Determine action type
  IF TG_OP = 'INSERT' THEN
    v_action_type := 'created';

  ELSIF TG_OP = 'UPDATE' THEN
    -- Determine specific update type
    IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
      v_action_type := 'cancelled';

    ELSIF NEW.status = 'trialing' AND OLD.status != 'trialing' THEN
      v_action_type := 'trialing';

    ELSIF NEW.plan_id != OLD.plan_id THEN
      -- Plan change - determine upgrade vs downgrade
      SELECT name INTO v_old_plan_name FROM subscription_plans WHERE id = OLD.plan_id;
      SELECT name INTO v_new_plan_name FROM subscription_plans WHERE id = NEW.plan_id;

      -- Simple heuristic: Pro > Starter > Free
      IF v_new_plan_name > v_old_plan_name THEN
        v_action_type := 'upgraded';
      ELSE
        v_action_type := 'downgraded';
      END IF;

    ELSIF NEW.current_period_end > OLD.current_period_end THEN
      v_action_type := 'renewed';

    ELSE
      v_action_type := 'updated';
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    v_action_type := 'deleted';
  END IF;

  -- Insert history record
  INSERT INTO subscription_history (
    user_id,
    subscription_id,
    plan_id,
    action_type,
    old_values,
    new_values,
    triggered_by
  ) VALUES (
    COALESCE(NEW.user_id, OLD.user_id),
    COALESCE(NEW.id, OLD.id),
    COALESCE(NEW.plan_id, OLD.plan_id),
    v_action_type,
    CASE WHEN TG_OP != 'INSERT' THEN row_to_json(OLD) ELSE NULL END,
    CASE WHEN TG_OP != 'DELETE' THEN row_to_json(NEW) ELSE NULL END,
    'trigger'  -- Auto-tracked via trigger
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Trigger: Track all subscription changes
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_track_subscription_history ON user_subscriptions;

CREATE TRIGGER trigger_track_subscription_history
  AFTER INSERT OR UPDATE OR DELETE ON user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION track_subscription_changes();

-- ============================================================================
-- Helper function: Get user subscription history
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_subscription_history(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  action_type TEXT,
  plan_name TEXT,
  old_status TEXT,
  new_status TEXT,
  triggered_by TEXT,
  stripe_event_id TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sh.action_type,
    sp.name as plan_name,
    sh.old_values->>'status' as old_status,
    sh.new_values->>'status' as new_status,
    sh.triggered_by,
    sh.stripe_event_id,
    sh.created_at
  FROM subscription_history sh
  JOIN subscription_plans sp ON sh.plan_id = sp.id
  WHERE sh.user_id = p_user_id
  ORDER BY sh.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Helper function: Log manual history entry (for webhooks)
-- ============================================================================

CREATE OR REPLACE FUNCTION log_subscription_change(
  p_user_id UUID,
  p_subscription_id UUID,
  p_plan_id UUID,
  p_action_type TEXT,
  p_triggered_by TEXT DEFAULT 'webhook',
  p_stripe_event_id TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_history_id UUID;
BEGIN
  INSERT INTO subscription_history (
    user_id,
    subscription_id,
    plan_id,
    action_type,
    triggered_by,
    stripe_event_id,
    notes
  ) VALUES (
    p_user_id,
    p_subscription_id,
    p_plan_id,
    p_action_type,
    p_triggered_by,
    p_stripe_event_id,
    p_notes
  )
  RETURNING id INTO v_history_id;

  RETURN v_history_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Documentation
-- ============================================================================

COMMENT ON TABLE subscription_history IS
  'Audit trail of all subscription changes. Tracks creates, updates, cancellations, upgrades, downgrades.';

COMMENT ON FUNCTION track_subscription_changes() IS
  'Automatically tracks all changes to user_subscriptions table for audit purposes.';

COMMENT ON FUNCTION get_user_subscription_history(UUID, INTEGER) IS
  'Returns subscription history for a specific user, ordered by most recent first.';

COMMENT ON FUNCTION log_subscription_change(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT) IS
  'Manually log a subscription change (typically called from webhook handlers).';

-- ============================================================================
-- Grant permissions
-- ============================================================================

-- Allow authenticated users to call get_user_subscription_history for their own data
GRANT EXECUTE ON FUNCTION get_user_subscription_history(UUID, INTEGER) TO authenticated;

-- Only service role can log manual changes
REVOKE EXECUTE ON FUNCTION log_subscription_change(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION log_subscription_change(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
