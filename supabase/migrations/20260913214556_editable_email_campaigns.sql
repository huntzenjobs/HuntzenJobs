-- Contenu éditable et gel transactionnel des campagnes administrateur.
-- Cette migration ne déclenche aucun envoi.

SET lock_timeout = '5s';

ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS editor_mode TEXT,
  ADD COLUMN IF NOT EXISTS email_subject TEXT,
  ADD COLUMN IF NOT EXISTS email_content TEXT,
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

ALTER TABLE public.email_campaigns
  DROP CONSTRAINT IF EXISTS email_campaigns_campaign_type_check;

ALTER TABLE public.email_campaigns
  ADD CONSTRAINT email_campaigns_campaign_type_check CHECK (
    campaign_type IN (
      'service-update',
      'marketing-reactivation',
      'marketing-reactivation-all'
    )
  );

ALTER TABLE public.email_campaigns
  ADD CONSTRAINT email_campaigns_editor_mode_check CHECK (
    editor_mode IS NULL OR editor_mode IN ('simple', 'html')
  ),
  ADD CONSTRAINT email_campaigns_editable_content_check CHECK (
    (
      editor_mode IS NULL
      AND email_subject IS NULL
      AND email_content IS NULL
      AND content_hash IS NULL
    )
    OR (
      editor_mode IS NOT NULL
      AND NULLIF(BTRIM(email_subject), '') IS NOT NULL
      AND NULLIF(BTRIM(email_content), '') IS NOT NULL
      AND content_hash IS NOT NULL
      AND content_hash ~ '^[0-9a-f]{64}$'
    )
  );

CREATE OR REPLACE FUNCTION public.freeze_editable_email_campaign(
  p_campaign_id UUID,
  p_campaign_type TEXT,
  p_template_version TEXT,
  p_created_by UUID,
  p_confirmed_total INTEGER,
  p_editor_mode TEXT,
  p_email_subject TEXT,
  p_email_content TEXT,
  p_content_hash TEXT
)
RETURNS SETOF public.email_campaigns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_campaign public.email_campaigns%ROWTYPE;
  v_actual_total INTEGER;
  v_content_hash TEXT;
