-- Migration: Ajouter les feature flags d'acces aux pages dans subscription_plans
-- Permet a l'admin de bloquer/activer n'importe quelle page pour n'importe quel plan

-- Tous les plans: toutes les pages activees par defaut
-- L'admin peut desactiver des pages pour certains plans depuis le panel admin
UPDATE subscription_plans SET feature_flags = feature_flags || '{
  "page_assistant": true,
  "page_candidatures": true,
  "page_cv_analysis": true,
  "page_documents": true,
  "page_expat": true,
  "page_jobs": true,
  "page_profile": true,
  "page_recruiter_contact": true,
  "page_referral": true,
  "page_salons": true,
  "page_saved_jobs": true
}'::jsonb
WHERE feature_flags IS NOT NULL;

-- Cas ou feature_flags serait NULL (securite)
UPDATE subscription_plans SET feature_flags = '{
  "page_assistant": true,
  "page_candidatures": true,
  "page_cv_analysis": true,
  "page_documents": true,
  "page_expat": true,
  "page_jobs": true,
  "page_profile": true,
  "page_recruiter_contact": true,
  "page_referral": true,
  "page_salons": true,
  "page_saved_jobs": true
}'::jsonb
WHERE feature_flags IS NULL;
