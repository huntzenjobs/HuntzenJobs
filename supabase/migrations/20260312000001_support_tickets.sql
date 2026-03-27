-- Migration: Support Tickets System
-- Date: 2026-03-12

CREATE TABLE support_tickets (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email      TEXT NOT NULL,
  user_name       TEXT,
  user_plan       TEXT,
  page_url        TEXT,
  category        TEXT CHECK (category IN ('bug','question','suggestion')) NOT NULL,
  priority        TEXT CHECK (priority IN ('low','normal','urgent')) DEFAULT 'normal',
  subject         TEXT NOT NULL,
  description     TEXT NOT NULL,
  attachment_url  TEXT,
  status          TEXT CHECK (status IN ('open','in_progress','resolved','closed')) DEFAULT 'open',
  admin_reply     TEXT,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX idx_support_tickets_status ON support_tickets(status);
CREATE INDEX idx_support_tickets_created_at ON support_tickets(created_at DESC);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_tickets" ON support_tickets
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "service_role_all" ON support_tickets
  FOR ALL TO service_role USING (true);

-- Storage bucket for support attachments
INSERT INTO storage.buckets (id, name, public)
  VALUES ('support-attachments', 'support-attachments', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "user_upload_own_support" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'support-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "user_read_own_support" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'support-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "service_role_storage_support" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'support-attachments');
