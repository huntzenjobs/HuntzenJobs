-- ============================================================================
-- CLEANUP SCRIPT - Données Subscription Corrompues
-- ============================================================================
--
-- ⚠️ ATTENTION: Ce script est DESTRUCTIF
--
-- AVANT D'EXÉCUTER:
-- 1. Exécuter diagnostic_queries.sql pour voir l'état actuel
-- 2. Faire un BACKUP de la DB
-- 3. Exécuter en TRANSACTION pour pouvoir ROLLBACK si erreur
--
-- ORDRE D'EXÉCUTION:
-- Ce script doit être exécuté AVANT les migrations DB nouvelles
--
-- ============================================================================

BEGIN;  -- Start transaction

-- ============================================================================
-- STEP 1: Marquer vieilles subscriptions comme cancelled (garde la plus récente)
-- ============================================================================
-- Cible: Users avec 2+ subscriptions actives simultanées
-- Action: Cancel toutes sauf la plus récente (par updated_at DESC)

DO $$
DECLARE
  v_affected_count INTEGER;
BEGIN
  WITH ranked_subs AS (
    SELECT
      id,
      user_id,
      ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY updated_at DESC) as rn
    FROM user_subscriptions
    WHERE status = 'active'
  )
  UPDATE user_subscriptions us
  SET
    status = 'cancelled',
    cancelled_at = NOW(),
    updated_at = NOW()
  FROM ranked_subs rs
  WHERE us.id = rs.id
    AND rs.rn > 1;

  GET DIAGNOSTICS v_affected_count = ROW_COUNT;
  RAISE NOTICE '[STEP 1] Cancelled % old duplicate subscriptions', v_affected_count;
END $$;

-- ============================================================================
-- STEP 2: Cancel "free" subscriptions si user a payante active
-- ============================================================================
-- Cible: Users en "free" qui ont aussi un plan payant actif
-- Action: Cancel le plan free (garde le payant)

DO $$
DECLARE
  v_affected_count INTEGER;
BEGIN
  UPDATE user_subscriptions us
  SET
    status = 'cancelled',
    cancelled_at = NOW(),
    updated_at = NOW()
  FROM subscription_plans sp_free
  WHERE us.plan_id = sp_free.id
    AND sp_free.name = 'free'
    AND us.status = 'active'
    AND EXISTS (
      SELECT 1
      FROM user_subscriptions us2
      JOIN subscription_plans sp2 ON us2.plan_id = sp2.id
      WHERE us2.user_id = us.user_id
        AND us2.status = 'active'
        AND sp2.name != 'free'
    );

  GET DIAGNOSTICS v_affected_count = ROW_COUNT;
  RAISE NOTICE '[STEP 2] Cancelled % free subscriptions (users have paid plan)', v_affected_count;
END $$;

-- ============================================================================
-- STEP 3: Marquer subscriptions expirées comme cancelled
-- ============================================================================
-- Cible: Subscriptions payantes avec current_period_end < NOW() toujours "active"
-- Action: Mark as cancelled (webhooks manqués)

DO $$
DECLARE
  v_affected_count INTEGER;
BEGIN
  UPDATE user_subscriptions us
  SET
    status = 'cancelled',
    cancelled_at = us.current_period_end,
    updated_at = NOW()
  FROM subscription_plans sp
  WHERE us.plan_id = sp.id
    AND us.status = 'active'
    AND us.current_period_end < NOW()
    AND sp.name != 'free';

  GET DIAGNOSTICS v_affected_count = ROW_COUNT;
  RAISE NOTICE '[STEP 3] Cancelled % expired subscriptions', v_affected_count;
END $$;

-- ============================================================================
-- STEP 4: Sync profiles.subscription_tier avec user_subscriptions
-- ============================================================================
-- Cible: profiles.subscription_tier != actual subscription plan
-- Action: Update profiles pour refléter plan réel (temporaire avant dépréciation)

DO $$
DECLARE
  v_affected_count INTEGER;
BEGIN
  UPDATE profiles p
  SET
    subscription_tier = sp.name,
    updated_at = NOW()
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE p.id = us.user_id
    AND us.status = 'active'
    AND p.subscription_tier IS DISTINCT FROM sp.name;

  GET DIAGNOSTICS v_affected_count = ROW_COUNT;
  RAISE NOTICE '[STEP 4] Synced % profiles with actual subscription plan', v_affected_count;
