-- =====================================================
-- Fix RLS permissive policies
-- Sprint E Sécurité — 2026-03-20
-- =====================================================
-- SEC-08 (audit DB B2) : ai_prompts — FOR ALL USING(true) sans restriction de rôle
--   → n'importe quel utilisateur authentifié peut modifier les prompts IA
-- SEC-08 (audit DB I2) : translation_memory — INSERT/UPDATE ouverts à tous
--   → n'importe quel utilisateur peut polluer le cache de traductions
-- =====================================================

-- =====================================================
-- 1. FIX ai_prompts — Restreindre à service_role + SELECT public
-- =====================================================

-- Supprimer la policy trop permissive (FOR ALL sans restriction de rôle)
DROP POLICY IF EXISTS "Service role full access" ON public.ai_prompts;

-- Lecture publique des prompts (le backend load_prompt() utilise service_role,
-- mais la lecture n'est pas sensible)
CREATE POLICY "Anyone can read ai prompts"
  ON public.ai_prompts
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Seul le service_role peut modifier les prompts IA
CREATE POLICY "Service role manages ai prompts"
  ON public.ai_prompts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.ai_prompts IS
  'Prompts IA éditables par admin. Lecture publique, écriture service_role only. '
  'Fix audit B2 : policy FOR ALL sans restriction de rôle corrigée le 2026-03-20.';

-- =====================================================
-- 2. FIX translation_memory — Restreindre INSERT/UPDATE à service_role
-- =====================================================

-- Supprimer les policies trop permissives
DROP POLICY IF EXISTS "translation_memory_write" ON public.translation_memory;
DROP POLICY IF EXISTS "translation_memory_update" ON public.translation_memory;

-- INSERT restreint à service_role (le backend traduit via DeepL/Azure)
CREATE POLICY "Service role inserts translations"
  ON public.translation_memory
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- UPDATE restreint à service_role (increment_tm_usage via service_role)
CREATE POLICY "Service role updates translations"
  ON public.translation_memory
  FOR UPDATE
  TO service_role
  USING (true);

COMMENT ON TABLE public.translation_memory IS
  'Cache de traductions DeepL/Azure. Lecture publique, écriture service_role only. '
  'Fix audit I2 : INSERT/UPDATE ouverts à tous corrigé le 2026-03-20.';
