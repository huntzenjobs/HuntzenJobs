-- ============================================================================
-- BRANDING PROFILES — Persistance de la mémoire de l'agent branding
-- ============================================================================
-- Objectif : stocker le profil branding structuré de chaque session utilisateur
--            afin que l'agent branding reprenne là où il s'est arrêté.
--
-- Dépendances : coach_conversations (FK souple — ON DELETE SET NULL)
-- Migration Date : 2026-05-18
-- ============================================================================

-- ============================================================================
-- 1. TABLE branding_profiles
-- ============================================================================

CREATE TABLE IF NOT EXISTS branding_profiles (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id            UUID        NOT NULL,
    conversation_id       UUID        REFERENCES coach_conversations(id) ON DELETE SET NULL,

    -- État de la machine à états
    current_state         TEXT        NOT NULL DEFAULT 'discovery'
                          CHECK (current_state IN (
                              'discovery', 'goals', 'voice_preferences',
                              'audience_topics', 'content_generation'
                          )),

    -- Profil textuel
    professional_identity TEXT,
    current_context       TEXT,
    primary_goal          TEXT,

    -- Listes (stockées en JSONB)
    target_audience       JSONB       NOT NULL DEFAULT '[]'::jsonb,
    content_pillars       JSONB       NOT NULL DEFAULT '[]'::jsonb,
    content_boundaries    JSONB       NOT NULL DEFAULT '[]'::jsonb,
    platforms             JSONB       NOT NULL DEFAULT '[]'::jsonb,
    format_preferences    JSONB       NOT NULL DEFAULT '[]'::jsonb,

    -- Dictionnaire de ton
    voice_preferences     JSONB       NOT NULL DEFAULT '{}'::jsonb,

    -- Métriques calculées
    profile_completion    INTEGER     NOT NULL DEFAULT 0 CHECK (profile_completion BETWEEN 0 AND 100),
    ready_for_generation  BOOLEAN     NOT NULL DEFAULT FALSE,

    -- Horodatages
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contrainte unicité : une ligne par (user, session)
ALTER TABLE branding_profiles
    DROP CONSTRAINT IF EXISTS branding_profiles_user_session_unique;
ALTER TABLE branding_profiles
    ADD CONSTRAINT branding_profiles_user_session_unique
    UNIQUE (user_id, session_id);

-- ============================================================================
-- 2. INDEX
-- ============================================================================

CREATE INDEX IF NOT EXISTS branding_profiles_user_id_idx
    ON branding_profiles (user_id);

CREATE INDEX IF NOT EXISTS branding_profiles_session_id_idx
    ON branding_profiles (session_id);

-- ============================================================================
-- 3. TRIGGER updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_branding_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_branding_profiles_updated_at ON branding_profiles;
CREATE TRIGGER trg_branding_profiles_updated_at
    BEFORE UPDATE ON branding_profiles
    FOR EACH ROW EXECUTE FUNCTION update_branding_profiles_updated_at();

-- ============================================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE branding_profiles ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs ne voient que leurs propres profils
DROP POLICY IF EXISTS branding_profiles_select_own ON branding_profiles;
CREATE POLICY branding_profiles_select_own
    ON branding_profiles FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS branding_profiles_insert_own ON branding_profiles;
CREATE POLICY branding_profiles_insert_own
    ON branding_profiles FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS branding_profiles_update_own ON branding_profiles;
CREATE POLICY branding_profiles_update_own
    ON branding_profiles FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS branding_profiles_delete_own ON branding_profiles;
CREATE POLICY branding_profiles_delete_own
    ON branding_profiles FOR DELETE
    USING (auth.uid() = user_id);

-- Commentaires
COMMENT ON TABLE branding_profiles IS
    'Mémoire persistante du profil branding par session utilisateur (agent branding HuntZen).';
COMMENT ON COLUMN branding_profiles.current_state IS
    'État courant de la machine à états branding : discovery → goals → voice_preferences → audience_topics → content_generation.';
COMMENT ON COLUMN branding_profiles.profile_completion IS
    'Score de complétion 0-100 calculé côté Python par branding_memory.calculate_profile_completion().';
COMMENT ON COLUMN branding_profiles.ready_for_generation IS
    'True si state=content_generation ET completion >= 70%.';
