-- ============================================
-- S6-6: Create CV Analyses Table
-- ============================================
-- Create table for storing CV analysis jobs and results
-- Author: HuntZen Team
-- Date: 2026-01-28
-- Sprint: 6 - Ticket S6-6

-- ============================================
-- 1. CREATE CV_ANALYSES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS cv_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- File information
    pdf_url TEXT,
    filename TEXT,

    -- Processing status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),

    -- Input parameters
    job_description TEXT,
    language TEXT DEFAULT 'fr' CHECK (language IN ('fr', 'en')),

    -- Results
    result JSONB,  -- Analysis results (ATS scores, suggestions, etc.)
    error_message TEXT,    -- Error message if failed (renamed from error to match existing schema)

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Add missing columns if they don't exist (for existing tables)
DO $$
BEGIN
    -- Add filename column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'cv_analyses' AND column_name = 'filename'
    ) THEN
        ALTER TABLE cv_analyses ADD COLUMN filename TEXT;
    END IF;

    -- Add job_description column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'cv_analyses' AND column_name = 'job_description'
    ) THEN
        ALTER TABLE cv_analyses ADD COLUMN job_description TEXT;
    END IF;

    -- Add language column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'cv_analyses' AND column_name = 'language'
    ) THEN
        ALTER TABLE cv_analyses ADD COLUMN language TEXT DEFAULT 'fr' CHECK (language IN ('fr', 'en'));
    END IF;

    -- Add completed_at column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'cv_analyses' AND column_name = 'completed_at'
    ) THEN
        ALTER TABLE cv_analyses ADD COLUMN completed_at TIMESTAMPTZ;
    END IF;
END $$;

-- Add comments
COMMENT ON TABLE cv_analyses IS 'CV analysis jobs with Modal async processing (S6-6)';
COMMENT ON COLUMN cv_analyses.status IS 'pending: uploaded, processing: Modal running, completed: success, failed: error';
COMMENT ON COLUMN cv_analyses.pdf_url IS 'Supabase Storage URL for uploaded PDF';
COMMENT ON COLUMN cv_analyses.result IS 'Analysis results from Modal (ATS scores, suggestions, etc.)';
COMMENT ON COLUMN cv_analyses.error_message IS 'Error message if status = failed';

-- ============================================
-- 2. CREATE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_cv_analyses_user_id ON cv_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_cv_analyses_status ON cv_analyses(status);
CREATE INDEX IF NOT EXISTS idx_cv_analyses_user_status ON cv_analyses(user_id, status);
CREATE INDEX IF NOT EXISTS idx_cv_analyses_created_at ON cv_analyses(created_at DESC);

-- ============================================
-- 3. RLS POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE cv_analyses ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can read own CV analyses" ON cv_analyses;
DROP POLICY IF EXISTS "Users can insert own CV analyses" ON cv_analyses;
DROP POLICY IF EXISTS "Service role can update any CV analysis" ON cv_analyses;
DROP POLICY IF EXISTS "Users can delete own CV analyses" ON cv_analyses;

-- Users can read their own CV analyses
CREATE POLICY "Users can read own CV analyses"
    ON cv_analyses
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own CV analyses
CREATE POLICY "Users can insert own CV analyses"
    ON cv_analyses
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Service role can update any CV analysis (for Modal updates)
CREATE POLICY "Service role can update any CV analysis"
    ON cv_analyses
    FOR UPDATE
    USING (true);  -- Service role bypasses RLS anyway

-- Users can delete their own CV analyses
CREATE POLICY "Users can delete own CV analyses"
    ON cv_analyses
    FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- 4. HELPER FUNCTIONS
-- ============================================

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS get_cv_analysis_status(UUID);
DROP FUNCTION IF EXISTS list_user_cv_analyses(UUID, INTEGER, INTEGER);

-- Get CV analysis status
CREATE OR REPLACE FUNCTION get_cv_analysis_status(p_cv_id UUID)
RETURNS TABLE (
    id UUID,
    user_id UUID,
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
    WHERE ca.id = p_cv_id;
END;
$$;

-- List user CV analyses
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

-- ============================================
-- 5. CREATE STORAGE BUCKET
-- ============================================

-- Insert bucket if not exists (Supabase Storage)
INSERT INTO storage.buckets (id, name, public)
VALUES ('cvs', 'cvs', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing storage policies if they exist
DROP POLICY IF EXISTS "Users can upload their own CVs" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their own CVs" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own CVs" ON storage.objects;

-- RLS policies for storage bucket
CREATE POLICY "Users can upload their own CVs"
    ON storage.objects
    FOR INSERT
    WITH CHECK (bucket_id = 'cvs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can read their own CVs"
    ON storage.objects
    FOR SELECT
    USING (bucket_id = 'cvs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own CVs"
    ON storage.objects
    FOR DELETE
    USING (bucket_id = 'cvs' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

DO $$
DECLARE
    v_table_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'cv_analyses'
    ) INTO v_table_exists;

    IF v_table_exists THEN
        RAISE NOTICE 'S6-6 Migration complete: cv_analyses table created successfully';
    ELSE
        RAISE WARNING 'S6-6 Migration failed: cv_analyses table not found';
    END IF;
END $$;
