-- ============================================
-- SPRINT AUTH - Setup Authentication System
-- ============================================
-- This migration sets up the complete auth system:
-- 1. Profiles table with tiers and quotas
-- 2. Auto-create profile trigger
-- 3. Quota reset function
-- 4. RLS policies on all tables

-- ============================================
-- 1. PROFILES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  avatar_url TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,

  -- Onboarding
  onboarding_completed BOOLEAN DEFAULT FALSE,
  onboarding_completed_at TIMESTAMPTZ
);

-- Add missing columns if they don't exist (for existing tables)
DO $$
BEGIN
  -- Add subscription_tier column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'subscription_tier'
  ) THEN
    ALTER TABLE profiles ADD COLUMN subscription_tier TEXT NOT NULL DEFAULT 'free' CHECK (subscription_tier IN ('free', 'starter', 'pro', 'premium'));
  END IF;

  -- Add quota columns if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'cv_analyses_used'
  ) THEN
    ALTER TABLE profiles ADD COLUMN cv_analyses_used INT DEFAULT 0 CHECK (cv_analyses_used >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'cv_analyses_limit'
  ) THEN
    ALTER TABLE profiles ADD COLUMN cv_analyses_limit INT DEFAULT 1 CHECK (cv_analyses_limit >= -1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'coach_messages_used'
  ) THEN
    ALTER TABLE profiles ADD COLUMN coach_messages_used INT DEFAULT 0 CHECK (coach_messages_used >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'coach_messages_limit'
  ) THEN
    ALTER TABLE profiles ADD COLUMN coach_messages_limit INT DEFAULT 5 CHECK (coach_messages_limit >= -1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'job_searches_used'
  ) THEN
    ALTER TABLE profiles ADD COLUMN job_searches_used INT DEFAULT 0 CHECK (job_searches_used >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'job_searches_limit'
  ) THEN
    ALTER TABLE profiles ADD COLUMN job_searches_limit INT DEFAULT 10 CHECK (job_searches_limit >= -1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'quota_reset_date'
  ) THEN
    ALTER TABLE profiles ADD COLUMN quota_reset_date TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 day');
  END IF;

  -- Add Stripe columns if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'stripe_customer_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN stripe_customer_id TEXT UNIQUE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'stripe_subscription_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN stripe_subscription_id TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'stripe_subscription_status'
  ) THEN
    ALTER TABLE profiles ADD COLUMN stripe_subscription_status TEXT CHECK (stripe_subscription_status IN ('active', 'canceled', 'past_due', 'trialing', NULL));
  END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_tier ON profiles(subscription_tier);
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer ON profiles(stripe_customer_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 2. AUTO-CREATE PROFILE ON SIGNUP
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_email TEXT;
  user_full_name TEXT;
BEGIN
  -- Extract email and full_name from new user
  user_email := NEW.email;
  user_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  -- Insert profile with default free tier
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    subscription_tier,
    cv_analyses_used,
    cv_analyses_limit,
    coach_messages_used,
    coach_messages_limit,
    job_searches_used,
    job_searches_limit,
    quota_reset_date
  )
  VALUES (
    NEW.id,
    user_email,
    user_full_name,
    'free',
    0,
    1,  -- Free: 1 CV per day
    0,
    5,  -- Free: 5 coach messages per day
    0,
    10, -- Free: 10 job searches per day
    NOW() + INTERVAL '1 day'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 3. QUOTA RESET FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION reset_daily_quotas()
RETURNS INTEGER AS $$
DECLARE
  rows_updated INTEGER;
BEGIN
  -- Reset quotas for all users whose reset date has passed
  UPDATE profiles
  SET
    cv_analyses_used = 0,
    coach_messages_used = 0,
    job_searches_used = 0,
    quota_reset_date = NOW() + INTERVAL '1 day'
  WHERE quota_reset_date <= NOW();

  GET DIAGNOSTICS rows_updated = ROW_COUNT;

  RETURN rows_updated;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 4. INCREMENT USAGE FUNCTION (for backend)
-- ============================================

-- Note: increment_usage function is defined in 20260128000100_quota_functions.sql
-- We don't redefine it here to avoid conflicts

-- ============================================
-- 5. UPDATE SUBSCRIPTION TIER FUNCTION
-- ============================================
-- This function updates tier and adjusts quotas accordingly

CREATE OR REPLACE FUNCTION update_subscription_tier(
  p_user_id UUID,
  p_new_tier TEXT
)
RETURNS void AS $$
DECLARE
  new_cv_limit INT;
  new_coach_limit INT;
  new_job_limit INT;
BEGIN
  -- Validate tier
  IF p_new_tier NOT IN ('free', 'starter', 'pro', 'premium') THEN
    RAISE EXCEPTION 'Invalid tier: %', p_new_tier;
  END IF;

  -- Set limits based on tier
  CASE p_new_tier
    WHEN 'free' THEN
      new_cv_limit := 1;
      new_coach_limit := 5;
      new_job_limit := 10;
    WHEN 'starter' THEN
      new_cv_limit := 5;
      new_coach_limit := 20;
      new_job_limit := 50;
    WHEN 'pro' THEN
      new_cv_limit := 20;
      new_coach_limit := 100;
      new_job_limit := 200;
    WHEN 'premium' THEN
      new_cv_limit := -1;  -- Unlimited
      new_coach_limit := -1;
      new_job_limit := -1;
  END CASE;

  -- Update profile
  UPDATE profiles
  SET
    subscription_tier = p_new_tier,
    cv_analyses_limit = new_cv_limit,
    coach_messages_limit = new_coach_limit,
    job_searches_limit = new_job_limit
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. RLS POLICIES ON PROFILES
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can view their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile (but not tier/quotas/stripe fields)
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND subscription_tier = (SELECT subscription_tier FROM profiles WHERE id = auth.uid())
    AND cv_analyses_limit = (SELECT cv_analyses_limit FROM profiles WHERE id = auth.uid())
    AND coach_messages_limit = (SELECT coach_messages_limit FROM profiles WHERE id = auth.uid())
    AND job_searches_limit = (SELECT job_searches_limit FROM profiles WHERE id = auth.uid())
  );

