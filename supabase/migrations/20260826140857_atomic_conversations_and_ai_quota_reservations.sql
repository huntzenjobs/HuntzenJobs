-- Persistance conversationnelle atomique et réservations de quotas CV/LM.
-- Les RPC sont internes au backend et exécutées exclusivement avec service_role.

SET lock_timeout = '5s';
SET statement_timeout = '30s';

-- La production contient historiquement une paire strictement dupliquée. On ne
-- supprime que des copies fonctionnellement identiques ; toute divergence fait
-- échouer la migration pour éviter une perte silencieuse de messages.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.coach_conversations
    GROUP BY user_id, session_id
    HAVING COUNT(*) > 1
       AND (
         COUNT(DISTINCT COALESCE(messages, 'null'::JSONB)) > 1
         OR COUNT(DISTINCT COALESCE(context, 'null'::JSONB)) > 1
         OR COUNT(DISTINCT ROW(title IS NULL, title)) > 1
         OR COUNT(DISTINCT is_favorite) > 1
         OR COUNT(DISTINCT ROW(assistant_type IS NULL, assistant_type)) > 1
       )
  ) THEN
    RAISE EXCEPTION
      'coach_conversations contient des doublons divergents; fusion manuelle requise';
  END IF;
END
$$;

WITH ranked_duplicates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, session_id
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS duplicate_rank
  FROM public.coach_conversations
)
DELETE FROM public.coach_conversations AS conversation
USING ranked_duplicates AS duplicate
WHERE conversation.id = duplicate.id
  AND duplicate.duplicate_rank > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'coach_conversations_user_session_key'
      AND conrelid = 'public.coach_conversations'::REGCLASS
  ) THEN
    ALTER TABLE public.coach_conversations
      ADD CONSTRAINT coach_conversations_user_session_key
      UNIQUE (user_id, session_id);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.append_coach_conversation_messages(
  p_user_id UUID,
  p_session_id TEXT,
  p_assistant_type TEXT,
  p_messages JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  conversation_id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id requis';
  END IF;

  IF length(COALESCE(p_session_id, '')) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'session_id invalide';
  END IF;

  IF p_assistant_type NOT IN (
    'career-coach',
    'job-scout',
    'cv-analyzer',
    'cv-adapter',
    'interview-sim'
  ) THEN
    RAISE EXCEPTION 'assistant_type invalide';
  END IF;

  IF jsonb_typeof(p_messages) <> 'array'
     OR jsonb_array_length(p_messages) NOT BETWEEN 1 AND 10
     OR octet_length(p_messages::TEXT) > 65536 THEN
    RAISE EXCEPTION 'messages invalides';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_messages) AS message
    WHERE message ->> 'role' NOT IN ('user', 'assistant')
       OR jsonb_typeof(message -> 'content') <> 'string'
       OR length(COALESCE(message ->> 'content', '')) = 0
       OR length(COALESCE(message ->> 'content', '')) > 30000
       OR NULLIF(message ->> 'timestamp', '') IS NULL
  ) THEN
    RAISE EXCEPTION 'format de message invalide';
  END IF;

  INSERT INTO public.coach_conversations (
    user_id,
    session_id,
    assistant_type,
    messages
  ) VALUES (
    p_user_id,
    p_session_id,
    p_assistant_type,
    p_messages
  )
  ON CONFLICT (user_id, session_id) DO UPDATE
  SET
    assistant_type = EXCLUDED.assistant_type,
    messages = (
      SELECT COALESCE(jsonb_agg(recent.message ORDER BY recent.ordinal), '[]'::JSONB)
      FROM (
        SELECT message, ordinal
        FROM jsonb_array_elements(
          COALESCE(public.coach_conversations.messages, '[]'::JSONB)
          || EXCLUDED.messages
        ) WITH ORDINALITY AS all_messages(message, ordinal)
        ORDER BY ordinal DESC
        LIMIT 50
      ) AS recent
    ),
    updated_at = NOW()
  RETURNING id INTO conversation_id;

  RETURN conversation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.append_coach_conversation_messages(
  UUID, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_coach_conversation_messages(
  UUID, TEXT, TEXT, JSONB
) TO service_role;

COMMENT ON FUNCTION public.append_coach_conversation_messages(
  UUID, TEXT, TEXT, JSONB
) IS 'Ajoute atomiquement des messages à une conversation possédée, bornée aux 50 derniers messages.';

CREATE TABLE public.ai_quota_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL CHECK (feature IN ('cv_adapt', 'cover_letter')),
  request_key UUID NOT NULL,
  amount INTEGER NOT NULL DEFAULT 1 CHECK (amount BETWEEN 1 AND 100),
  quota_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'committed', 'released', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at TIMESTAMPTZ,
  CONSTRAINT ai_quota_reservations_request_key UNIQUE (
    user_id,
    feature,
    request_key
  )
);

