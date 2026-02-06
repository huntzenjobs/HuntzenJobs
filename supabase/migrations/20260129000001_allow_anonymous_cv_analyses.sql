-- ============================================
-- Allow Anonymous CV Analyses
-- ============================================
-- This migration enables anonymous users to analyze CVs without authentication
-- Author: HuntZen Team
-- Date: 2026-01-29
-- Sprint: 6 - Fix for anonymous CV analysis

-- ============================================
-- 1. MAKE user_id NULLABLE
-- ============================================

-- Remove NOT NULL constraint from user_id
-- This allows anonymous users to analyze CVs
ALTER TABLE cv_analyses
    ALTER COLUMN user_id DROP NOT NULL;

-- Add comment explaining nullable user_id
COMMENT ON COLUMN cv_analyses.user_id IS 'User UUID (NULL for anonymous users)';

-- ============================================
-- 2. ADD ANONYMOUS USER TRACKING
-- ============================================

-- Add columns for tracking anonymous users
DO $$
BEGIN
    -- Add anonymous_id column if missing (for tracking anonymous sessions)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'cv_analyses' AND column_name = 'anonymous_id'
    ) THEN
        ALTER TABLE cv_analyses ADD COLUMN anonymous_id TEXT;
    END IF;

    -- Add client_ip column if missing (for rate limiting anonymous users)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'cv_analyses' AND column_name = 'client_ip'
    ) THEN
        ALTER TABLE cv_analyses ADD COLUMN client_ip TEXT;
    END IF;
END $$;

-- Add comments
COMMENT ON COLUMN cv_analyses.anonymous_id IS 'Session ID for anonymous users (NULL for authenticated users)';
COMMENT ON COLUMN cv_analyses.client_ip IS 'Client IP address (for anonymous user rate limiting)';

-- ============================================
-- 3. CREATE INDEXES FOR ANONYMOUS USERS
-- ============================================

-- Index for anonymous user lookups
CREATE INDEX IF NOT EXISTS idx_cv_analyses_anonymous_id ON cv_analyses(anonymous_id)
    WHERE anonymous_id IS NOT NULL;

-- Index for IP-based rate limiting
CREATE INDEX IF NOT EXISTS idx_cv_analyses_client_ip ON cv_analyses(client_ip, created_at)
    WHERE client_ip IS NOT NULL;

-- ============================================
-- 4. UPDATE RLS POLICIES
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can read own CV analyses" ON cv_analyses;
DROP POLICY IF EXISTS "Users can insert own CV analyses" ON cv_analyses;
DROP POLICY IF EXISTS "Users can delete own CV analyses" ON cv_analyses;
DROP POLICY IF EXISTS "Service role can update any CV analysis" ON cv_analyses;

-- Policy 1: Authenticated users can read their own analyses
CREATE POLICY "Authenticated users can read own CV analyses"
    ON cv_analyses
    FOR SELECT
    USING (
        auth.uid() = user_id
    );

-- Policy 2: Anonymous users can read their analyses by anonymous_id
-- This allows frontend to poll status without authentication
CREATE POLICY "Anonymous users can read own CV analyses"
    ON cv_analyses
    FOR SELECT
    USING (
        user_id IS NULL
        AND anonymous_id IS NOT NULL
    );

-- Policy 3: Authenticated users can insert their own analyses
CREATE POLICY "Authenticated users can insert own CV analyses"
    ON cv_analyses
    FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
    );

-- Policy 4: Anonymous users can insert analyses (backend will set anonymous_id)
-- No auth check - backend controls access via rate limiting
CREATE POLICY "Anonymous users can insert CV analyses"
    ON cv_analyses
    FOR INSERT
    WITH CHECK (
        user_id IS NULL
        AND anonymous_id IS NOT NULL
    );

-- Policy 5: Service role can update any CV analysis (for Modal updates)
CREATE POLICY "Service role can update any CV analysis"
    ON cv_analyses
    FOR UPDATE
    USING (true);  -- Service role bypasses RLS anyway

-- Policy 6: Authenticated users can delete their own analyses
CREATE POLICY "Authenticated users can delete own CV analyses"
    ON cv_analyses
    FOR DELETE
    USING (
        auth.uid() = user_id
    );

-- Policy 7: Anonymous users can delete their own analyses
CREATE POLICY "Anonymous users can delete own CV analyses"
    ON cv_analyses
    FOR DELETE
    USING (
        user_id IS NULL
        AND anonymous_id IS NOT NULL
    );

