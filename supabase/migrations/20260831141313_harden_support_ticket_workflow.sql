-- Durcissement du workflow support : ACL en lecture seule, historique append-only,
-- idempotence et livraison durable. Cette migration est additive et ne supprime
-- aucune ligne ni aucun champ de public.support_tickets.

SET lock_timeout = '5s';
SET statement_timeout = '30s';

-- Les sept tickets historiques reçoivent NULL. PostgreSQL autorise plusieurs NULL
-- sous une contrainte UNIQUE, ce qui évite de fabriquer de fausses clés métier.
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS request_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_definition
    WHERE constraint_definition.conname = 'support_tickets_request_id_key'
      AND constraint_definition.conrelid = 'public.support_tickets'::pg_catalog.regclass
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_request_id_key UNIQUE (request_id);
  END IF;
END
$$;

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "service_role_all" ON public.support_tickets;

CREATE POLICY "support_tickets_owner_select"
  ON public.support_tickets
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "support_tickets_service_role_all"
  ON public.support_tickets
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.support_tickets
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.support_tickets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.support_tickets TO service_role;

CREATE INDEX IF NOT EXISTS idx_support_tickets_owner_created
  ON public.support_tickets (user_id, created_at DESC, id);

COMMENT ON COLUMN public.support_tickets.request_id IS
  'Clé UUID idempotente de création; NULL uniquement pour les tickets historiques.';

CREATE TABLE public.support_ticket_messages (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_role TEXT NOT NULL CHECK (author_role IN ('user', 'admin', 'system')),
  content TEXT NOT NULL CHECK (
    pg_catalog.char_length(content) BETWEEN 1 AND 20000
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  request_id UUID NOT NULL UNIQUE,
  CONSTRAINT support_ticket_messages_ticket_id_id_key UNIQUE (ticket_id, id)
);

CREATE INDEX idx_support_ticket_messages_ticket_created
  ON public.support_ticket_messages (ticket_id, created_at, id);
CREATE INDEX idx_support_ticket_messages_author_id
  ON public.support_ticket_messages (author_id);

ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_ticket_messages_owner_select"
  ON public.support_ticket_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.support_tickets AS ticket
      WHERE ticket.id = support_ticket_messages.ticket_id
        AND ticket.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "support_ticket_messages_service_role_select"
  ON public.support_ticket_messages
  FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "support_ticket_messages_service_role_insert"
  ON public.support_ticket_messages
  FOR INSERT
  TO service_role
  WITH CHECK (true);

REVOKE ALL ON TABLE public.support_ticket_messages
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.support_ticket_messages TO authenticated;
GRANT SELECT, INSERT ON TABLE public.support_ticket_messages TO service_role;

-- Conserver admin_reply pendant la fenêtre de rollback, tout en rendant les
-- réponses historiques visibles dans le journal append-only.
INSERT INTO public.support_ticket_messages (
  ticket_id,
  author_id,
  author_role,
  content,
  created_at,
  request_id
)
SELECT
  ticket.id,
  NULL,
  'admin',
  ticket.admin_reply,
  COALESCE(ticket.updated_at, ticket.created_at, pg_catalog.now()),
  pg_catalog.gen_random_uuid()
FROM public.support_tickets AS ticket
WHERE ticket.admin_reply IS NOT NULL
  AND NULLIF(pg_catalog.btrim(ticket.admin_reply), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.support_ticket_messages AS existing_message
    WHERE existing_message.ticket_id = ticket.id
      AND existing_message.author_role = 'admin'
      AND existing_message.content = ticket.admin_reply
  );

COMMENT ON TABLE public.support_ticket_messages IS
  'Historique append-only des échanges et transitions de tickets support.';
COMMENT ON COLUMN public.support_ticket_messages.request_id IS
  'Clé UUID idempotente globale d''ajout d''un message ou d''une transition.';

CREATE TABLE public.support_delivery_outbox (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  message_id UUID NOT NULL,
  delivery_kind TEXT NOT NULL CHECK (
    delivery_kind IN ('ticket_created', 'admin_reply', 'ticket_status_changed')
  ),
  dedupe_key UUID NOT NULL UNIQUE,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'delivered', 'dead')
  ),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 8 CHECK (max_attempts BETWEEN 1 AND 20),
  lease_owner UUID,
  lease_expires_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  last_error TEXT CHECK (
    last_error IS NULL OR pg_catalog.char_length(last_error) <= 1000
  ),
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT support_delivery_outbox_lease_state_check CHECK (
    (
      status = 'processing'
      AND lease_owner IS NOT NULL
      AND lease_expires_at IS NOT NULL
    )
    OR (
      status <> 'processing'
      AND lease_owner IS NULL
      AND lease_expires_at IS NULL
    )
  ),
  CONSTRAINT support_delivery_outbox_delivered_at_check CHECK (
    status <> 'delivered' OR delivered_at IS NOT NULL
  ),
  CONSTRAINT support_delivery_outbox_ticket_message_fkey
    FOREIGN KEY (ticket_id, message_id)
    REFERENCES public.support_ticket_messages(ticket_id, id)
    ON DELETE CASCADE
);

