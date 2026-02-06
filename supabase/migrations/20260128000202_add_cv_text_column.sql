-- ============================================
-- S6-6+: Add cv_text column for text mode
-- ============================================
-- Add cv_text column to support text paste mode (skip Docling)
-- Author: HuntZen Team
-- Date: 2026-01-28
-- Sprint: 6 - Text Mode Support

-- ============================================
-- 1. ADD CV_TEXT COLUMN
-- ============================================

ALTER TABLE cv_analyses
ADD COLUMN IF NOT EXISTS cv_text TEXT;

-- Add comment
COMMENT ON COLUMN cv_analyses.cv_text IS 'CV text content (if text mode used instead of PDF upload)';

-- ============================================
-- 2. UPDATE CONSTRAINTS
-- ============================================

-- Either pdf_url or cv_text must be present (but not both)
-- Note: This is a soft constraint - we check in application code
-- ALTER TABLE cv_analyses ADD CONSTRAINT cv_analyses_source_check
--     CHECK ((pdf_url IS NOT NULL AND cv_text IS NULL) OR (pdf_url IS NULL AND cv_text IS NOT NULL));

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

DO $$
DECLARE
    v_column_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'cv_analyses'
        AND column_name = 'cv_text'
    ) INTO v_column_exists;

    IF v_column_exists THEN
        RAISE NOTICE 'S6-6+ Migration complete: cv_text column added successfully';
    ELSE
        RAISE WARNING 'S6-6+ Migration failed: cv_text column not found';
    END IF;
END $$;
