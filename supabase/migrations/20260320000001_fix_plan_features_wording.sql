-- Migration: Fix plan features wording to match actual limits and feature_flags
-- The features text was out of sync with real limits (e.g. "5 min coaching" but limit is 10 messages)

-- Free (Exploration) : assistant_messages=10, cv_analyses=1, job_searches=3, job_views=10
UPDATE subscription_plans
SET
  features = '[
    "3 recherches d''offres par jour",
    "10 offres visibles par jour",
    "1 analyse de CV par jour",
    "10 messages coaching IA par jour",
    "Support standard"
  ]'::jsonb,
  features_excluded = '[
    "Filtres avancés",
    "Gestion favoris",
    "Score visuel CV",
    "Export PDF",
    "Simulation d''entretien",
    "Alertes email",
    "Historique CV",
    "Conseils personnalisés"
  ]'::jsonb
WHERE name = 'free';

-- Starter (Recherche Active) : assistant_messages=100, cv_analyses=5, has_favorites, has_visual_score, has_advanced_filters
UPDATE subscription_plans
SET
  features = '[
    "Recherches illimitées",
    "Toutes les offres visibles",
    "Filtres avancés",
    "Gestion favoris",
    "5 analyses CV par jour + Score visuel",
    "100 messages coaching par jour",
    "Support standard"
  ]'::jsonb,
  features_excluded = '[
    "Export PDF",
    "Simulation d''entretien",
    "Alertes email",
    "Historique CV",
    "Conseils personnalisés"
  ]'::jsonb
WHERE name = 'starter';

-- Pro (Accélérateur) : assistant_messages=-1, cv_analyses=20, has_pdf_export, has_interview_sim, has_advanced_filters, has_favorites, has_visual_score
UPDATE subscription_plans
SET
  features = '[
    "Tout Recherche Active inclus",
    "20 analyses CV par jour",
    "Coach IA illimité 24/7",
    "Export PDF professionnel",
    "Simulation d''entretien IA",
    "Support prioritaire"
  ]'::jsonb,
  features_excluded = '[
    "Alertes email",
    "Historique CV complet",
    "Conseils personnalisés",
    "Accès beta nouvelles fonctions"
  ]'::jsonb
WHERE name = 'pro';

-- Premium (Carrière) : tout illimité, tous les flags activés
UPDATE subscription_plans
SET
  features = '[
    "Tout Accélérateur inclus",
    "Analyses CV illimitées",
    "Coach IA illimité 24/7",
    "Historique CV complet",
    "Alertes email instantanées",
    "Conseils personnalisés",
    "Historique sessions coach",
    "Accès beta nouvelles fonctions",
    "Support VIP"
  ]'::jsonb,
  features_excluded = '[]'::jsonb
WHERE name = 'premium';
