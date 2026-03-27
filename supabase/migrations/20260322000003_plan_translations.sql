-- Add translations JSONB column to subscription_plans
-- Structure: { "en": { "display_name": "...", "description": "...", "features": [...], "features_excluded": [...] }, "es": {...}, "pt": {...} }
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS translations JSONB DEFAULT '{}'::jsonb;

-- Pre-populate with translations for existing plans
UPDATE subscription_plans SET translations = jsonb_build_object(
  'en', jsonb_build_object(
    'display_name', CASE name
      WHEN 'free' THEN 'Exploration'
      WHEN 'starter' THEN 'Active Search'
      WHEN 'pro' THEN 'Accelerator'
      WHEN 'premium' THEN 'Career'
    END,
    'description', CASE name
      WHEN 'free' THEN 'Discover the platform freely'
      WHEN 'starter' THEN 'Progress quickly in your job search'
      WHEN 'pro' THEN 'Shift into high gear and get hired'
      WHEN 'premium' THEN 'Complete A-to-Z support'
    END,
    'features', CASE name
      WHEN 'free' THEN '["3 job searches per day", "10 job listings per day", "1 CV analysis per day", "10 AI coaching messages per day", "Standard support"]'::jsonb
      WHEN 'starter' THEN '["Unlimited searches", "All job listings visible", "Advanced filters", "Favorites management", "5 CV analyses per day + Visual score", "100 coaching messages per day", "Standard support"]'::jsonb
      WHEN 'pro' THEN '["Everything in Active Search", "20 CV analyses per day", "Unlimited AI Coach 24/7", "Professional PDF export", "AI interview simulation", "Priority support"]'::jsonb
      WHEN 'premium' THEN '["Everything in Accelerator", "Unlimited CV analyses", "Unlimited AI Coach 24/7", "Complete CV history", "Instant email alerts", "Personalized advice", "Coach session history", "Beta access to new features", "VIP support"]'::jsonb
    END,
    'features_excluded', CASE name
      WHEN 'free' THEN '["Advanced filters", "Favorites", "Visual CV score", "PDF export", "Interview simulation", "Email alerts", "CV history", "Personalized advice"]'::jsonb
      WHEN 'starter' THEN '["PDF export", "Interview simulation", "Email alerts", "CV history", "Personalized advice"]'::jsonb
      WHEN 'pro' THEN '["Email alerts", "Complete CV history", "Personalized advice", "Beta access to new features"]'::jsonb
      WHEN 'premium' THEN '[]'::jsonb
    END
  ),
  'es', jsonb_build_object(
    'display_name', CASE name
      WHEN 'free' THEN 'Exploración'
      WHEN 'starter' THEN 'Búsqueda Activa'
      WHEN 'pro' THEN 'Acelerador'
      WHEN 'premium' THEN 'Carrera'
    END,
    'description', CASE name
      WHEN 'free' THEN 'Descubre la plataforma libremente'
      WHEN 'starter' THEN 'Progresa rápidamente en tu búsqueda'
      WHEN 'pro' THEN 'Pasa a la velocidad superior y consigue empleo'
      WHEN 'premium' THEN 'Acompañamiento completo de la A a la Z'
    END,
    'features', CASE name
      WHEN 'free' THEN '["3 búsquedas de empleo al día", "10 ofertas visibles al día", "1 análisis de CV al día", "10 mensajes de coaching IA al día", "Soporte estándar"]'::jsonb
      WHEN 'starter' THEN '["Búsquedas ilimitadas", "Todas las ofertas visibles", "Filtros avanzados", "Gestión de favoritos", "5 análisis CV al día + Puntuación visual", "100 mensajes de coaching al día", "Soporte estándar"]'::jsonb
      WHEN 'pro' THEN '["Todo Búsqueda Activa incluido", "20 análisis CV al día", "Coach IA ilimitado 24/7", "Exportación PDF profesional", "Simulación de entrevista IA", "Soporte prioritario"]'::jsonb
      WHEN 'premium' THEN '["Todo Acelerador incluido", "Análisis CV ilimitados", "Coach IA ilimitado 24/7", "Historial CV completo", "Alertas email instantáneas", "Consejos personalizados", "Historial sesiones coach", "Acceso beta nuevas funciones", "Soporte VIP"]'::jsonb
    END,
    'features_excluded', CASE name
      WHEN 'free' THEN '["Filtros avanzados", "Favoritos", "Puntuación visual CV", "Exportación PDF", "Simulación de entrevista", "Alertas email", "Historial CV", "Consejos personalizados"]'::jsonb
      WHEN 'starter' THEN '["Exportación PDF", "Simulación de entrevista", "Alertas email", "Historial CV", "Consejos personalizados"]'::jsonb
      WHEN 'pro' THEN '["Alertas email", "Historial CV completo", "Consejos personalizados", "Acceso beta nuevas funciones"]'::jsonb
      WHEN 'premium' THEN '[]'::jsonb
    END
  ),
  'pt', jsonb_build_object(
    'display_name', CASE name
      WHEN 'free' THEN 'Exploração'
      WHEN 'starter' THEN 'Busca Ativa'
      WHEN 'pro' THEN 'Acelerador'
      WHEN 'premium' THEN 'Carreira'
    END,
    'description', CASE name
      WHEN 'free' THEN 'Descubra a plataforma livremente'
      WHEN 'starter' THEN 'Progrida rapidamente na sua busca'
      WHEN 'pro' THEN 'Passe à velocidade superior e seja contratado'
      WHEN 'premium' THEN 'Acompanhamento completo de A a Z'
    END,
    'features', CASE name
      WHEN 'free' THEN '["3 buscas de emprego por dia", "10 vagas visíveis por dia", "1 análise de CV por dia", "10 mensagens de coaching IA por dia", "Suporte padrão"]'::jsonb
      WHEN 'starter' THEN '["Buscas ilimitadas", "Todas as vagas visíveis", "Filtros avançados", "Gestão de favoritos", "5 análises CV por dia + Score visual", "100 mensagens de coaching por dia", "Suporte padrão"]'::jsonb
      WHEN 'pro' THEN '["Tudo de Busca Ativa incluído", "20 análises CV por dia", "Coach IA ilimitado 24/7", "Exportação PDF profissional", "Simulação de entrevista IA", "Suporte prioritário"]'::jsonb
      WHEN 'premium' THEN '["Tudo de Acelerador incluído", "Análises CV ilimitadas", "Coach IA ilimitado 24/7", "Histórico CV completo", "Alertas email instantâneos", "Conselhos personalizados", "Histórico sessões coach", "Acesso beta novas funções", "Suporte VIP"]'::jsonb
    END,
    'features_excluded', CASE name
      WHEN 'free' THEN '["Filtros avançados", "Favoritos", "Score visual CV", "Exportação PDF", "Simulação de entrevista", "Alertas email", "Histórico CV", "Conselhos personalizados"]'::jsonb
      WHEN 'starter' THEN '["Exportação PDF", "Simulação de entrevista", "Alertas email", "Histórico CV", "Conselhos personalizados"]'::jsonb
      WHEN 'pro' THEN '["Alertas email", "Histórico CV completo", "Conselhos personalizados", "Acesso beta novas funções"]'::jsonb
      WHEN 'premium' THEN '[]'::jsonb
    END
  )
);
