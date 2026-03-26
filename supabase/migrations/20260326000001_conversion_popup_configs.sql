-- Conversion Popup Configs — admin-managed popup configurations
-- Replaces hardcoded POPUP_CONFIGS in conversion-popups.tsx

CREATE TABLE IF NOT EXISTS conversion_popup_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trigger_id TEXT NOT NULL UNIQUE,
    source_plans TEXT[] NOT NULL DEFAULT '{free}',
    target_plan TEXT NOT NULL DEFAULT 'starter',
    feature_trigger TEXT,
    title JSONB NOT NULL DEFAULT '{}',
    body JSONB NOT NULL DEFAULT '{}',
    primary_cta JSONB NOT NULL DEFAULT '{}',
    secondary_cta JSONB,
    price_override JSONB,
    discount_percent DECIMAL(5,2),
    coupon_trigger TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE conversion_popup_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active popups"
    ON conversion_popup_configs FOR SELECT
    USING (is_active = true);

-- Seed the 8 existing popups (texts in 4 languages)
INSERT INTO conversion_popup_configs (trigger_id, source_plans, target_plan, feature_trigger, title, body, primary_cta, secondary_cta, price_override, discount_percent, coupon_trigger, sort_order) VALUES
(
    'search_limit',
    '{free}',
    'starter',
    'job_search',
    '{"fr": "Vous avez atteint votre limite de recherches aujourd''hui", "en": "You''ve reached your daily search limit", "es": "Has alcanzado tu limite de busquedas diarias", "pt": "Voce atingiu seu limite diario de buscas"}',
    '{"fr": "Passe a Starter pour des recherches illimitees et trouve votre prochain job plus vite.", "en": "Upgrade to Starter for unlimited searches and find your next job faster.", "es": "Pasa a Starter para busquedas ilimitadas y encuentra tu proximo empleo mas rapido.", "pt": "Mude para Starter para buscas ilimitadas e encontre seu proximo emprego mais rapido."}',
    '{"fr": "Debloquer les recherches", "en": "Unlock searches", "es": "Desbloquear busquedas", "pt": "Desbloquear buscas"}',
    '{"fr": "Parrainer un ami", "en": "Refer a friend", "es": "Recomendar a un amigo", "pt": "Indicar um amigo"}',
    NULL, NULL, NULL, 1
),
(
    'cv_score',
    '{free}',
    'starter',
    'cv_analysis',
    '{"fr": "Ton CV peut faire beaucoup mieux", "en": "Your CV can do much better", "es": "Tu CV puede mejorar mucho", "pt": "Seu CV pode melhorar muito"}',
    '{"fr": "Accede aux conseils detailles de Sofia pour booster votre score ATS et decrocher plus d''entretiens.", "en": "Get detailed advice from Sofia to boost your ATS score and land more interviews.", "es": "Obtene consejos detallados de Sofia para mejorar tu puntuacion ATS y conseguir mas entrevistas.", "pt": "Obtenha conselhos detalhados da Sofia para melhorar sua pontuacao ATS e conseguir mais entrevistas."}',
    '{"fr": "Activer l''analyse complete", "en": "Activate full analysis", "es": "Activar analisis completo", "pt": "Ativar analise completa"}',
    NULL, NULL, NULL, NULL, 2
),
(
    'session_cut',
    '{free}',
    'starter',
    'assistant_messages',
    '{"fr": "Ta session coach est terminee", "en": "Your coaching session has ended", "es": "Tu sesion de coaching ha terminado", "pt": "Sua sessao de coaching terminou"}',
    '{"fr": "Continue avec Nova, Maria ou Lucas sans limite. Ton prochain job est a portee de main.", "en": "Continue with Nova, Maria or Lucas with no limits. Your next job is within reach.", "es": "Continua con Nova, Maria o Lucas sin limites. Tu proximo empleo esta al alcance.", "pt": "Continue com Nova, Maria ou Lucas sem limites. Seu proximo emprego esta ao alcance."}',
    '{"fr": "Continuer avec le Coach", "en": "Continue with the Coach", "es": "Continuar con el Coach", "pt": "Continuar com o Coach"}',
    NULL, NULL, NULL, NULL, 3
),
(
    'interview_score',
    '{free,starter}',
    'pro',
    'interview_sim',
    '{"fr": "Vous souhaitez aller plus loin avec Lucas ?", "en": "Want to go further with Lucas?", "es": "Quieres ir mas lejos con Lucas?", "pt": "Quer ir mais longe com Lucas?"}',
    '{"fr": "Simulez autant d''entretiens que vous voulez et recevez des retours approfondis a chaque session.", "en": "Simulate as many interviews as you want and receive in-depth feedback after each session.", "es": "Simula tantas entrevistas como quieras y recibe comentarios detallados en cada sesion.", "pt": "Simule quantas entrevistas quiser e receba feedback detalhado em cada sessao."}',
    '{"fr": "Activer la simulation complete", "en": "Activate full simulation", "es": "Activar simulacion completa", "pt": "Ativar simulacao completa"}',
    NULL, NULL, NULL, NULL, 4
),
(
    'momentum',
    '{free}',
    'starter',
    NULL,
    '{"fr": "Vous etes en plein elan — profite de -20 % aujourd''hui", "en": "You''re on a roll — enjoy -20% today", "es": "Estas en racha — disfruta de -20% hoy", "pt": "Voce esta em alta — aproveite -20% hoje"}',
    '{"fr": "Vous recherchez activement. Voici une offre exclusive valable 24 h pour vous.", "en": "You''re actively searching. Here''s an exclusive offer valid for 24 h just for you.", "es": "Estas buscando activamente. Aqui tienes una oferta exclusiva valida 24 h solo para ti.", "pt": "Voce esta buscando ativamente. Aqui esta uma oferta exclusiva valida por 24 h so para voce."}',
    '{"fr": "Choisir mon plan avec -20 %", "en": "Choose my plan with -20%", "es": "Elegir mi plan con -20%", "pt": "Escolher meu plano com -20%"}',
    NULL, NULL, 0.20, 'momentum', 5
),
(
    'anti_churn',
    '{starter,pro}',
    'pro',
    NULL,
    '{"fr": "Reste et economise -30 % pendant 3 mois", "en": "Stay and save -30% for 3 months", "es": "Quedate y ahorra -30% durante 3 meses", "pt": "Fique e economize -30% por 3 meses"}',
    '{"fr": "Avant de partir, voici une offre exclusive : -30 % sur votre abonnement pendant 3 mois.", "en": "Before you go, here''s an exclusive offer: -30% on your subscription for 3 months.", "es": "Antes de irte, aqui tienes una oferta exclusiva: -30% en tu suscripcion durante 3 meses.", "pt": "Antes de ir, aqui esta uma oferta exclusiva: -30% na sua assinatura por 3 meses."}',
    '{"fr": "Garder mon avantage", "en": "Keep my advantage", "es": "Mantener mi ventaja", "pt": "Manter minha vantagem"}',
    '{"fr": "Annuler quand meme", "en": "Cancel anyway", "es": "Cancelar de todos modos", "pt": "Cancelar mesmo assim"}',
    NULL, 0.30, 'anti_churn', 6
),
(
    'inactive_7d',
    '{free}',
    'pro',
    NULL,
    '{"fr": "7 jours Accelerateur offerts, nous vous avons reserve votre place", "en": "7 free Accelerator days — your spot is reserved", "es": "7 dias de Acelerador gratis — tu plaza esta reservada", "pt": "7 dias de Acelerador gratis — sua vaga esta reservada"}',
    '{"fr": "Vous nous manquez ! Revenez et profitez de 7 jours gratuits pour reprendre votre recherche.", "en": "We miss you! Come back and enjoy 7 free days to restart your search.", "es": "Te echamos de menos! Vuelve y disfruta de 7 dias gratis para retomar tu busqueda.", "pt": "Sentimos sua falta! Volte e aproveite 7 dias gratis para retomar sua busca."}',
    '{"fr": "Activer mes 7 jours gratuits", "en": "Activate my 7 free days", "es": "Activar mis 7 dias gratis", "pt": "Ativar meus 7 dias gratis"}',
    NULL,
    '{"fr": "0EUR pendant 7 jours", "en": "EUR0 for 7 days", "es": "0EUR durante 7 dias", "pt": "0EUR por 7 dias"}',
    NULL, 'win_back_7d', 7
),
(
    'pricing_hover',
    '{free}',
    'pro',
    NULL,
    '{"fr": "67 % de nos abonnes choisissent Accelerateur", "en": "67% of our subscribers choose Accelerator", "es": "67% de nuestros suscriptores eligen Acelerador", "pt": "67% dos nossos assinantes escolhem Acelerador"}',
    '{"fr": "Ils trouvent un job en moyenne 3x plus vite. Rejoins-les aujourd''hui.", "en": "They find a job on average 3x faster. Join them today.", "es": "Encuentran empleo en promedio 3x mas rapido. Unete hoy.", "pt": "Eles encontram emprego em media 3x mais rapido. Junte-se hoje."}',
    '{"fr": "Choisir Accelerateur maintenant", "en": "Choose Accelerator now", "es": "Elegir Acelerador ahora", "pt": "Escolher Acelerador agora"}',
    NULL, NULL, NULL, NULL, 8
)
ON CONFLICT (trigger_id) DO NOTHING;
