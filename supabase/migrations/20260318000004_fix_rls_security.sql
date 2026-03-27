-- =====================================================
-- Fix RLS Security Issues
-- Sprint 1 — Audit Commercial 2026-03-18
-- =====================================================
-- SEC-01 : user_sessions USING(true) expose les CV de tous les utilisateurs
-- SEC-08 : 4 tables sans RLS activée (webhook_failures, stripe_webhook_events,
--          stripe_prices, assistant_suggestions)
-- =====================================================

-- =====================================================
-- 1. FIX user_sessions — Supprimer policies USING(true)
--    et ne garder que l'accès service_role
-- =====================================================

-- Supprimer les policies trop permissives (anon/authenticated avec USING(true))
DROP POLICY IF EXISTS "Users can read own session" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can insert own session" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can update own session" ON public.user_sessions;
DROP POLICY IF EXISTS "Service role has full access to user sessions" ON public.user_sessions;

-- Le backend utilise service_role pour toutes les opérations sur user_sessions
-- Aucun accès direct depuis le frontend (anon/authenticated) n'est nécessaire
-- car les sessions sont gérées via l'API backend uniquement
CREATE POLICY "Service role manages user sessions"
  ON public.user_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.user_sessions IS
  'Sessions anonymes/authentifiées contenant cv_text (PII). '
  'Accès exclusivement via service_role (backend API). '
  'Fix SEC-01 : USING(true) pour anon/authenticated supprimé le 2026-03-18.';

-- =====================================================
-- 2. FIX webhook_failures — Activer RLS (service_role only)
--    Contient des payloads Stripe potentiellement sensibles
-- =====================================================

ALTER TABLE IF EXISTS public.webhook_failures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages webhook failures" ON public.webhook_failures;
CREATE POLICY "Service role manages webhook failures"
  ON public.webhook_failures
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.webhook_failures IS
  'Logs d''erreurs webhook Stripe. Service_role only. RLS activée le 2026-03-18.';

-- =====================================================
-- 3. FIX stripe_webhook_events — Activer RLS (service_role only)
--    Contient des event IDs et payloads Stripe (idempotence)
-- =====================================================

ALTER TABLE IF EXISTS public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages stripe webhook events" ON public.stripe_webhook_events;
CREATE POLICY "Service role manages stripe webhook events"
  ON public.stripe_webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.stripe_webhook_events IS
  'Table d''idempotence pour les webhooks Stripe. Service_role only. RLS activée le 2026-03-18.';

-- =====================================================
-- 4. FIX stripe_prices — Activer RLS
--    Lecture publique (page pricing), écriture service_role only
-- =====================================================

ALTER TABLE IF EXISTS public.stripe_prices ENABLE ROW LEVEL SECURITY;

-- Tout le monde peut lire les prix (page /pricing)
DROP POLICY IF EXISTS "Anyone can read stripe prices" ON public.stripe_prices;
CREATE POLICY "Anyone can read stripe prices"
  ON public.stripe_prices
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Seul le service_role peut modifier les prix
DROP POLICY IF EXISTS "Service role manages stripe prices" ON public.stripe_prices;
CREATE POLICY "Service role manages stripe prices"
  ON public.stripe_prices
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.stripe_prices IS
  'Configuration des prix Stripe. Lecture publique, écriture service_role only. RLS activée le 2026-03-18.';

-- =====================================================
-- 5. FIX assistant_suggestions — Activer RLS
--    Texte de suggestions publiques (faible risque), écriture service_role only
-- =====================================================

ALTER TABLE IF EXISTS public.assistant_suggestions ENABLE ROW LEVEL SECURITY;

-- Les suggestions sont des textes publics (affichés à tous les utilisateurs)
DROP POLICY IF EXISTS "Anyone can read assistant suggestions" ON public.assistant_suggestions;
CREATE POLICY "Anyone can read assistant suggestions"
  ON public.assistant_suggestions
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Seul le service_role peut créer/modifier/supprimer des suggestions
DROP POLICY IF EXISTS "Service role manages assistant suggestions" ON public.assistant_suggestions;
CREATE POLICY "Service role manages assistant suggestions"
  ON public.assistant_suggestions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.assistant_suggestions IS
  'Suggestions affichées dans l''interface assistant. Lecture publique, écriture service_role only. RLS activée le 2026-03-18.';