CREATE INDEX idx_support_delivery_outbox_ready
  ON public.support_delivery_outbox (next_attempt_at, lease_expires_at, created_at)
  WHERE status IN ('pending', 'processing');
CREATE INDEX idx_support_delivery_outbox_ticket_id
  ON public.support_delivery_outbox (ticket_id);
CREATE INDEX idx_support_delivery_outbox_message_id
  ON public.support_delivery_outbox (message_id);

ALTER TABLE public.support_delivery_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_delivery_outbox_service_role_all"
  ON public.support_delivery_outbox
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.support_delivery_outbox
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.support_delivery_outbox
  TO service_role;

COMMENT ON TABLE public.support_delivery_outbox IS
  'File privée et dédupliquée des livraisons email/notification du support.';
COMMENT ON COLUMN public.support_delivery_outbox.last_error IS
  'Dernière erreur de livraison tronquée à 1000 caractères.';

CREATE OR REPLACE FUNCTION public.create_support_ticket_idempotent(
  p_request_id UUID,
  p_user_id UUID,
  p_user_email TEXT,
  p_user_name TEXT,
  p_user_plan TEXT,
  p_page_url TEXT,
  p_category TEXT,
  p_priority TEXT,
  p_subject TEXT,
  p_description TEXT,
  p_attachment_url TEXT
)
RETURNS public.support_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  ticket public.support_tickets%ROWTYPE;
  message_id UUID;
BEGIN
  IF p_request_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'request_id et user_id requis';
  END IF;
  IF NULLIF(pg_catalog.btrim(p_user_email), '') IS NULL
     OR pg_catalog.char_length(p_user_email) > 320
     OR NULLIF(pg_catalog.btrim(p_subject), '') IS NULL
     OR pg_catalog.char_length(p_subject) > 500
     OR NULLIF(pg_catalog.btrim(p_description), '') IS NULL
     OR pg_catalog.char_length(p_description) > 20000
     OR p_category NOT IN ('bug', 'question', 'suggestion')
     OR p_priority NOT IN ('low', 'normal', 'urgent') THEN
    RAISE EXCEPTION 'paramètres de ticket invalides';
  END IF;

  INSERT INTO public.support_tickets (
    request_id,
    user_id,
    user_email,
    user_name,
    user_plan,
    page_url,
    category,
    priority,
    subject,
    description,
    attachment_url
  ) VALUES (
    p_request_id,
    p_user_id,
    p_user_email,
    p_user_name,
    p_user_plan,
    p_page_url,
    p_category,
    p_priority,
    p_subject,
    p_description,
    p_attachment_url
  )
  ON CONFLICT (request_id) DO NOTHING
  RETURNING * INTO ticket;

  IF ticket.id IS NULL THEN
    SELECT *
    INTO ticket
    FROM public.support_tickets AS existing_ticket
    WHERE existing_ticket.request_id = p_request_id;

    IF ticket.id IS NULL
       OR ticket.user_id IS DISTINCT FROM p_user_id
       OR ticket.user_email IS DISTINCT FROM p_user_email
       OR ticket.category IS DISTINCT FROM p_category
       OR ticket.priority IS DISTINCT FROM p_priority
       OR ticket.subject IS DISTINCT FROM p_subject
       OR ticket.description IS DISTINCT FROM p_description
       OR ticket.attachment_url IS DISTINCT FROM p_attachment_url THEN
      RAISE EXCEPTION 'request_id de ticket réutilisé avec un autre contenu';
    END IF;
  END IF;

  INSERT INTO public.support_ticket_messages (
    ticket_id,
    author_id,
    author_role,
    content,
    request_id
  ) VALUES (
    ticket.id,
    p_user_id,
    'user',
    p_description,
    p_request_id
  )
  ON CONFLICT (request_id) DO NOTHING
  RETURNING id INTO message_id;

  IF message_id IS NULL THEN
    SELECT existing_message.id
    INTO message_id
    FROM public.support_ticket_messages AS existing_message
    WHERE existing_message.request_id = p_request_id
      AND existing_message.ticket_id = ticket.id
      AND existing_message.author_role = 'user';
    IF message_id IS NULL THEN
      RAISE EXCEPTION 'request_id de message réutilisé avec un autre contenu';
    END IF;
  END IF;

  INSERT INTO public.support_delivery_outbox (
    ticket_id,
    message_id,
    delivery_kind,
    dedupe_key,
    payload
  ) VALUES (
    ticket.id,
    message_id,
    'ticket_created',
    p_request_id,
    pg_catalog.jsonb_build_object('ticket_id', ticket.id)
  )
  ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN ticket;
