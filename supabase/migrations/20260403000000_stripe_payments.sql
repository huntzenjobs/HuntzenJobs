-- Stripe payments log table for accurate revenue / MRR analytics
-- Created 2026-04-03

CREATE TABLE IF NOT EXISTS stripe_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relations
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_invoice_id TEXT UNIQUE,

  -- Payment info
  billing_reason TEXT,
  amount_paid DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',

  -- Recurring context
  interval TEXT,              -- 'month', 'year', etc. (from Stripe)
  interval_count INTEGER,     -- usually 1
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,

  -- Metadata
  raw_invoice JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_payments_user ON stripe_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_payments_sub ON stripe_payments(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_stripe_payments_created ON stripe_payments(created_at);