BEGIN
  IF p_campaign_type NOT IN (
    'service-update',
    'marketing-reactivation',
    'marketing-reactivation-all'
  ) THEN
    RAISE EXCEPTION 'Unknown campaign type';
  END IF;
  IF p_confirmed_total < 0 THEN
    RAISE EXCEPTION 'Invalid confirmed total';
  END IF;
  IF p_editor_mode NOT IN ('simple', 'html') THEN
    RAISE EXCEPTION 'Invalid editor mode';
  END IF;
  v_content_hash := ENCODE(
    DIGEST(
      p_editor_mode || E'\n' || BTRIM(p_email_subject) || E'\n' || BTRIM(p_email_content),
      'sha256'
    ),
    'hex'
  );
  IF NULLIF(BTRIM(p_email_subject), '') IS NULL
    OR NULLIF(BTRIM(p_email_content), '') IS NULL
    OR p_content_hash IS NULL
    OR p_content_hash <> v_content_hash
  THEN
    RAISE EXCEPTION 'Invalid campaign content';
  END IF;

  INSERT INTO public.email_campaigns (
    id,
    campaign_type,
    template_version,
    status,
    created_by,
    editor_mode,
    email_subject,
    email_content,
    content_hash
  ) VALUES (
    p_campaign_id,
    p_campaign_type,
    p_template_version,
    'draft',
    p_created_by,
    p_editor_mode,
    p_email_subject,
    p_email_content,
    p_content_hash
  ) ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_campaign
  FROM public.email_campaigns
  WHERE id = p_campaign_id
  FOR UPDATE;

  IF v_campaign.campaign_type IS DISTINCT FROM p_campaign_type
    OR v_campaign.template_version IS DISTINCT FROM p_template_version
  THEN
    RAISE EXCEPTION 'Campaign content mismatch';
  END IF;

  IF v_campaign.audience_frozen_at IS NOT NULL
    AND v_campaign.editor_mode IS NULL
    AND v_campaign.email_subject IS NULL
    AND v_campaign.email_content IS NULL
    AND v_campaign.content_hash IS NULL
  THEN
    IF v_campaign.audience_total <> p_confirmed_total THEN
      RAISE EXCEPTION 'Confirmed total mismatch';
    END IF;
    RETURN NEXT v_campaign;
    RETURN;
  END IF;

  IF v_campaign.editor_mode IS DISTINCT FROM p_editor_mode
    OR v_campaign.email_subject IS DISTINCT FROM p_email_subject
    OR v_campaign.email_content IS DISTINCT FROM p_email_content
    OR v_campaign.content_hash IS DISTINCT FROM p_content_hash
  THEN
    RAISE EXCEPTION 'Campaign content mismatch';
  END IF;

  IF v_campaign.audience_frozen_at IS NOT NULL THEN
    IF v_campaign.audience_total <> p_confirmed_total THEN
      RAISE EXCEPTION 'Confirmed total mismatch';
    END IF;
    RETURN NEXT v_campaign;
    RETURN;
  END IF;
  IF v_campaign.status <> 'draft' THEN
    RAISE EXCEPTION 'Campaign cannot be frozen';
  END IF;

  DELETE FROM public.email_campaign_deliveries
  WHERE campaign_id = p_campaign_id;

  INSERT INTO public.email_campaign_deliveries (
    campaign_id, user_id, email_hash, language, batch_number
  )
  SELECT
    p_campaign_id,
    eligible.id,
    ENCODE(DIGEST(LOWER(BTRIM(eligible.email)), 'sha256'), 'hex'),
    COALESCE(eligible.preferred_language, 'en'),
    ((ROW_NUMBER() OVER (ORDER BY eligible.id) - 1) / 100 + 1)::INTEGER
  FROM public.profiles AS eligible
  WHERE eligible.status = 'active'
    AND NULLIF(BTRIM(eligible.email), '') IS NOT NULL
    AND (
      p_campaign_type = 'service-update'
      OR (
        p_campaign_type = 'marketing-reactivation-all'
        AND eligible.newsletter_unsubscribed_at IS NULL
      )
      OR (
        p_campaign_type = 'marketing-reactivation'
        AND eligible.newsletter_subscribed IS TRUE
        AND eligible.newsletter_consent_at IS NOT NULL
        AND eligible.newsletter_unsubscribed_at IS NULL
      )
    )
  ORDER BY eligible.id;

  GET DIAGNOSTICS v_actual_total = ROW_COUNT;
  IF v_actual_total <> p_confirmed_total THEN
    RAISE EXCEPTION 'Confirmed total mismatch';
  END IF;

  UPDATE public.email_campaigns
  SET
    audience_total = v_actual_total,
    audience_frozen_at = NOW(),
    status = 'ready',
    updated_at = NOW()
  WHERE id = p_campaign_id
  RETURNING * INTO v_campaign;

  RETURN NEXT v_campaign;
END;
$$;

REVOKE ALL ON FUNCTION public.freeze_editable_email_campaign(
  UUID, TEXT, TEXT, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.freeze_editable_email_campaign(
  UUID, TEXT, TEXT, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT
) TO service_role;

CREATE OR REPLACE FUNCTION public.protect_frozen_email_campaign_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.audience_frozen_at IS NOT NULL AND (
    NEW.editor_mode IS DISTINCT FROM OLD.editor_mode
    OR NEW.email_subject IS DISTINCT FROM OLD.email_subject
    OR NEW.email_content IS DISTINCT FROM OLD.email_content
    OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
  ) THEN
    RAISE EXCEPTION 'Frozen campaign content cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_frozen_email_campaign_content
  ON public.email_campaigns;
CREATE TRIGGER protect_frozen_email_campaign_content
BEFORE UPDATE OF editor_mode, email_subject, email_content, content_hash
ON public.email_campaigns
FOR EACH ROW
EXECUTE FUNCTION public.protect_frozen_email_campaign_content();

REVOKE ALL ON FUNCTION public.protect_frozen_email_campaign_content()
  FROM PUBLIC, anon, authenticated;
