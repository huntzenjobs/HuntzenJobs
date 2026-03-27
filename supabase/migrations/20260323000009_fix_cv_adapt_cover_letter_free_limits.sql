-- Fix: cv_adapt et cover_letter limits pour le plan free
-- La migration 000005 avait mis 15/15 mais une migration intermediaire a ecrase a 5/5
-- Valeurs correctes : free=15, starter=50 (starter deja correct)

UPDATE subscription_plans
SET limits = limits || '{"cv_adapt": 15, "cover_letter": 15}'::jsonb
WHERE name = 'free';
