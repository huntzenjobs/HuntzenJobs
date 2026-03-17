CREATE TABLE IF NOT EXISTS assistant_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id TEXT NOT NULL,
  text TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_assistant_suggestions_assistant ON assistant_suggestions(assistant_id, is_active);

-- Seed with current hardcoded suggestions
INSERT INTO assistant_suggestions (assistant_id, text, display_order) VALUES
  ('career-coach', 'On va définir ton objectif de carrière.', 0),
  ('career-coach', 'Tu veux évoluer, changer de job ou gagner plus ?', 1),
  ('career-coach', 'On construit ton plan ensemble.', 2),
  ('job-scout', 'Je viens de trouver des offres qui peuvent t''intéresser.', 0),
  ('job-scout', 'On va optimiser ta recherche pour trouver plus vite.', 1),
  ('job-scout', 'Comment approcher un recruteur ?', 2),
  ('cv-analyzer', 'Je peux améliorer ton CV en quelques minutes.', 0),
  ('cv-analyzer', 'Ton CV peut être beaucoup plus impactant.', 1),
  ('cv-analyzer', 'Quels mots-clés utiliser ?', 2),
  ('interview-sim', 'On va simuler un entretien.', 0),
  ('interview-sim', 'Je vais te poser les questions que les recruteurs posent vraiment.', 1),
  ('interview-sim', 'Comment gérer le stress ?', 2),
  ('branding', 'Ton profil peut devenir beaucoup plus attractif.', 0),
  ('branding', 'On va améliorer ta présence professionnelle.', 1),
  ('branding', 'Comment développer ma marque personnelle ?', 2),
  ('branding', 'Fais moi un post LinkedIn viral pour créer de l''engagement.', 3);
