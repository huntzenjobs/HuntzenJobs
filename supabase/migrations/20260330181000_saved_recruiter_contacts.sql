-- ============================================
-- SAVED RECRUITER CONTACTS TABLE
-- ============================================
-- Permet aux utilisateurs de sauvegarder des contacts recruteurs trouvés
-- via la fonctionnalité Contact recruteur / LinkedIn.

CREATE TABLE IF NOT EXISTS saved_recruiter_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User reference
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Recruiter contact details
    name TEXT,
    email TEXT,
    position TEXT,
    company TEXT NOT NULL,
    linkedin_url TEXT,
    source TEXT DEFAULT 'recruiter_finder',

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Prevent duplicates per user/email/company
    CONSTRAINT unique_user_recruiter_contact
      UNIQUE (user_id, email, company)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_saved_recruiter_contacts_user_id
  ON saved_recruiter_contacts(user_id);

CREATE INDEX IF NOT EXISTS idx_saved_recruiter_contacts_company
  ON saved_recruiter_contacts(company);

-- Enable Row Level Security
ALTER TABLE saved_recruiter_contacts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view their own saved recruiter contacts" ON saved_recruiter_contacts;
DROP POLICY IF EXISTS "Users can insert their own saved recruiter contacts" ON saved_recruiter_contacts;
DROP POLICY IF EXISTS "Users can update their own saved recruiter contacts" ON saved_recruiter_contacts;
DROP POLICY IF EXISTS "Users can delete their own saved recruiter contacts" ON saved_recruiter_contacts;

CREATE POLICY "Users can view their own saved recruiter contacts"
  ON saved_recruiter_contacts
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own saved recruiter contacts"
  ON saved_recruiter_contacts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own saved recruiter contacts"
  ON saved_recruiter_contacts
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own saved recruiter contacts"
  ON saved_recruiter_contacts
  FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger to keep updated_at in sync
CREATE OR REPLACE FUNCTION update_saved_recruiter_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER saved_recruiter_contacts_updated_at_trigger
    BEFORE UPDATE ON saved_recruiter_contacts
    FOR EACH ROW
    EXECUTE FUNCTION update_saved_recruiter_contacts_updated_at();

-- Grants
GRANT ALL ON saved_recruiter_contacts TO authenticated;
GRANT ALL ON saved_recruiter_contacts TO service_role;

COMMENT ON TABLE saved_recruiter_contacts IS 'Stores users'' saved recruiter contacts (LinkedIn / email)';
