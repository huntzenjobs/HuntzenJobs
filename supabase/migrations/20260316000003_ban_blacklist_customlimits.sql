-- Migration: ban, blacklist emails, limites custom
-- Gestion avancée des utilisateurs depuis l'admin

-- Champ ban sur profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned boolean DEFAULT false;

-- Liste noire emails/domaines (inscriptions bloquées)
CREATE TABLE IF NOT EXISTS email_blacklist (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at  timestamptz DEFAULT now() NOT NULL,
    domain      text,
    email       text,
    reason      text,
    CONSTRAINT email_blacklist_has_target CHECK (domain IS NOT NULL OR email IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_email_blacklist_email  ON email_blacklist(email);
CREATE INDEX IF NOT EXISTS idx_email_blacklist_domain ON email_blacklist(domain);

-- RLS désactivé intentionnellement : lu uniquement par service_role au niveau middleware
ALTER TABLE email_blacklist ENABLE ROW LEVEL SECURITY;

-- Limites custom par user (override les limites du plan)
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS custom_limits jsonb;
