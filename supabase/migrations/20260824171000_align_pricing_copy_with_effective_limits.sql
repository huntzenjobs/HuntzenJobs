-- Aligne les promesses de la page Tarifs sur les quotas réellement appliqués.
-- Les limites JSONB restent la source de vérité ; cette migration ne change
-- aucun droit, prix ou abonnement existant.

UPDATE subscription_plans
SET features = '[
  "5 recherches d''offres par jour",
  "10 offres visibles par recherche",
  "5 scores ATS par jour",
  "5 messages coaching IA par jour",
  "Support standard"
]'::jsonb
WHERE name = 'free';

UPDATE subscription_plans
SET
  features = '[
    "10 recherches d''offres par jour",
    "Toutes les offres visibles",
    "Filtres avancés et favoris",
    "10 scores ATS par jour",
    "20 messages coaching IA par jour",
    "30 adaptations CV et lettres par jour",
    "20 recherches recruteur par jour",
    "Export PDF",
    "Support standard"
  ]'::jsonb,
  features_excluded = '[
    "Simulation d''entretien",
    "Historique CV complet",
    "Conseils personnalisés avancés"
  ]'::jsonb
WHERE name = 'starter';

UPDATE subscription_plans
SET
  features = '[
    "Tout Recherche Active inclus",
    "Recherches et scores ATS illimités",
    "Coach IA illimité 24/7",
    "Adaptations CV et lettres illimitées",
    "Recherches recruteur illimitées",
    "Export PDF professionnel",
    "Support prioritaire"
  ]'::jsonb,
  features_excluded = '[
    "Historique CV complet",
    "Conseils personnalisés avancés",
    "Accès beta nouvelles fonctions"
  ]'::jsonb
WHERE name = 'pro';

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
