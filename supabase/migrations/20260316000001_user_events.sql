-- Migration: user_events
-- Système de tracking des événements utilisateurs pour l'admin temps réel

CREATE TABLE IF NOT EXISTS user_events (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at      timestamptz DEFAULT now() NOT NULL,
    user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    event_name      text NOT NULL,
    event_label     text,
    category        text NOT NULL DEFAULT 'action',
    feature         text,
    severity        text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'success', 'warning', 'error')),
    properties      jsonb NOT NULL DEFAULT '{}',
    error_code      text,
    duration_ms     integer,
    source          text NOT NULL DEFAULT 'backend' CHECK (source IN ('backend', 'frontend'))
);

-- Index principaux
CREATE INDEX IF NOT EXISTS idx_user_events_user_created
    ON user_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_events_category_created
    ON user_events(category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_events_created
    ON user_events(created_at DESC);

-- Index partiel sur les erreurs uniquement
CREATE INDEX IF NOT EXISTS idx_user_events_errors
    ON user_events(created_at DESC)
    WHERE severity = 'error';

-- Index pour heatmap par heure (via fonction IMMUTABLE pour contourner la contrainte PostgreSQL)
CREATE OR REPLACE FUNCTION user_event_hour(ts timestamptz)
RETURNS double precision LANGUAGE sql IMMUTABLE AS
$$ SELECT EXTRACT(hour FROM ts AT TIME ZONE 'UTC') $$;

CREATE INDEX IF NOT EXISTS idx_user_events_hour
    ON user_events(user_event_hour(created_at));

-- Index GIN full-text sur event_label (recherche admin)
CREATE INDEX IF NOT EXISTS idx_user_events_label_fts
    ON user_events USING gin(to_tsvector('french', coalesce(event_label, '')));

-- RLS
ALTER TABLE user_events ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs voient uniquement leurs propres événements
CREATE POLICY "users_read_own" ON user_events
    FOR SELECT USING (auth.uid() = user_id);

-- Activer Realtime pour le suivi admin en temps réel
ALTER PUBLICATION supabase_realtime ADD TABLE user_events;

-- Fonction de purge (appelée par le cron quotidien)
CREATE OR REPLACE FUNCTION purge_old_user_events()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count integer;
BEGIN
    DELETE FROM user_events
    WHERE created_at < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;
