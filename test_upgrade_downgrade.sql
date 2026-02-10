-- ============================================================================
-- TEST: Upgrade/Downgrade Flow avec Auto-Cancel Trigger
-- ============================================================================
-- User test: 3abda780-30fb-46c8-a5c3-5bfa7938d688
-- Ce script teste que le trigger auto-cancel fonctionne correctement
-- ============================================================================

DO $$
DECLARE
  v_test_user_id UUID := '3abda780-30fb-46c8-a5c3-5bfa7938d688';
  v_free_plan_id UUID;
  v_starter_plan_id UUID;
  v_pro_plan_id UUID;
  v_premium_plan_id UUID;
  v_sub_id UUID;
  v_active_count INTEGER;
  v_current_plan TEXT;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'DÉBUT DES TESTS UPGRADE/DOWNGRADE';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';

  -- Get plan IDs
  SELECT id INTO v_free_plan_id FROM subscription_plans WHERE name = 'free' LIMIT 1;
  SELECT id INTO v_starter_plan_id FROM subscription_plans WHERE name = 'starter' LIMIT 1;
  SELECT id INTO v_pro_plan_id FROM subscription_plans WHERE name = 'pro' LIMIT 1;
  SELECT id INTO v_premium_plan_id FROM subscription_plans WHERE name = 'premium' LIMIT 1;

  RAISE NOTICE 'Plan IDs récupérés:';
  RAISE NOTICE '  - Free:    %', v_free_plan_id;
  RAISE NOTICE '  - Starter: %', v_starter_plan_id;
  RAISE NOTICE '  - Pro:     %', v_pro_plan_id;
  RAISE NOTICE '  - Premium: %', v_premium_plan_id;
  RAISE NOTICE '';

  -- ============================================================================
  -- SETUP: Cancel existing subscriptions for test user
  -- ============================================================================
  RAISE NOTICE '📋 SETUP: Nettoyage subscriptions existantes...';

  -- Check current state
  SELECT COUNT(*) INTO v_active_count
  FROM user_subscriptions
  WHERE user_id = v_test_user_id AND status = 'active';

  RAISE NOTICE '  - Subscriptions actives avant cleanup: %', v_active_count;

  -- Cancel all existing active subscriptions
  UPDATE user_subscriptions
  SET
    status = 'canceled',
    canceled_at = NOW(),
    updated_at = NOW()
  WHERE user_id = v_test_user_id
    AND status = 'active';

  GET DIAGNOSTICS v_active_count = ROW_COUNT;
  RAISE NOTICE '  - Subscriptions canceled: %', v_active_count;
  RAISE NOTICE '  ✅ Setup terminé';
  RAISE NOTICE '';

  -- ============================================================================
  -- TEST 1: Créer subscription FREE (baseline)
  -- ============================================================================
  RAISE NOTICE '🧪 TEST 1: Créer subscription FREE';

  INSERT INTO user_subscriptions (
    user_id,
    plan_id,
    status,
    current_period_start,
    current_period_end,
    created_at,
    updated_at
  ) VALUES (
    v_test_user_id,
    v_free_plan_id,
    'active',
    NOW(),
    NOW() + INTERVAL '100 years',
    NOW(),
    NOW()
  )
  RETURNING id INTO v_sub_id;

  RAISE NOTICE '  - Subscription FREE créée: %', v_sub_id;

  -- Verify only 1 active
  SELECT COUNT(*) INTO v_active_count
  FROM user_subscriptions
  WHERE user_id = v_test_user_id AND status = 'active';

  IF v_active_count = 1 THEN
    RAISE NOTICE '  ✅ TEST 1 PASSÉ: 1 seule subscription active';
  ELSE
    RAISE WARNING '  ❌ TEST 1 ÉCHOUÉ: % subscriptions actives (attendu: 1)', v_active_count;
  END IF;
  RAISE NOTICE '';

  -- ============================================================================
  -- TEST 2: UPGRADE Free → Starter (trigger devrait cancel Free)
  -- ============================================================================
  RAISE NOTICE '🧪 TEST 2: UPGRADE Free → Starter';

  INSERT INTO user_subscriptions (
    user_id,
    plan_id,
    status,
    stripe_subscription_id,
    stripe_price_id,
    current_period_start,
    current_period_end,
    created_at,
    updated_at
  ) VALUES (
    v_test_user_id,
    v_starter_plan_id,
    'active',
    'sub_test_starter_' || gen_random_uuid(),
    'price_1SwkaNF7q8KRoF9a8cVsijpc',
    NOW(),
    NOW() + INTERVAL '1 month',
    NOW(),
    NOW()
  )
  RETURNING id INTO v_sub_id;

  RAISE NOTICE '  - Subscription STARTER créée: %', v_sub_id;

  -- Verify trigger canceled FREE
  SELECT COUNT(*) INTO v_active_count
  FROM user_subscriptions
  WHERE user_id = v_test_user_id AND status = 'active';

  SELECT sp.name INTO v_current_plan
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = v_test_user_id AND us.status = 'active'
  LIMIT 1;

  IF v_active_count = 1 AND v_current_plan = 'starter' THEN
    RAISE NOTICE '  ✅ TEST 2 PASSÉ: FREE auto-canceled, seulement STARTER actif';
  ELSE
    RAISE WARNING '  ❌ TEST 2 ÉCHOUÉ: % subscriptions actives, plan actuel: %', v_active_count, v_current_plan;
  END IF;
  RAISE NOTICE '';

  -- ============================================================================
  -- TEST 3: UPGRADE Starter → Pro (trigger devrait cancel Starter)
  -- ============================================================================
  RAISE NOTICE '🧪 TEST 3: UPGRADE Starter → Pro';

  INSERT INTO user_subscriptions (
    user_id,
    plan_id,
    status,
    stripe_subscription_id,
    stripe_price_id,
    current_period_start,
    current_period_end,
    created_at,
    updated_at
  ) VALUES (
    v_test_user_id,
    v_pro_plan_id,
    'active',
    'sub_test_pro_' || gen_random_uuid(),
    'price_1SwkeQF7q8KRoF9azQdPo1o6',
    NOW(),
    NOW() + INTERVAL '1 month',
    NOW(),
    NOW()
  )
  RETURNING id INTO v_sub_id;

  RAISE NOTICE '  - Subscription PRO créée: %', v_sub_id;

  -- Verify trigger canceled STARTER
  SELECT COUNT(*) INTO v_active_count
  FROM user_subscriptions
  WHERE user_id = v_test_user_id AND status = 'active';

  SELECT sp.name INTO v_current_plan
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = v_test_user_id AND us.status = 'active'
  LIMIT 1;

  IF v_active_count = 1 AND v_current_plan = 'pro' THEN
    RAISE NOTICE '  ✅ TEST 3 PASSÉ: STARTER auto-canceled, seulement PRO actif';
  ELSE
    RAISE WARNING '  ❌ TEST 3 ÉCHOUÉ: % subscriptions actives, plan actuel: %', v_active_count, v_current_plan;
  END IF;
  RAISE NOTICE '';

  -- ============================================================================
  -- TEST 4: UPGRADE Pro → Premium (trigger devrait cancel Pro)
  -- ============================================================================
  RAISE NOTICE '🧪 TEST 4: UPGRADE Pro → Premium';

  INSERT INTO user_subscriptions (
    user_id,
    plan_id,
    status,
    stripe_subscription_id,
    stripe_price_id,
    current_period_start,
    current_period_end,
    created_at,
    updated_at
  ) VALUES (
    v_test_user_id,
    v_premium_plan_id,
    'active',
    'sub_test_premium_' || gen_random_uuid(),
    'price_1SwlC1F7q8KRoF9a8FXeooCj',
    NOW(),
    NOW() + INTERVAL '1 month',
    NOW(),
    NOW()
  )
  RETURNING id INTO v_sub_id;

  RAISE NOTICE '  - Subscription PREMIUM créée: %', v_sub_id;

  -- Verify trigger canceled PRO
  SELECT COUNT(*) INTO v_active_count
  FROM user_subscriptions
  WHERE user_id = v_test_user_id AND status = 'active';

  SELECT sp.name INTO v_current_plan
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = v_test_user_id AND us.status = 'active'
  LIMIT 1;

  IF v_active_count = 1 AND v_current_plan = 'premium' THEN
    RAISE NOTICE '  ✅ TEST 4 PASSÉ: PRO auto-canceled, seulement PREMIUM actif';
  ELSE
    RAISE WARNING '  ❌ TEST 4 ÉCHOUÉ: % subscriptions actives, plan actuel: %', v_active_count, v_current_plan;
  END IF;
  RAISE NOTICE '';

  -- ============================================================================
  -- TEST 5: DOWNGRADE Premium → Pro (trigger devrait cancel Premium)
  -- ============================================================================
  RAISE NOTICE '🧪 TEST 5: DOWNGRADE Premium → Pro';

  INSERT INTO user_subscriptions (
    user_id,
    plan_id,
    status,
    stripe_subscription_id,
    stripe_price_id,
    current_period_start,
    current_period_end,
    created_at,
    updated_at
  ) VALUES (
    v_test_user_id,
    v_pro_plan_id,
    'active',
    'sub_test_pro_downgrade_' || gen_random_uuid(),
    'price_1SwkeQF7q8KRoF9azQdPo1o6',
    NOW(),
    NOW() + INTERVAL '1 month',
    NOW(),
    NOW()
  )
  RETURNING id INTO v_sub_id;

  RAISE NOTICE '  - Subscription PRO créée (downgrade): %', v_sub_id;

  -- Verify trigger canceled PREMIUM
  SELECT COUNT(*) INTO v_active_count
  FROM user_subscriptions
  WHERE user_id = v_test_user_id AND status = 'active';

  SELECT sp.name INTO v_current_plan
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = v_test_user_id AND us.status = 'active'
  LIMIT 1;

  IF v_active_count = 1 AND v_current_plan = 'pro' THEN
    RAISE NOTICE '  ✅ TEST 5 PASSÉ: PREMIUM auto-canceled, seulement PRO actif';
  ELSE
    RAISE WARNING '  ❌ TEST 5 ÉCHOUÉ: % subscriptions actives, plan actuel: %', v_active_count, v_current_plan;
  END IF;
  RAISE NOTICE '';

  -- ============================================================================
  -- TEST 6: DOWNGRADE Pro → Free (trigger devrait cancel Pro)
  -- ============================================================================
  RAISE NOTICE '🧪 TEST 6: DOWNGRADE Pro → Free';

  INSERT INTO user_subscriptions (
    user_id,
    plan_id,
    status,
    current_period_start,
    current_period_end,
    created_at,
    updated_at
  ) VALUES (
    v_test_user_id,
    v_free_plan_id,
    'active',
    NOW(),
    NOW() + INTERVAL '100 years',
    NOW(),
    NOW()
  )
  RETURNING id INTO v_sub_id;

  RAISE NOTICE '  - Subscription FREE créée (downgrade): %', v_sub_id;

  -- Verify trigger canceled PRO
  SELECT COUNT(*) INTO v_active_count
  FROM user_subscriptions
  WHERE user_id = v_test_user_id AND status = 'active';

  SELECT sp.name INTO v_current_plan
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = v_test_user_id AND us.status = 'active'
  LIMIT 1;

  IF v_active_count = 1 AND v_current_plan = 'free' THEN
    RAISE NOTICE '  ✅ TEST 6 PASSÉ: PRO auto-canceled, seulement FREE actif';
  ELSE
    RAISE WARNING '  ❌ TEST 6 ÉCHOUÉ: % subscriptions actives, plan actuel: %', v_active_count, v_current_plan;
  END IF;
  RAISE NOTICE '';

  -- ============================================================================
  -- VÉRIFICATION FINALE
  -- ============================================================================
  RAISE NOTICE '========================================';
  RAISE NOTICE 'RÉSUMÉ FINAL';
  RAISE NOTICE '========================================';

  SELECT COUNT(*) INTO v_active_count
  FROM user_subscriptions
  WHERE user_id = v_test_user_id AND status = 'active';

  RAISE NOTICE 'Subscriptions actives pour user %: %', v_test_user_id, v_active_count;

  IF v_active_count = 1 THEN
    RAISE NOTICE '✅ TOUS LES TESTS PASSÉS: Trigger auto-cancel fonctionne correctement!';
  ELSE
    RAISE WARNING '❌ PROBLÈME DÉTECTÉ: % subscriptions actives (devrait être 1)', v_active_count;
  END IF;

  -- Show history
  RAISE NOTICE '';
  RAISE NOTICE 'Historique des subscriptions (10 dernières):';
  FOR v_sub_id IN
    SELECT us.id
    FROM user_subscriptions us
    WHERE us.user_id = v_test_user_id
    ORDER BY us.created_at DESC
    LIMIT 10
  LOOP
    RAISE NOTICE '  %', v_sub_id;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'FIN DES TESTS';
  RAISE NOTICE '========================================';

END $$;
