-- Ferme la course COUNT -> INSERT sur la limite de création des tickets.
-- La migration est additive et ne modifie ni ne supprime aucune donnée.

SET lock_timeout = '5s';
SET statement_timeout = '30s';

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
  recent_ticket_count BIGINT;
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

  -- Toutes les créations d'un même utilisateur passent par la même section
  -- critique transactionnelle, y compris lorsqu'elles arrivent en parallèle.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::TEXT, 0)
  );

  -- Un rejeu identique ne consomme jamais une nouvelle place dans le quota.
  SELECT *
  INTO ticket
  FROM public.support_tickets AS existing_ticket
  WHERE existing_ticket.request_id = p_request_id;

  IF ticket.id IS NOT NULL THEN
    IF ticket.user_id IS DISTINCT FROM p_user_id
       OR ticket.user_email IS DISTINCT FROM p_user_email
       OR ticket.user_name IS DISTINCT FROM p_user_name
       OR ticket.user_plan IS DISTINCT FROM p_user_plan
       OR ticket.page_url IS DISTINCT FROM p_page_url
       OR ticket.category IS DISTINCT FROM p_category
       OR ticket.priority IS DISTINCT FROM p_priority
       OR ticket.subject IS DISTINCT FROM p_subject
       OR ticket.description IS DISTINCT FROM p_description
       OR ticket.attachment_url IS DISTINCT FROM p_attachment_url THEN
      RAISE EXCEPTION 'request_id de ticket réutilisé avec un autre contenu';
    END IF;
    RETURN ticket;
  END IF;

  SELECT pg_catalog.count(*)
  INTO recent_ticket_count
  FROM public.support_tickets AS recent_ticket
  WHERE recent_ticket.user_id = p_user_id
    AND recent_ticket.created_at >= pg_catalog.now() - INTERVAL '1 hour';

  IF recent_ticket_count >= 5 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'support_ticket_rate_limit_exceeded';
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
       OR ticket.user_name IS DISTINCT FROM p_user_name
       OR ticket.user_plan IS DISTINCT FROM p_user_plan
       OR ticket.page_url IS DISTINCT FROM p_page_url
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

REVOKE ALL ON FUNCTION public.create_support_ticket_idempotent(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_support_ticket_idempotent(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;

COMMENT ON FUNCTION public.create_support_ticket_idempotent(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) IS 'Crée un ticket de façon idempotente avec une limite atomique de cinq créations par utilisateur et par heure.';

RESET statement_timeout;
RESET lock_timeout;
