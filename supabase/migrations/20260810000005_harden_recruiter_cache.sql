-- Migration forward : les corrections apportées aux anciennes migrations ne
-- sont pas rejouées sur une base production déjà migrée.

ALTER TABLE public.recruiter_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.recruiter_cache FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.recruiter_cache TO service_role;

DROP POLICY IF EXISTS "Service role can manage recruiter cache"
  ON public.recruiter_cache;
CREATE POLICY "Service role can manage recruiter cache"
  ON public.recruiter_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