-- ============================================
-- 7. RLS POLICIES ON CV_ANALYSES
-- ============================================

-- Check if table exists first (should exist from 20260128000201_create_cv_analyses_table.sql)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cv_analyses') THEN
    ALTER TABLE cv_analyses ENABLE ROW LEVEL SECURITY;

    -- Users can only view their own CV analyses
    DROP POLICY IF EXISTS "Users can view own cv analyses" ON cv_analyses;
    CREATE POLICY "Users can view own cv analyses"
      ON cv_analyses FOR SELECT
      USING (auth.uid() = user_id);

    -- Users can only insert their own CV analyses
    DROP POLICY IF EXISTS "Users can insert own cv analyses" ON cv_analyses;
    CREATE POLICY "Users can insert own cv analyses"
      ON cv_analyses FOR INSERT
      WITH CHECK (auth.uid() = user_id);

    -- Users can update their own CV analyses
    DROP POLICY IF EXISTS "Users can update own cv analyses" ON cv_analyses;
    CREATE POLICY "Users can update own cv analyses"
      ON cv_analyses FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;
END$$;

-- ============================================
-- 8. RLS POLICIES ON COACH_CONVERSATIONS
-- ============================================

-- Check if table exists first
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'coach_conversations') THEN
    ALTER TABLE coach_conversations ENABLE ROW LEVEL SECURITY;

    -- Users can view their own coach conversations
    DROP POLICY IF EXISTS "Users can view own coach conversations" ON coach_conversations;
    CREATE POLICY "Users can view own coach conversations"
      ON coach_conversations FOR SELECT
      USING (auth.uid() = user_id);

    -- Users can insert their own coach conversations
    DROP POLICY IF EXISTS "Users can insert own coach conversations" ON coach_conversations;
    CREATE POLICY "Users can insert own coach conversations"
      ON coach_conversations FOR INSERT
      WITH CHECK (auth.uid() = user_id);

    -- Users can update their own coach conversations
    DROP POLICY IF EXISTS "Users can update own coach conversations" ON coach_conversations;
    CREATE POLICY "Users can update own coach conversations"
      ON coach_conversations FOR UPDATE
      USING (auth.uid() = user_id);

    -- Users can delete their own coach conversations
    DROP POLICY IF EXISTS "Users can delete own coach conversations" ON coach_conversations;
    CREATE POLICY "Users can delete own coach conversations"
      ON coach_conversations FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END$$;

-- ============================================
-- 9. RLS POLICIES ON COACH_CONVERSATION_METADATA
-- ============================================

