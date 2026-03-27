-- Fix user_notifications_type_check constraint
-- Ajouter les types manquants : support_ticket_received, support_ticket_reply,
-- referral_signup, payment_failed

ALTER TABLE user_notifications DROP CONSTRAINT IF EXISTS user_notifications_type_check;

ALTER TABLE user_notifications ADD CONSTRAINT user_notifications_type_check
  CHECK (type IN (
    'job_alert',
    'cv_feedback',
    'referral_bonus',
    'referral_signup',
    'promo_code',
    'career_progress',
    'interview_ready',
    'win_back_7d',
    'support_ticket_received',
    'support_ticket_reply',
    'payment_failed'
  ));