END;
$$;

CREATE OR REPLACE FUNCTION public.reply_support_ticket_idempotent(
  p_ticket_id UUID,
  p_admin_id UUID,
  p_content TEXT,
  p_request_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  message_id UUID;
  existing_message public.support_ticket_messages%ROWTYPE;
BEGIN
  IF p_ticket_id IS NULL OR p_admin_id IS NULL OR p_request_id IS NULL
     OR NULLIF(pg_catalog.btrim(p_content), '') IS NULL
     OR pg_catalog.char_length(p_content) > 20000 THEN
    RAISE EXCEPTION 'paramètres de réponse invalides';
  END IF;

  SELECT *
  INTO existing_message
  FROM public.support_ticket_messages AS message
  WHERE message.request_id = p_request_id;
  IF FOUND THEN
    IF existing_message.ticket_id IS DISTINCT FROM p_ticket_id
       OR existing_message.author_id IS DISTINCT FROM p_admin_id
       OR existing_message.author_role IS DISTINCT FROM 'admin'
       OR existing_message.content IS DISTINCT FROM p_content THEN
      RAISE EXCEPTION 'request_id de réponse réutilisé avec un autre contenu';
    END IF;
    RETURN existing_message.id;
  END IF;

  PERFORM 1
  FROM public.support_tickets AS ticket
  WHERE ticket.id = p_ticket_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket support introuvable';
  END IF;

  INSERT INTO public.support_ticket_messages (
    ticket_id,
    author_id,
    author_role,
    content,
    request_id
  ) VALUES (
    p_ticket_id,
    p_admin_id,
    'admin',
    p_content,
    p_request_id
  )
  ON CONFLICT (request_id) DO NOTHING
  RETURNING id INTO message_id;

  IF message_id IS NULL THEN
    SELECT *
    INTO existing_message
    FROM public.support_ticket_messages AS message
    WHERE message.request_id = p_request_id;
    IF existing_message.ticket_id IS DISTINCT FROM p_ticket_id
       OR existing_message.author_id IS DISTINCT FROM p_admin_id
       OR existing_message.author_role IS DISTINCT FROM 'admin'
       OR existing_message.content IS DISTINCT FROM p_content THEN
      RAISE EXCEPTION 'request_id de réponse concurrent réutilisé';
    END IF;
    RETURN existing_message.id;
  END IF;

  UPDATE public.support_tickets
  SET admin_reply = p_content,
      updated_at = pg_catalog.now()
  WHERE id = p_ticket_id;

  INSERT INTO public.support_delivery_outbox (
    ticket_id,
    message_id,
    delivery_kind,
    dedupe_key,
    payload
  ) VALUES (
    p_ticket_id,
    message_id,
    'admin_reply',
    p_request_id,
    pg_catalog.jsonb_build_object(
      'ticket_id', p_ticket_id,
      'message_id', message_id
    )
  )
  ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN message_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_support_ticket_status_idempotent(
  p_ticket_id UUID,
  p_admin_id UUID,
  p_status TEXT,
  p_request_id UUID,
  p_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  message_content TEXT;
  message_id UUID;
  existing_delivery public.support_delivery_outbox%ROWTYPE;
  existing_message public.support_ticket_messages%ROWTYPE;
BEGIN
  IF p_ticket_id IS NULL OR p_admin_id IS NULL OR p_request_id IS NULL
     OR p_status NOT IN ('open', 'in_progress', 'resolved', 'closed')
     OR pg_catalog.char_length(COALESCE(p_note, '')) > 20000 THEN
    RAISE EXCEPTION 'paramètres de statut invalides';
  END IF;
  message_content := COALESCE(
    NULLIF(pg_catalog.btrim(p_note), ''),
    'status:' || p_status
  );

  SELECT *
  INTO existing_message
  FROM public.support_ticket_messages AS message
  WHERE message.request_id = p_request_id;
  IF FOUND THEN
    IF existing_message.ticket_id IS DISTINCT FROM p_ticket_id
       OR existing_message.author_id IS DISTINCT FROM p_admin_id
       OR existing_message.author_role IS DISTINCT FROM 'system'
       OR existing_message.content IS DISTINCT FROM message_content THEN
      RAISE EXCEPTION 'request_id de statut réutilisé avec un autre contenu';
    END IF;
    SELECT *
    INTO existing_delivery
    FROM public.support_delivery_outbox AS delivery
    WHERE delivery.dedupe_key = p_request_id
      AND delivery.delivery_kind = 'ticket_status_changed';
    IF existing_delivery.id IS NULL
       OR existing_delivery.ticket_id IS DISTINCT FROM p_ticket_id
       OR existing_delivery.message_id IS DISTINCT FROM existing_message.id
       OR existing_delivery.payload ->> 'status' IS DISTINCT FROM p_status THEN
      RAISE EXCEPTION 'request_id de statut réutilisé avec un autre statut';
    END IF;
    RETURN existing_message.id;
  END IF;

  PERFORM 1
  FROM public.support_tickets AS ticket
  WHERE ticket.id = p_ticket_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket support introuvable';
  END IF;

  INSERT INTO public.support_ticket_messages (
    ticket_id,
    author_id,
    author_role,
    content,
    request_id
  ) VALUES (
    p_ticket_id,
    p_admin_id,
    'system',
    message_content,
    p_request_id
  )
  ON CONFLICT (request_id) DO NOTHING
  RETURNING id INTO message_id;

  IF message_id IS NULL THEN
    SELECT *
    INTO existing_message
    FROM public.support_ticket_messages AS message
    WHERE message.request_id = p_request_id;
    IF existing_message.ticket_id IS DISTINCT FROM p_ticket_id
       OR existing_message.author_id IS DISTINCT FROM p_admin_id
       OR existing_message.author_role IS DISTINCT FROM 'system'
       OR existing_message.content IS DISTINCT FROM message_content THEN
      RAISE EXCEPTION 'request_id de statut concurrent réutilisé';
    END IF;
    SELECT *
    INTO existing_delivery
    FROM public.support_delivery_outbox AS delivery
    WHERE delivery.dedupe_key = p_request_id
      AND delivery.delivery_kind = 'ticket_status_changed';
    IF existing_delivery.id IS NULL
       OR existing_delivery.ticket_id IS DISTINCT FROM p_ticket_id
       OR existing_delivery.message_id IS DISTINCT FROM existing_message.id
       OR existing_delivery.payload ->> 'status' IS DISTINCT FROM p_status THEN
      RAISE EXCEPTION 'request_id de statut concurrent réutilisé avec un autre statut';
    END IF;
    RETURN existing_message.id;
  END IF;

  UPDATE public.support_tickets
  SET status = p_status,
      resolved_at = CASE
        WHEN p_status IN ('resolved', 'closed')
          THEN COALESCE(resolved_at, pg_catalog.now())
        ELSE NULL
      END,
      updated_at = pg_catalog.now()
  WHERE id = p_ticket_id;

  INSERT INTO public.support_delivery_outbox (
    ticket_id,
    message_id,
    delivery_kind,
    dedupe_key,
    payload
  ) VALUES (
    p_ticket_id,
    message_id,
    'ticket_status_changed',
    p_request_id,
    pg_catalog.jsonb_build_object(
      'ticket_id', p_ticket_id,
      'message_id', message_id,
      'status', p_status
    )
  )
  ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN message_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_support_deliveries(
  p_worker_id UUID,
  p_limit INTEGER DEFAULT 20,
  p_lease_seconds INTEGER DEFAULT 300
)
RETURNS SETOF public.support_delivery_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_worker_id IS NULL
     OR p_limit IS NULL
     OR p_lease_seconds IS NULL
     OR p_limit NOT BETWEEN 1 AND 100
     OR p_lease_seconds NOT BETWEEN 30 AND 3600 THEN
    RAISE EXCEPTION 'paramètres de claim invalides';
  END IF;

  UPDATE public.support_delivery_outbox AS delivery
  SET status = 'dead',
      lease_owner = NULL,
      lease_expires_at = NULL,
      last_error = COALESCE(
        delivery.last_error,
        'Lease expiré après le nombre maximal de tentatives'
      ),
      updated_at = pg_catalog.now()
  WHERE delivery.status = 'processing'
    AND delivery.lease_expires_at <= pg_catalog.now()
    AND delivery.attempt_count >= delivery.max_attempts;

  RETURN QUERY
  WITH candidates AS (
    SELECT delivery.id
    FROM public.support_delivery_outbox AS delivery
    WHERE delivery.attempt_count < delivery.max_attempts
      AND (
        (
          delivery.status = 'pending'
          AND delivery.next_attempt_at <= pg_catalog.now()
        )
        OR (
          delivery.status = 'processing'
          AND delivery.lease_expires_at <= pg_catalog.now()
        )
      )
    ORDER BY delivery.next_attempt_at, delivery.created_at, delivery.id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.support_delivery_outbox AS delivery
  SET status = 'processing',
      attempt_count = delivery.attempt_count + 1,
      lease_owner = p_worker_id,
      lease_expires_at = pg_catalog.now()
        + pg_catalog.make_interval(secs => p_lease_seconds),
      updated_at = pg_catalog.now()
  FROM candidates
  WHERE delivery.id = candidates.id
  RETURNING delivery.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_support_delivery_succeeded(
  p_delivery_id UUID,
  p_worker_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.support_delivery_outbox
  SET status = 'delivered',
      delivered_at = pg_catalog.now(),
      lease_owner = NULL,
      lease_expires_at = NULL,
      last_error = NULL,
      updated_at = pg_catalog.now()
  WHERE id = p_delivery_id
    AND status = 'processing'
    AND lease_owner = p_worker_id;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_support_delivery(
  p_delivery_id UUID,
  p_worker_id UUID,
  p_error TEXT,
  p_retry_seconds INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  delivery public.support_delivery_outbox%ROWTYPE;
  resulting_status TEXT;
BEGIN
  IF p_delivery_id IS NULL OR p_worker_id IS NULL
     OR NULLIF(pg_catalog.btrim(p_error), '') IS NULL
     OR p_retry_seconds NOT BETWEEN 1 AND 86400 THEN
    RAISE EXCEPTION 'paramètres d''échec invalides';
  END IF;

  SELECT *
  INTO delivery
  FROM public.support_delivery_outbox AS claimed_delivery
  WHERE claimed_delivery.id = p_delivery_id
    AND claimed_delivery.status = 'processing'
    AND claimed_delivery.lease_owner = p_worker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('updated', false, 'status', NULL);
  END IF;

  IF delivery.attempt_count >= delivery.max_attempts THEN
    UPDATE public.support_delivery_outbox
    SET status = 'dead',
        lease_owner = NULL,
        lease_expires_at = NULL,
        last_error = pg_catalog.left(p_error, 1000),
        updated_at = pg_catalog.now()
    WHERE id = p_delivery_id;
    resulting_status := 'dead';
  ELSE
    UPDATE public.support_delivery_outbox
    SET status = 'pending',
        lease_owner = NULL,
        lease_expires_at = NULL,
        next_attempt_at = pg_catalog.now()
          + pg_catalog.make_interval(secs => p_retry_seconds),
        last_error = pg_catalog.left(p_error, 1000),
        updated_at = pg_catalog.now()
    WHERE id = p_delivery_id;
    resulting_status := 'pending';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'updated', true,
    'status', resulting_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_support_ticket_idempotent(UUID,
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_support_ticket_idempotent(UUID,
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
TO service_role;

REVOKE ALL ON FUNCTION public.reply_support_ticket_idempotent(UUID,
  UUID, TEXT, UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reply_support_ticket_idempotent(UUID,
  UUID, TEXT, UUID)
TO service_role;

REVOKE ALL ON FUNCTION public.set_support_ticket_status_idempotent(UUID,
  UUID, TEXT, UUID, TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_support_ticket_status_idempotent(UUID,
  UUID, TEXT, UUID, TEXT)
TO service_role;

REVOKE ALL ON FUNCTION public.claim_support_deliveries(UUID,
  INTEGER, INTEGER)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_support_deliveries(UUID,
  INTEGER, INTEGER)
TO service_role;

REVOKE ALL ON FUNCTION public.mark_support_delivery_succeeded(UUID,
  UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_support_delivery_succeeded(UUID,
  UUID)
TO service_role;

REVOKE ALL ON FUNCTION public.fail_support_delivery(UUID,
  UUID, TEXT, INTEGER)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_support_delivery(UUID,
  UUID, TEXT, INTEGER)
TO service_role;

COMMENT ON FUNCTION public.create_support_ticket_idempotent(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) IS 'Crée un ticket, son premier message et sa livraison dans une transaction idempotente.';
COMMENT ON FUNCTION public.reply_support_ticket_idempotent(
  UUID, UUID, TEXT, UUID
) IS 'Ajoute une réponse admin append-only et maintient admin_reply pour le rollback.';
COMMENT ON FUNCTION public.set_support_ticket_status_idempotent(
  UUID, UUID, TEXT, UUID, TEXT
) IS 'Journalise et applique une transition de statut idempotente.';
COMMENT ON FUNCTION public.claim_support_deliveries(
  UUID, INTEGER, INTEGER
) IS 'Claim atomique avec lease et SKIP LOCKED pour les workers support.';
COMMENT ON FUNCTION public.mark_support_delivery_succeeded(
  UUID, UUID
) IS 'Finalise une livraison détenue par le worker qui l''a claimée.';
COMMENT ON FUNCTION public.fail_support_delivery(
  UUID, UUID, TEXT, INTEGER
) IS 'Reprogramme ou dead-letter une livraison et borne le détail d''erreur.';

-- Le bucket existe depuis 20260312000001. Modifier uniquement sa configuration
-- conserve les policies ownership existantes sur storage.objects.
UPDATE storage.buckets
SET public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY[
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif'
    ]::TEXT[]
WHERE id = 'support-attachments';

-- ROLLBACK NON DESTRUCTIF
-- 1. Arrêter les producteurs et consommateurs des nouvelles RPC avant retour arrière.
-- 2. Conserver les tables, leurs lignes, request_id et admin_reply pour permettre une
--    reprise sans perte; ne jamais supprimer ou réécrire les sept tickets historiques.
-- 3. Conserver la policy SELECT propriétaire et les révocations anon/authenticated.
-- 4. Les EXECUTE des RPC peuvent rester révoqués pendant l'investigation; ne jamais
--    rétablir une policy utilisateur autorisant écriture, modification ou suppression.
