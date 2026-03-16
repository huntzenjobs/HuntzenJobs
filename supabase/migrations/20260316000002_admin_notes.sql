-- Migration: admin_notes
-- Notes privées que les admins peuvent ajouter sur les utilisateurs

CREATE TABLE IF NOT EXISTS admin_notes (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at  timestamptz DEFAULT now() NOT NULL,
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    admin_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    note        text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_notes_user_id
    ON admin_notes(user_id, created_at DESC);

-- RLS activé — seul service_role accède (pas de policy SELECT pour les users)
ALTER TABLE admin_notes ENABLE ROW LEVEL SECURITY;
