-- Migration: Remove "Simulation d'entretien IA" from Pro plan features
-- Reason: ENABLE_INTERVIEW_SIMULATOR=false — feature not active, should not be advertised.

-- features is JSONB array — rebuild without the interview sim entry
UPDATE subscription_plans
SET
  features = (
    SELECT jsonb_agg(elem)
    FROM jsonb_array_elements(features) AS elem
    WHERE elem::text != '"Simulation d''entretien IA"'
  )
WHERE name = 'pro'
  AND features @> '["Simulation d''entretien IA"]';
