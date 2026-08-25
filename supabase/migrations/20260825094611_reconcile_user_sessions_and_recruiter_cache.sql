-- Réconcilie les deux formes historiques observées du cache recruteur sans
-- réécrire les lignes existantes. La base staging conserve ses colonnes
-- legacy, tandis que la production utilise déjà company_slug comme clé.

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.user_sessions TO service_role;

ALTER TABLE public.recruiter_cache
  ADD COLUMN IF NOT EXISTS company_slug TEXT,
  ADD COLUMN IF NOT EXISTS recruiters JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS strategy_summary JSONB,
  ADD COLUMN IF NOT EXISTS search_queries JSONB DEFAULT '[]'::JSONB;

ALTER TABLE public.recruiter_cache
  ALTER COLUMN recruiters SET DEFAULT '[]'::JSONB,
  ALTER COLUMN search_queries SET DEFAULT '[]'::JSONB;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recruiter_cache'
      AND column_name = 'recruiter_data'
  ) THEN
    ALTER TABLE public.recruiter_cache
      ALTER COLUMN recruiter_data DROP NOT NULL;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_recruiter_cache_company_slug
  ON public.recruiter_cache (company_slug)
  WHERE company_slug IS NOT NULL;
