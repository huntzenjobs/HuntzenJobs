-- Fix coach_config: add missing French accents + add ES/PT translations
-- The initial migration inserted text without accents and only EN translations.

-- ═══════════════════════════════════════════════════════════════════
-- NOVA — Coach Carrière
-- ═══════════════════════════════════════════════════════════════════
UPDATE coach_config SET
  short_name = 'Coach Carrière',
  description = 'Je t''aide à clarifier ce que tu veux vraiment pour ta carrière et à construire un plan pour y arriver.',
  specialties = '["Orientation professionnelle", "Reconversion", "Plan de carrière", "Formation continue"]'::jsonb,
  example_questions = '["On va définir ton objectif de carrière.", "Tu veux évoluer, changer de job ou gagner plus ?", "On construit ton plan ensemble."]'::jsonb,
  translations = '{
    "en": {
      "short_name": "Career Coach",
      "description": "I help you clarify what you really want for your career and build a plan to get there.",
      "specialties": ["Career guidance", "Career change", "Career planning", "Continuing education"],
      "example_questions": ["Let''s define your career goal.", "Do you want to grow, switch jobs, or earn more?", "Let''s build your plan together."]
    },
    "es": {
      "short_name": "Coach de Carrera",
      "description": "Te ayudo a clarificar lo que realmente quieres para tu carrera y a construir un plan para lograrlo.",
      "specialties": ["Orientación profesional", "Reconversión", "Plan de carrera", "Formación continua"],
      "example_questions": ["Vamos a definir tu objetivo de carrera.", "¿Quieres crecer, cambiar de trabajo o ganar más?", "Construyamos tu plan juntos."]
    },
    "pt": {
      "short_name": "Coach de Carreira",
      "description": "Ajudo você a esclarecer o que realmente quer para sua carreira e a construir um plano para chegar lá.",
      "specialties": ["Orientação profissional", "Reconversão", "Plano de carreira", "Formação contínua"],
      "example_questions": ["Vamos definir seu objetivo de carreira.", "Você quer crescer, mudar de emprego ou ganhar mais?", "Vamos construir seu plano juntos."]
    }
  }'::jsonb,
  updated_at = NOW()
WHERE id = 'nova';

-- ═══════════════════════════════════════════════════════════════════
-- MARIA — Recherche d'Emploi
-- ═══════════════════════════════════════════════════════════════════
UPDATE coach_config SET
  short_name = 'Recherche d''Emploi',
  description = 'Je t''aide à trouver les bonnes offres et à postuler efficacement.',
  specialties = '["Stratégie de recherche", "Ciblage d''entreprises", "Candidature spontanée", "Réseau professionnel"]'::jsonb,
  example_questions = '["Je viens de trouver des offres qui peuvent t''intéresser.", "On va optimiser ta recherche pour trouver plus vite.", "Comment approcher un recruteur ?"]'::jsonb,
  translations = '{
    "en": {
      "short_name": "Job Search",
      "description": "I help you find the right offers and apply effectively.",
      "specialties": ["Search strategy", "Company targeting", "Unsolicited applications", "Professional network"],
      "example_questions": ["I just found some offers that might interest you.", "Let''s optimize your search to find faster.", "How to approach a recruiter?"]
    },
    "es": {
      "short_name": "Búsqueda de Empleo",
      "description": "Te ayudo a encontrar las ofertas adecuadas y a postular de manera efectiva.",
      "specialties": ["Estrategia de búsqueda", "Segmentación de empresas", "Candidatura espontánea", "Red profesional"],
      "example_questions": ["Acabo de encontrar ofertas que pueden interesarte.", "Vamos a optimizar tu búsqueda para encontrar más rápido.", "¿Cómo acercarse a un reclutador?"]
    },
    "pt": {
      "short_name": "Busca de Emprego",
      "description": "Ajudo você a encontrar as ofertas certas e a se candidatar de forma eficiente.",
      "specialties": ["Estratégia de busca", "Segmentação de empresas", "Candidatura espontânea", "Rede profissional"],
      "example_questions": ["Acabei de encontrar ofertas que podem te interessar.", "Vamos otimizar sua busca para encontrar mais rápido.", "Como abordar um recrutador?"]
    }
  }'::jsonb,
  updated_at = NOW()
WHERE id = 'maria';

