-- Migration: Profile Settings and Avatar Storage
-- Created: 2026-01-28
-- Purpose: Add user preference columns and setup avatar storage

-- ============================================
-- 1. ADD PROFILE PREFERENCE COLUMNS
-- ============================================

-- Add language preference (default French)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'fr' CHECK (preferred_language IN ('fr', 'en'));

-- Add email notification preference (default true)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT true;

-- Add newsletter subscription preference (default false)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS newsletter_subscribed BOOLEAN DEFAULT false;

-- Add comment
COMMENT ON COLUMN profiles.preferred_language IS 'User preferred language: fr (Français) or en (English)';
COMMENT ON COLUMN profiles.email_notifications IS 'Whether user wants to receive email notifications';
COMMENT ON COLUMN profiles.newsletter_subscribed IS 'Whether user is subscribed to HuntZen newsletter';

-- ============================================
-- 2. CREATE STORAGE BUCKET FOR AVATARS
-- ============================================

-- Create public bucket for user avatars
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152, -- 2MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 3. STORAGE RLS POLICIES
-- ============================================

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Public avatar access" ON storage.objects;

-- Allow users to upload their own avatar
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to update their own avatar
CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own avatar
CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read access to all avatars
CREATE POLICY "Public avatar access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- ============================================
-- 4. INDEXES FOR PERFORMANCE
-- ============================================

-- Index for filtering by language preference
CREATE INDEX IF NOT EXISTS idx_profiles_preferred_language
ON profiles(preferred_language);

-- Index for filtering newsletter subscribers
CREATE INDEX IF NOT EXISTS idx_profiles_newsletter_subscribed
ON profiles(newsletter_subscribed)
WHERE newsletter_subscribed = true;

-- ============================================
-- 5. HELPER FUNCTION: Get User Preferences
-- ============================================

CREATE OR REPLACE FUNCTION get_user_preferences(user_id UUID)
RETURNS TABLE (
  preferred_language TEXT,
  email_notifications BOOLEAN,
  newsletter_subscribed BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.preferred_language,
    p.email_notifications,
    p.newsletter_subscribed
  FROM profiles p
  WHERE p.id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_user_preferences(UUID) TO authenticated;

-- ============================================
-- 6. HELPER FUNCTION: Update User Preferences
-- ============================================

CREATE OR REPLACE FUNCTION update_user_preferences(
  user_id UUID,
  new_language TEXT DEFAULT NULL,
  new_email_notifications BOOLEAN DEFAULT NULL,
  new_newsletter BOOLEAN DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  rows_updated INTEGER;
BEGIN
  -- Update only provided values (NULL means no change)
  UPDATE profiles
  SET
    preferred_language = COALESCE(new_language, preferred_language),
    email_notifications = COALESCE(new_email_notifications, email_notifications),
    newsletter_subscribed = COALESCE(new_newsletter, newsletter_subscribed),
    updated_at = NOW()
  WHERE id = user_id;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN rows_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION update_user_preferences(UUID, TEXT, BOOLEAN, BOOLEAN) TO authenticated;

-- Note: Comments on storage.objects policies require superuser permissions
-- Storage policies:
--   - "Users can upload own avatar": Allows authenticated users to upload to avatars/{user_id}/
--   - "Public avatar access": Allows public read access for display purposes