CREATE INDEX ai_quota_reservations_pending_user_feature_idx
  ON public.ai_quota_reservations (user_id, feature, quota_date, expires_at)
  WHERE status = 'pending';

ALTER TABLE public.ai_quota_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_quota_reservations
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.ai_quota_reservations
  TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_ai_quota(
  p_user_id UUID,
  p_feature TEXT,
  p_request_key UUID,
  p_amount INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  reservation_id UUID;
  plan_limits JSONB;
  custom_limits JSONB;
  limit_key TEXT;
  quota_limit INTEGER;
  quota_used INTEGER := 0;
  quota_reserved INTEGER := 0;
  existing_reservation public.ai_quota_reservations%ROWTYPE;
BEGIN
  IF p_user_id IS NULL
     OR p_request_key IS NULL
     OR p_feature NOT IN ('cv_adapt', 'cover_letter') THEN
    RAISE EXCEPTION 'paramètres de réservation invalides';
  END IF;

  IF p_amount NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'montant de réservation invalide';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'ai-quota:' || p_user_id::TEXT || ':' || p_feature || ':' || CURRENT_DATE::TEXT,
      0
    )
  );

  UPDATE public.ai_quota_reservations
  SET status = 'expired', finalized_at = NOW()
  WHERE user_id = p_user_id
    AND feature = p_feature
    AND quota_date = CURRENT_DATE
    AND status = 'pending'
    AND expires_at <= NOW();

  SELECT *
  INTO existing_reservation
  FROM public.ai_quota_reservations
  WHERE user_id = p_user_id
    AND feature = p_feature
    AND request_key = p_request_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'granted', existing_reservation.status IN ('pending', 'committed'),
      'reservation_id', existing_reservation.id,
      'quota_limit', NULL,
      'quota_used', NULL,
      'quota_reserved', existing_reservation.amount,
      'reset_at', (existing_reservation.quota_date + 1)::TIMESTAMPTZ
    );
  END IF;

  SELECT plan.limits, subscription.custom_limits
  INTO plan_limits, custom_limits
  FROM public.user_subscriptions AS subscription
  JOIN public.subscription_plans AS plan ON plan.id = subscription.plan_id
  WHERE subscription.user_id = p_user_id
    AND subscription.status IN ('active', 'trialing', 'past_due')
    AND (
      subscription.current_period_end IS NULL
      OR subscription.current_period_end > NOW()
    )
  ORDER BY
    CASE subscription.status
      WHEN 'active' THEN 1
      WHEN 'trialing' THEN 2
      WHEN 'past_due' THEN 3
      ELSE 4
    END,
    plan.sort_order DESC,
    subscription.created_at DESC
  LIMIT 1;

  IF plan_limits IS NULL THEN
    SELECT limits
    INTO plan_limits
    FROM public.subscription_plans
    WHERE name = 'free'
    LIMIT 1;
  END IF;

  limit_key := CASE p_feature
    WHEN 'cv_adapt' THEN 'cv_adapt_per_day'
    WHEN 'cover_letter' THEN 'cover_letter_per_day'
  END;

  quota_limit := COALESCE(
    (custom_limits ->> limit_key)::INTEGER,
    (plan_limits ->> limit_key)::INTEGER,
    0
  );

  SELECT COALESCE(
    CASE p_feature
      WHEN 'cv_adapt' THEN cv_adapt_used
      WHEN 'cover_letter' THEN cover_letter_used
    END,
    0
  )
  INTO quota_used
  FROM public.usage_quotas
  WHERE user_id = p_user_id
    AND quota_date = CURRENT_DATE;

  quota_used := COALESCE(quota_used, 0);

  SELECT COALESCE(SUM(amount), 0)::INTEGER
  INTO quota_reserved
  FROM public.ai_quota_reservations
  WHERE user_id = p_user_id
    AND feature = p_feature
    AND quota_date = CURRENT_DATE
    AND status = 'pending'
    AND expires_at > NOW();

  IF quota_limit <> -1
     AND quota_used + quota_reserved + p_amount > quota_limit THEN
    RETURN jsonb_build_object(
      'granted', FALSE,
      'reservation_id', NULL,
      'quota_limit', quota_limit,
      'quota_used', quota_used,
      'quota_reserved', quota_reserved,
      'reset_at', (CURRENT_DATE + INTERVAL '1 day')::TIMESTAMPTZ
    );
  END IF;

  INSERT INTO public.ai_quota_reservations (
    user_id,
    feature,
    request_key,
    amount,
    quota_date
  ) VALUES (
    p_user_id,
    p_feature,
    p_request_key,
    p_amount,
    CURRENT_DATE
  )
  RETURNING id INTO reservation_id;

  RETURN jsonb_build_object(
    'granted', TRUE,
    'reservation_id', reservation_id,
    'quota_limit', quota_limit,
    'quota_used', quota_used,
    'quota_reserved', quota_reserved + p_amount,
    'reset_at', (CURRENT_DATE + INTERVAL '1 day')::TIMESTAMPTZ
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_ai_quota_reservation(
  p_reservation_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  reservation public.ai_quota_reservations%ROWTYPE;
BEGIN
  SELECT *
  INTO reservation
  FROM public.ai_quota_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF reservation.status = 'committed' THEN
    RETURN TRUE;
  END IF;

  IF reservation.status <> 'pending' THEN
    RETURN FALSE;
  END IF;

  IF reservation.expires_at <= NOW() THEN
    UPDATE public.ai_quota_reservations
    SET status = 'expired', finalized_at = NOW()
    WHERE id = p_reservation_id;
    RETURN FALSE;
  END IF;

  IF NOT public.increment_usage(
    reservation.user_id,
    reservation.feature,
    reservation.amount
  ) THEN
    RAISE EXCEPTION 'échec du débit de quota';
  END IF;

  UPDATE public.ai_quota_reservations
  SET status = 'committed', finalized_at = NOW()
  WHERE id = p_reservation_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_ai_quota_reservation(
  p_reservation_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  current_status TEXT;
BEGIN
  UPDATE public.ai_quota_reservations
  SET status = 'released', finalized_at = NOW()
  WHERE id = p_reservation_id
    AND status = 'pending'
  RETURNING status INTO current_status;

  IF FOUND THEN
    RETURN TRUE;
  END IF;

  SELECT status
  INTO current_status
  FROM public.ai_quota_reservations
  WHERE id = p_reservation_id;

  RETURN current_status = 'released';
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_quota(UUID, TEXT, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_quota(UUID, TEXT, UUID, INTEGER)
  TO service_role;

REVOKE ALL ON FUNCTION public.commit_ai_quota_reservation(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_ai_quota_reservation(UUID)
  TO service_role;

REVOKE ALL ON FUNCTION public.release_ai_quota_reservation(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_ai_quota_reservation(UUID)
  TO service_role;

COMMENT ON TABLE public.ai_quota_reservations IS
  'Réservations atomiques et temporaires des quotas quotidiens CV adapté et lettre de motivation.';