-- ============================================
-- 5. UPDATE HELPER FUNCTIONS
-- ============================================

-- Drop existing functions
DROP FUNCTION IF EXISTS get_cv_analysis_status(UUID);
DROP FUNCTION IF EXISTS list_user_cv_analyses(UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS count_anonymous_analyses(TEXT, INTERVAL);

-- Get CV analysis status (supports both authenticated and anonymous users)
CREATE OR REPLACE FUNCTION get_cv_analysis_status(
    p_cv_id UUID,
    p_user_id UUID DEFAULT NULL,
    p_anonymous_id TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    anonymous_id TEXT,
    status TEXT,
    result JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    processing_time_seconds INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ca.id,
        ca.user_id,
        ca.anonymous_id,
        ca.status,
        ca.result,
        ca.error_message,
        ca.created_at,
        ca.completed_at,
        CASE
            WHEN ca.completed_at IS NOT NULL AND ca.created_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (ca.completed_at - ca.created_at))::INTEGER
            ELSE NULL
        END AS processing_time_seconds
    FROM cv_analyses ca
    WHERE ca.id = p_cv_id
        AND (
            -- Authenticated user check
            (p_user_id IS NOT NULL AND ca.user_id = p_user_id)
            OR
            -- Anonymous user check
            (p_anonymous_id IS NOT NULL AND ca.anonymous_id = p_anonymous_id)
        );
END;
$$;

-- List user CV analyses (authenticated users only)
CREATE OR REPLACE FUNCTION list_user_cv_analyses(
    p_user_id UUID,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    status TEXT,
    created_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    processing_time_seconds INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ca.id,
        ca.status,
        ca.created_at,
        ca.completed_at,
        CASE
            WHEN ca.completed_at IS NOT NULL AND ca.created_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (ca.completed_at - ca.created_at))::INTEGER
            ELSE NULL
        END AS processing_time_seconds
    FROM cv_analyses ca
    WHERE ca.user_id = p_user_id
    ORDER BY ca.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Count anonymous analyses by IP (for rate limiting)
CREATE OR REPLACE FUNCTION count_anonymous_analyses(
    p_client_ip TEXT,
    p_time_window INTERVAL DEFAULT INTERVAL '24 hours'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO v_count
    FROM cv_analyses
    WHERE client_ip = p_client_ip
        AND user_id IS NULL
        AND created_at > (NOW() - p_time_window);

    RETURN v_count;
END;
$$;

-- ============================================
-- 6. UPDATE STORAGE POLICIES (Optional)
-- ============================================

-- Allow anonymous users to upload CVs (identified by anonymous_id in path)
-- Pattern: cvs/anonymous/{anonymous_id}/{filename}

DROP POLICY IF EXISTS "Anonymous users can upload CVs" ON storage.objects;
DROP POLICY IF EXISTS "Anonymous users can read their CVs" ON storage.objects;

CREATE POLICY "Anonymous users can upload CVs"
    ON storage.objects
    FOR INSERT
    WITH CHECK (
        bucket_id = 'cvs'
        AND (storage.foldername(name))[1] = 'anonymous'
    );

CREATE POLICY "Anonymous users can read their CVs"
    ON storage.objects
    FOR SELECT
    USING (
        bucket_id = 'cvs'
        AND (storage.foldername(name))[1] = 'anonymous'
    );

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

DO $$
DECLARE
    v_user_id_nullable BOOLEAN;
    v_anonymous_id_exists BOOLEAN;
BEGIN
    -- Check if user_id is nullable
    SELECT is_nullable = 'YES'
    INTO v_user_id_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
        AND table_name = 'cv_analyses'
        AND column_name = 'user_id';

    -- Check if anonymous_id exists
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
            AND table_name = 'cv_analyses'
            AND column_name = 'anonymous_id'
    ) INTO v_anonymous_id_exists;

    IF v_user_id_nullable AND v_anonymous_id_exists THEN
        RAISE NOTICE '✅ Migration complete: Anonymous CV analyses enabled';
        RAISE NOTICE 'Changes:';
        RAISE NOTICE '  - user_id is now nullable';
        RAISE NOTICE '  - anonymous_id column added for tracking';
        RAISE NOTICE '  - client_ip column added for rate limiting';
        RAISE NOTICE '  - RLS policies updated for anonymous access';
    ELSE
        RAISE WARNING '❌ Migration incomplete - please check errors above';
    END IF;
END $$;
