-- ============================================
-- SAVED JOBS TABLE (Sprint 7 - Jobs Favorites)
-- ============================================
-- Create table for users to save favorite job listings
-- Date: 2026-01-29

-- Create saved_jobs table
CREATE TABLE IF NOT EXISTS saved_jobs (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User reference
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Job details
    job_title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT NOT NULL,
    salary TEXT,
    job_url TEXT NOT NULL,
    description TEXT,

    -- External job ID (to prevent duplicates)
    external_job_id TEXT,

    -- Metadata
    saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Job source (adzuna, linkedin, etc.)
    job_source TEXT DEFAULT 'adzuna',

    -- Additional metadata (JSON for flexibility)
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Prevent duplicate saves
    CONSTRAINT unique_user_job UNIQUE (user_id, external_job_id, job_source)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_saved_jobs_user_id ON saved_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_jobs_saved_at ON saved_jobs(saved_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_jobs_external_id ON saved_jobs(external_job_id);

-- Enable Row Level Security (RLS)
ALTER TABLE saved_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Drop existing policies if they exist (to avoid conflicts on re-run)
DROP POLICY IF EXISTS "Users can view their own saved jobs" ON saved_jobs;
DROP POLICY IF EXISTS "Users can insert their own saved jobs" ON saved_jobs;
DROP POLICY IF EXISTS "Users can update their own saved jobs" ON saved_jobs;
DROP POLICY IF EXISTS "Users can delete their own saved jobs" ON saved_jobs;

-- Users can only see their own saved jobs
CREATE POLICY "Users can view their own saved jobs"
    ON saved_jobs
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own saved jobs
CREATE POLICY "Users can insert their own saved jobs"
    ON saved_jobs
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own saved jobs
CREATE POLICY "Users can update their own saved jobs"
    ON saved_jobs
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own saved jobs
CREATE POLICY "Users can delete their own saved jobs"
    ON saved_jobs
    FOR DELETE
    USING (auth.uid() = user_id);

-- Trigger to update updated_at on changes
CREATE OR REPLACE FUNCTION update_saved_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER saved_jobs_updated_at_trigger
    BEFORE UPDATE ON saved_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_saved_jobs_updated_at();

-- Grant permissions
GRANT ALL ON saved_jobs TO authenticated;
GRANT ALL ON saved_jobs TO service_role;

-- Add comment
COMMENT ON TABLE saved_jobs IS 'Stores users favorite/saved job listings for easy access';