-- Check if table exists first
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'coach_conversation_metadata') THEN
    ALTER TABLE coach_conversation_metadata ENABLE ROW LEVEL SECURITY;

    -- Users can view their own metadata
    DROP POLICY IF EXISTS "Users can view own conversation metadata" ON coach_conversation_metadata;
    CREATE POLICY "Users can view own conversation metadata"
      ON coach_conversation_metadata FOR SELECT
      USING (
        auth.uid() = (
          SELECT user_id FROM coach_conversations WHERE id = conversation_id
        )
      );

    -- Users can insert metadata for their own conversations
    DROP POLICY IF EXISTS "Users can insert own conversation metadata" ON coach_conversation_metadata;
    CREATE POLICY "Users can insert own conversation metadata"
      ON coach_conversation_metadata FOR INSERT
      WITH CHECK (
        auth.uid() = (
          SELECT user_id FROM coach_conversations WHERE id = conversation_id
        )
      );

    -- Users can update metadata for their own conversations
    DROP POLICY IF EXISTS "Users can update own conversation metadata" ON coach_conversation_metadata;
    CREATE POLICY "Users can update own conversation metadata"
      ON coach_conversation_metadata FOR UPDATE
      USING (
        auth.uid() = (
          SELECT user_id FROM coach_conversations WHERE id = conversation_id
        )
      );
  END IF;
END$$;

-- ============================================
-- 10. RLS POLICIES ON JOB_SEARCHES
-- ============================================

-- Check if table exists first
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'job_searches') THEN
    ALTER TABLE job_searches ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users can view own job searches" ON job_searches;
    CREATE POLICY "Users can view own job searches"
      ON job_searches FOR SELECT
      USING (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users can insert own job searches" ON job_searches;
    CREATE POLICY "Users can insert own job searches"
      ON job_searches FOR INSERT
      WITH CHECK (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users can update own job searches" ON job_searches;
    CREATE POLICY "Users can update own job searches"
      ON job_searches FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;
END$$;

-- ============================================
-- 11. GRANT PERMISSIONS
-- ============================================

-- Grant usage to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON profiles TO authenticated;

-- Grant on tables if they exist
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cv_analyses') THEN
    GRANT SELECT, INSERT, UPDATE ON cv_analyses TO authenticated;
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'coach_conversations') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON coach_conversations TO authenticated;
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'coach_conversation_metadata') THEN
    GRANT SELECT, INSERT, UPDATE ON coach_conversation_metadata TO authenticated;
  END IF;
END$$;

-- Grant execute on functions (with existence check)
DO $$
BEGIN
  -- increment_usage should exist from 20260128000100_quota_functions.sql
  -- Signature: increment_usage(UUID, TEXT, INTEGER)
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'increment_usage'
  ) THEN
    GRANT EXECUTE ON FUNCTION increment_usage(UUID, TEXT, INTEGER) TO authenticated;
  END IF;

  -- update_subscription_tier created in this migration
  GRANT EXECUTE ON FUNCTION update_subscription_tier(UUID, TEXT) TO service_role;

  -- reset_daily_quotas created in this migration
  GRANT EXECUTE ON FUNCTION reset_daily_quotas() TO service_role;
END$$;

-- ============================================
-- 12. COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON TABLE profiles IS 'User profiles with subscription tiers and usage quotas';
COMMENT ON COLUMN profiles.subscription_tier IS 'User subscription tier: free, starter, pro, premium';
COMMENT ON COLUMN profiles.cv_analyses_limit IS 'Daily CV analysis limit (-1 = unlimited)';
COMMENT ON COLUMN profiles.coach_messages_limit IS 'Daily coach message limit (-1 = unlimited)';
COMMENT ON COLUMN profiles.job_searches_limit IS 'Daily job search limit (-1 = unlimited)';
COMMENT ON COLUMN profiles.quota_reset_date IS 'Next quota reset date (typically tomorrow at midnight)';

COMMENT ON FUNCTION handle_new_user() IS 'Trigger function to auto-create profile when user signs up';
COMMENT ON FUNCTION reset_daily_quotas() IS 'Reset usage counters for all users (call daily via cron)';
-- Note: increment_usage is defined in 20260128000100_quota_functions.sql with signature (UUID, TEXT, INTEGER)
COMMENT ON FUNCTION update_subscription_tier(UUID, TEXT) IS 'Update user tier and adjust quotas accordingly';

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '✅ Auth migration completed successfully!';
  RAISE NOTICE '   - profiles table created';
  RAISE NOTICE '   - Auto-create profile trigger set up';
  RAISE NOTICE '   - Quota functions created';
  RAISE NOTICE '   - RLS policies enabled on all tables';
  RAISE NOTICE '';
  RAISE NOTICE '📝 Next steps:';
  RAISE NOTICE '   1. Enable Email provider in Supabase Dashboard > Auth > Providers';
  RAISE NOTICE '   2. Configure SMTP if email confirmation is needed';
  RAISE NOTICE '   3. Create backend auth endpoints (SA-2)';
  RAISE NOTICE '   4. Create frontend auth UI (SA-3)';
END$$;
