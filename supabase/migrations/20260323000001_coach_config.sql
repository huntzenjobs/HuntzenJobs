-- Coach Configuration Table
-- Stores coach personas config in DB (same translation pattern as subscription_plans)

CREATE TABLE IF NOT EXISTS coach_config (
  id TEXT PRIMARY KEY,                        -- "nova", "maria", "sofia", "lucas", "david"
  persona_name TEXT NOT NULL,                 -- "Nova", "Maria", etc.
  short_name TEXT NOT NULL,                   -- "Coach Carriere"
  description TEXT NOT NULL,
  specialties JSONB DEFAULT '[]'::jsonb,      -- array of strings
  example_questions JSONB DEFAULT '[]'::jsonb,-- array of strings
  accent_color TEXT DEFAULT '#00D9FF',
  icon TEXT DEFAULT 'Sparkles',               -- lucide icon name
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  translations JSONB DEFAULT '{}'::jsonb,     -- same pattern as subscription_plans
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE coach_config ENABLE ROW LEVEL SECURITY;

-- Public read (no auth needed — used by pricing/landing pages)
CREATE POLICY "coach_config_public_read"
  ON coach_config FOR SELECT
  USING (true);

-- Admin full access
CREATE POLICY "coach_config_admin_full"
  ON coach_config FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Pre-populate with current 5 coaches
INSERT INTO coach_config (id, persona_name, short_name, description, specialties, example_questions, accent_color, icon, sort_order, is_active, translations) VALUES
(
  'nova',
  'Nova',
  'Coach Carriere',
  'Je t''aide a clarifier ce que tu veux vraiment pour ta carriere et a construire un plan pour y arriver.',
  '["Orientation professionnelle", "Reconversion", "Plan de carriere", "Formation continue"]'::jsonb,
  '["On va definir ton objectif de carriere.", "Tu veux evoluer, changer de job ou gagner plus ?", "On construit ton plan ensemble."]'::jsonb,
  '#7C3AED',
  'UserCheck',
  0,
  true,
  '{
    "en": {
      "short_name": "Career Coach",
      "description": "I help you clarify what you really want for your career and build a plan to get there.",
      "specialties": ["Career guidance", "Career change", "Career planning", "Continuing education"],
      "example_questions": ["Let''s define your career goal.", "Do you want to grow, switch jobs, or earn more?", "Let''s build your plan together."]
    }
  }'::jsonb
),
(
  'maria',
  'Maria',
  'Recherche d''Emploi',
  'Je t''aide a trouver les bonnes offres et a postuler efficacement.',
  '["Strategie de recherche", "Ciblage d''entreprises", "Candidature spontanee", "Reseau professionnel"]'::jsonb,
  '["Je viens de trouver des offres qui peuvent t''interesser.", "On va optimiser ta recherche pour trouver plus vite.", "Comment approcher un recruteur ?"]'::jsonb,
  '#0D9488',
  'Briefcase',
  1,
  true,
  '{
    "en": {
      "short_name": "Job Search",
      "description": "I help you find the right offers and apply effectively.",
      "specialties": ["Search strategy", "Company targeting", "Unsolicited applications", "Professional network"],
      "example_questions": ["I just found some offers that might interest you.", "Let''s optimize your search to find faster.", "How to approach a recruiter?"]
    }
  }'::jsonb
),
(
  'sofia',
  'Sofia',
  'Expert CV',
  'Je t''aide a creer un CV qui attire l''attention des recruteurs.',
  '["Analyse ATS", "Structure et mise en page", "Mots-cles sectoriels", "Impact des experiences", "Adaptation a une offre d''emploi"]'::jsonb,
  '["Je peux ameliorer ton CV en quelques minutes.", "Ton CV peut etre beaucoup plus impactant.", "Quels mots-cles utiliser ?"]'::jsonb,
  '#EC4899',
  'FileText',
  2,
  true,
  '{
    "en": {
      "short_name": "CV Expert",
      "description": "I help you create a CV that catches recruiters'' attention.",
      "specialties": ["ATS analysis", "Structure and layout", "Industry keywords", "Experience impact", "Job-specific adaptation"],
      "example_questions": ["I can improve your CV in just a few minutes.", "Your CV can be much more impactful.", "Which keywords should you use?"]
    }
  }'::jsonb
),
(
  'lucas',
  'Lucas',
  'Coach Entretien',
  'Je te prepare aux entretiens pour que tu sois pret le jour J.',
  '["Entretien technique", "Entretien RH", "Questions pieges", "Communication verbale"]'::jsonb,
  '["On va simuler un entretien.", "Je vais te poser les questions que les recruteurs posent vraiment.", "Comment gerer le stress ?"]'::jsonb,
  '#EA580C',
  'Mic',
  3,
  true,
  '{
    "en": {
      "short_name": "Interview Coach",
      "description": "I prepare you for interviews so you''re ready on the big day.",
      "specialties": ["Technical interview", "HR interview", "Tricky questions", "Verbal communication"],
      "example_questions": ["Let''s simulate an interview.", "I''ll ask you the questions recruiters really ask.", "How to manage stress?"]
    }
  }'::jsonb
),
(
  'david',
  'David',
  'Personal Branding',
  'Je t''aide a construire un profil qui attire les recruteurs.',
  '["Posts LinkedIn viraux", "Storytelling professionnel", "Personal branding X/Twitter", "Strategie de contenu"]'::jsonb,
  '["Ton profil peut devenir beaucoup plus attractif.", "On va ameliorer ta presence professionnelle.", "Comment developper ma marque personnelle ?", "Fais moi un post LinkedIn viral pour creer de l''engagement."]'::jsonb,
  '#DC2626',
  'Linkedin',
  4,
  true,
  '{
    "en": {
      "short_name": "Personal Branding",
      "description": "I help you build a profile that attracts recruiters.",
      "specialties": ["Viral LinkedIn posts", "Professional storytelling", "Personal branding on X/Twitter", "Content strategy"],
      "example_questions": ["Your profile can become much more attractive.", "Let''s improve your professional presence.", "How to develop my personal brand?", "Write me a viral LinkedIn post to create engagement."]
    }
  }'::jsonb
);