END $$;

-- ============================================================================
-- STEP 5: Assign free plan aux users sans subscription active
-- ============================================================================
-- Cible: Users qui n'ont aucune subscription active (edge case)
-- Action: Créer subscription free pour eux

DO $$
DECLARE
  v_free_plan_id UUID;
  v_affected_count INTEGER;
BEGIN
  -- Get free plan ID
  SELECT id INTO v_free_plan_id
  FROM subscription_plans
  WHERE name = 'free'
  LIMIT 1;

  -- Insert free subscription for users without any active subscription
  INSERT INTO user_subscriptions (
    user_id,
    plan_id,
    status,
    current_period_start,
    current_period_end,
    created_at,
    updated_at
  )
  SELECT
    u.id,
    v_free_plan_id,
    'active',
    NOW(),
    NOW() + INTERVAL '100 years',
    NOW(),
    NOW()
  FROM auth.users u
  WHERE NOT EXISTS (
    SELECT 1
    FROM user_subscriptions us
    WHERE us.user_id = u.id
      AND us.status = 'active'
  )
  ON CONFLICT (user_id) WHERE status = 'active' DO NOTHING;

  GET DIAGNOSTICS v_affected_count = ROW_COUNT;
  RAISE NOTICE '[STEP 5] Created free subscription for % users', v_affected_count;
END $$;

-- ============================================================================
-- VERIFICATION: Vérifier que cleanup a réussi
-- ============================================================================

DO $$
DECLARE
  v_duplicate_subs INTEGER;
  v_orphaned_subs INTEGER;
  v_expired_subs INTEGER;
  v_profile_mismatches INTEGER;
BEGIN
  -- Check 1: Subscriptions multiples actives
  SELECT COUNT(*) INTO v_duplicate_subs
  FROM (
    SELECT user_id
    FROM user_subscriptions
    WHERE status = 'active'
    GROUP BY user_id
    HAVING COUNT(*) > 1
  ) duplicates;

  -- Check 2: Orphaned paid subscriptions (no stripe_subscription_id)
  SELECT COUNT(*) INTO v_orphaned_subs
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.status = 'active'
    AND (us.stripe_subscription_id IS NULL OR us.stripe_subscription_id = '')
    AND sp.name != 'free';

  -- Check 3: Expired but still active
  SELECT COUNT(*) INTO v_expired_subs
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.status = 'active'
    AND us.current_period_end < NOW()
    AND sp.name != 'free';

  -- Check 4: Profile mismatches
  SELECT COUNT(*) INTO v_profile_mismatches
  FROM profiles p
  LEFT JOIN user_subscriptions us ON p.id = us.user_id AND us.status = 'active'
  LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE p.subscription_tier IS DISTINCT FROM COALESCE(sp.name, 'free');

  -- Raise results
  RAISE NOTICE '=== VERIFICATION RESULTS ===';
  RAISE NOTICE 'Duplicate active subscriptions: %', v_duplicate_subs;
  RAISE NOTICE 'Orphaned paid subscriptions: %', v_orphaned_subs;
  RAISE NOTICE 'Expired active subscriptions: %', v_expired_subs;
  RAISE NOTICE 'Profile/subscription mismatches: %', v_profile_mismatches;

  -- Assert all should be 0
  IF v_duplicate_subs > 0 OR v_orphaned_subs > 0 OR v_expired_subs > 0 OR v_profile_mismatches > 0 THEN
    RAISE WARNING 'Cleanup incomplete - some issues remain!';
  ELSE
    RAISE NOTICE '✅ All checks passed - data is clean!';
  END IF;
END $$;

-- ============================================================================
-- COMMIT ou ROLLBACK
-- ============================================================================
-- Si tout est OK, décommenter la ligne suivante:
-- COMMIT;

-- Si erreur ou résultats inattendus:
-- ROLLBACK;

-- Pour l'instant, on laisse la transaction ouverte pour review manuelle
SELECT 'Transaction ready to commit. Review results above, then run COMMIT or ROLLBACK;' as status;

-- ============================================================================
-- FIN DU CLEANUP SCRIPT
-- ============================================================================
