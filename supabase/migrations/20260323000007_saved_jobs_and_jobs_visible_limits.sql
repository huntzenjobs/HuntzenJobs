-- Migration: Ajouter saved_jobs et jobs_visible dans subscription_plans.limits
-- Permet a l'admin de controler le nombre de jobs sauvegardes et visibles par plan

-- Free: 20 saved jobs, 10 jobs visibles par recherche
UPDATE subscription_plans SET limits = limits || '{"saved_jobs": 20, "jobs_visible": 10}'::jsonb
WHERE name = 'free';

-- Starter: 100 saved jobs, illimite jobs visibles
UPDATE subscription_plans SET limits = limits || '{"saved_jobs": 100, "jobs_visible": -1}'::jsonb
WHERE name = 'starter';

-- Pro: illimite saved jobs, illimite jobs visibles
UPDATE subscription_plans SET limits = limits || '{"saved_jobs": -1, "jobs_visible": -1}'::jsonb
WHERE name = 'pro';

-- Premium: illimite saved jobs, illimite jobs visibles
UPDATE subscription_plans SET limits = limits || '{"saved_jobs": -1, "jobs_visible": -1}'::jsonb
WHERE name = 'premium';