-- ═══════════════════════════════════════════════════════════════════
-- SOFIA — Expert CV
-- ═══════════════════════════════════════════════════════════════════
UPDATE coach_config SET
  short_name = 'Expert CV',
  description = 'Je t''aide à créer un CV qui attire l''attention des recruteurs.',
  specialties = '["Analyse ATS", "Structure et mise en page", "Mots-clés sectoriels", "Impact des expériences", "Adaptation à une offre d''emploi"]'::jsonb,
  example_questions = '["Je peux améliorer ton CV en quelques minutes.", "Ton CV peut être beaucoup plus impactant.", "Quels mots-clés utiliser ?"]'::jsonb,
  translations = '{
    "en": {
      "short_name": "CV Expert",
      "description": "I help you create a CV that catches recruiters'' attention.",
      "specialties": ["ATS analysis", "Structure and layout", "Industry keywords", "Experience impact", "Job-specific adaptation"],
      "example_questions": ["I can improve your CV in just a few minutes.", "Your CV can be much more impactful.", "Which keywords should you use?"]
    },
    "es": {
      "short_name": "Experta en CV",
      "description": "Te ayudo a crear un CV que capte la atención de los reclutadores.",
      "specialties": ["Análisis ATS", "Estructura y diseño", "Palabras clave sectoriales", "Impacto de experiencias", "Adaptación a una oferta de empleo"],
      "example_questions": ["Puedo mejorar tu CV en pocos minutos.", "Tu CV puede ser mucho más impactante.", "¿Qué palabras clave usar?"]
    },
    "pt": {
      "short_name": "Especialista em CV",
      "description": "Ajudo você a criar um CV que chame a atenção dos recrutadores.",
      "specialties": ["Análise ATS", "Estrutura e layout", "Palavras-chave setoriais", "Impacto das experiências", "Adaptação a uma vaga"],
      "example_questions": ["Posso melhorar seu CV em poucos minutos.", "Seu CV pode ser muito mais impactante.", "Quais palavras-chave usar?"]
    }
  }'::jsonb,
  updated_at = NOW()
WHERE id = 'sofia';

-- ═══════════════════════════════════════════════════════════════════
-- LUCAS — Coach Entretien
-- ═══════════════════════════════════════════════════════════════════
UPDATE coach_config SET
  short_name = 'Coach Entretien',
  description = 'Je te prépare aux entretiens pour que tu sois prêt le jour J.',
  specialties = '["Entretien technique", "Entretien RH", "Questions pièges", "Communication verbale"]'::jsonb,
  example_questions = '["On va simuler un entretien.", "Je vais te poser les questions que les recruteurs posent vraiment.", "Comment gérer le stress ?"]'::jsonb,
  translations = '{
    "en": {
      "short_name": "Interview Coach",
      "description": "I prepare you for interviews so you''re ready on the big day.",
      "specialties": ["Technical interview", "HR interview", "Tricky questions", "Verbal communication"],
      "example_questions": ["Let''s simulate an interview.", "I''ll ask you the questions recruiters really ask.", "How to manage stress?"]
    },
    "es": {
      "short_name": "Coach de Entrevista",
      "description": "Te preparo para las entrevistas para que estés listo el día D.",
      "specialties": ["Entrevista técnica", "Entrevista de RRHH", "Preguntas trampa", "Comunicación verbal"],
      "example_questions": ["Vamos a simular una entrevista.", "Te haré las preguntas que los reclutadores realmente hacen.", "¿Cómo manejar el estrés?"]
    },
    "pt": {
      "short_name": "Coach de Entrevista",
      "description": "Preparo você para entrevistas para que esteja pronto no dia D.",
      "specialties": ["Entrevista técnica", "Entrevista RH", "Perguntas pegadinha", "Comunicação verbal"],
      "example_questions": ["Vamos simular uma entrevista.", "Vou te fazer as perguntas que os recrutadores realmente fazem.", "Como lidar com o estresse?"]
    }
  }'::jsonb,
  updated_at = NOW()
WHERE id = 'lucas';

-- ═══════════════════════════════════════════════════════════════════
-- DAVID — Personal Branding
-- ═══════════════════════════════════════════════════════════════════
UPDATE coach_config SET
  short_name = 'Personal Branding',
  description = 'Je t''aide à construire un profil qui attire les recruteurs.',
  specialties = '["Posts LinkedIn viraux", "Storytelling professionnel", "Personal branding X/Twitter", "Stratégie de contenu"]'::jsonb,
  example_questions = '["Ton profil peut devenir beaucoup plus attractif.", "On va améliorer ta présence professionnelle.", "Comment développer ma marque personnelle ?", "Fais-moi un post LinkedIn viral pour créer de l''engagement."]'::jsonb,
  translations = '{
    "en": {
      "short_name": "Personal Branding",
      "description": "I help you build a profile that attracts recruiters.",
      "specialties": ["Viral LinkedIn posts", "Professional storytelling", "Personal branding on X/Twitter", "Content strategy"],
      "example_questions": ["Your profile can become much more attractive.", "Let''s improve your professional presence.", "How to develop my personal brand?", "Write me a viral LinkedIn post to create engagement."]
    },
    "es": {
      "short_name": "Personal Branding",
      "description": "Te ayudo a construir un perfil que atraiga a los reclutadores.",
      "specialties": ["Posts virales en LinkedIn", "Storytelling profesional", "Personal branding en X/Twitter", "Estrategia de contenido"],
      "example_questions": ["Tu perfil puede volverse mucho más atractivo.", "Vamos a mejorar tu presencia profesional.", "¿Cómo desarrollar mi marca personal?", "Hazme un post viral en LinkedIn para generar engagement."]
    },
    "pt": {
      "short_name": "Personal Branding",
      "description": "Ajudo você a construir um perfil que atraia recrutadores.",
      "specialties": ["Posts virais no LinkedIn", "Storytelling profissional", "Personal branding no X/Twitter", "Estratégia de conteúdo"],
      "example_questions": ["Seu perfil pode se tornar muito mais atrativo.", "Vamos melhorar sua presença profissional.", "Como desenvolver minha marca pessoal?", "Escreva um post viral no LinkedIn para gerar engajamento."]
    }
  }'::jsonb,
  updated_at = NOW()
WHERE id = 'david';
