-- Défense en profondeur pour les sessions CV legacy et alignement du cache
-- recruteur sur le contrat réellement utilisé par le backend actuel.

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.user_sessions TO service_role;

ALTER TABLE public.recruiter_cache
  ADD COLUMN IF NOT EXISTS company_slug TEXT,
  ADD COLUMN IF NOT EXISTS recruiters JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS strategy_summary JSONB,
  ADD COLUMN IF NOT EXISTS search_queries JSONB NOT NULL DEFAULT '[]'::JSONB;

-- Les colonnes legacy ne sont plus écrites par le service actuel.
ALTER TABLE public.recruiter_cache
  ALTER COLUMN recruiter_data DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_recruiter_cache_company_slug
  ON public.recruiter_cache (company_slug)
  WHERE company_slug IS NOT NULL;
