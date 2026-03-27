-- Add onboarding_data JSONB column to profiles table
-- Stores wizard responses for admin analytics and marketing campaigns

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS onboarding_data JSONB DEFAULT NULL;

COMMENT ON COLUMN profiles.onboarding_data IS 'Stores onboarding wizard data: first_name, last_name, situation, job_title, location, experience, discovery_source';
