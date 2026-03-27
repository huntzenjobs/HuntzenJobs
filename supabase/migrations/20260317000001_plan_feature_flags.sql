-- Migration: plan_feature_flags
-- Ajoute une colonne feature_flags JSONB sur subscription_plans
-- pour que l'admin puisse toggler les features par plan sans deploy frontend

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS feature_flags JSONB DEFAULT '{}'::jsonb;

-- Seed initial depuis les valeurs hardcodées dans use-freemium-limits.ts
UPDATE subscription_plans SET feature_flags = '{
  "has_advanced_filters": false,
  "has_favorites": false,
  "has_email_alerts": false,
  "has_visual_score": false,
  "has_pdf_export": false,
  "has_cv_history": false,
  "has_interview_sim": false,
  "has_personalized_advice": false,
  "has_coach_history": false
}'::jsonb WHERE name = 'free';

UPDATE subscription_plans SET feature_flags = '{
  "has_advanced_filters": true,
  "has_favorites": true,
  "has_email_alerts": false,
  "has_visual_score": true,
  "has_pdf_export": false,
  "has_cv_history": false,
  "has_interview_sim": false,
  "has_personalized_advice": false,
  "has_coach_history": false
}'::jsonb WHERE name = 'starter';

UPDATE subscription_plans SET feature_flags = '{
  "has_advanced_filters": true,
  "has_favorites": true,
  "has_email_alerts": false,
  "has_visual_score": true,
  "has_pdf_export": true,
  "has_cv_history": false,
  "has_interview_sim": true,
  "has_personalized_advice": false,
  "has_coach_history": false
}'::jsonb WHERE name = 'pro';

UPDATE subscription_plans SET feature_flags = '{
  "has_advanced_filters": true,
  "has_favorites": true,
  "has_email_alerts": true,
  "has_visual_score": true,
  "has_pdf_export": true,
  "has_cv_history": true,
  "has_interview_sim": true,
  "has_personalized_advice": true,
  "has_coach_history": true
}'::jsonb WHERE name = 'premium';
