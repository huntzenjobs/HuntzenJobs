-- Create Supabase Storage bucket for CVs
-- Run this in Supabase Dashboard > SQL Editor if bucket doesn't exist

-- Insert bucket if not exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'cvs',
    'cvs',
    true,
    10485760, -- 10MB
    ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['application/pdf']::text[];

-- RLS policies for storage bucket (if not exist)
DO $$
BEGIN
    -- Users can upload their own CVs
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname = 'Users can upload their own CVs'
    ) THEN
        CREATE POLICY "Users can upload their own CVs"
            ON storage.objects
            FOR INSERT
            WITH CHECK (bucket_id = 'cvs' AND auth.uid()::text = (storage.foldername(name))[1]);
    END IF;

    -- Users can read their own CVs
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname = 'Users can read their own CVs'
    ) THEN
        CREATE POLICY "Users can read their own CVs"
            ON storage.objects
            FOR SELECT
            USING (bucket_id = 'cvs' AND auth.uid()::text = (storage.foldername(name))[1]);
    END IF;

    -- Users can delete their own CVs
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname = 'Users can delete their own CVs'
    ) THEN
        CREATE POLICY "Users can delete their own CVs"
            ON storage.objects
            FOR DELETE
            USING (bucket_id = 'cvs' AND auth.uid()::text = (storage.foldername(name))[1]);
    END IF;
END $$;

-- Verify bucket exists
SELECT id, name, public, file_size_limit
FROM storage.buckets
WHERE id = 'cvs';
