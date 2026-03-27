-- Migration: add features_excluded column to subscription_plans
-- Allows admin to define features NOT included in a plan (displayed with ✗ icon)

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS features_excluded JSONB DEFAULT '[]'::jsonb;

-- Update plans with French feature lists (included ✓ and excluded ✗)

UPDATE subscription_plans SET
  features = '["3 recherches d''offres par jour","10 offres visibles maximum","1 analyse de CV par jour","5 min de coaching IA","Support standard"]'::jsonb,
  features_excluded = '["Filtres avancés","Gestion favoris","Export PDF rapports","Simulation d''entretien","Alertes email"]'::jsonb
WHERE name = 'free';

UPDATE subscription_plans SET
  features = '["Recherches illimitées","Toutes les offres visibles","Filtres avancés","Gestion favoris","Analyses CV illimitées + Score visuel","Coach IA 30 min/jour","Support standard"]'::jsonb,
  features_excluded = '["Export PDF rapports","Simulation d''entretien","Alertes email"]'::jsonb
WHERE name = 'starter';

UPDATE subscription_plans SET
  features = '["Tout Starter inclus","Coach IA illimité 24/7","Export PDF professionnel","Simulation d''entretien IA","Support prioritaire","Historique CV","Conseils personnalisés","Alertes email","Historique sessions coach"]'::jsonb,
  features_excluded = '[]'::jsonb
WHERE name = 'pro';

UPDATE subscription_plans SET
  features = '["Tout Pro inclus","Historique CV illimité","Conseils personnalisés ultra-ciblés","Alertes email instantanées","Accès beta nouvelles fonctions","Support VIP","Rapports mensuels de progression"]'::jsonb,
  features_excluded = '[]'::jsonb
WHERE name = 'premium';

-- Verify
-- SELECT name, features, features_excluded FROM subscription_plans;
