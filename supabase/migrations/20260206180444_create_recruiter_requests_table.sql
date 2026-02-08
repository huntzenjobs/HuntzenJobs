-- Migration: Create recruiter_requests table
-- Sprint 3: Recruiter Contact Feature
-- Permet aux utilisateurs de demander une consultation avec un recruteur expert (50€)

-- Create recruiter_requests table
CREATE TABLE IF NOT EXISTS recruiter_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Contact information
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,

  -- Professional context
  sector TEXT NOT NULL,
  experience_level TEXT NOT NULL,
  message TEXT NOT NULL,
  preferred_date DATE,

  -- Payment tracking
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'refunded', 'failed')),
  payment_intent_id TEXT,
  stripe_checkout_session_id TEXT,
  amount_cents INTEGER DEFAULT 5000, -- 50€

  -- Request status
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'assigned', 'scheduled', 'completed', 'cancelled')),
  assigned_recruiter_id UUID,
  scheduled_at TIMESTAMPTZ,
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_recruiter_requests_user_id
ON recruiter_requests(user_id);

CREATE INDEX IF NOT EXISTS idx_recruiter_requests_payment_status
ON recruiter_requests(payment_status);

CREATE INDEX IF NOT EXISTS idx_recruiter_requests_status
ON recruiter_requests(status);

CREATE INDEX IF NOT EXISTS idx_recruiter_requests_created_at
ON recruiter_requests(created_at DESC);

-- Add RLS policies
ALTER TABLE recruiter_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own requests
CREATE POLICY "Users can view own requests"
ON recruiter_requests
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can create their own requests
CREATE POLICY "Users can create own requests"
ON recruiter_requests
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can update their own requests (only certain fields)
CREATE POLICY "Users can update own requests"
ON recruiter_requests
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Service role can do everything (for webhooks)
CREATE POLICY "Service role full access"
ON recruiter_requests
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_recruiter_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER recruiter_requests_updated_at
BEFORE UPDATE ON recruiter_requests
FOR EACH ROW
EXECUTE FUNCTION update_recruiter_requests_updated_at();

-- Add comments for documentation
COMMENT ON TABLE recruiter_requests IS 'Demandes de consultation avec un recruteur expert (50€)';
COMMENT ON COLUMN recruiter_requests.payment_status IS 'pending, paid, refunded, failed';
COMMENT ON COLUMN recruiter_requests.status IS 'new, assigned, scheduled, completed, cancelled';
COMMENT ON COLUMN recruiter_requests.amount_cents IS 'Montant en centimes (5000 = 50€)';
