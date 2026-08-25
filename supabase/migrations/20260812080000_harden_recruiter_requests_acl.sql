-- Les demandes recruteur sont créées et administrées via le backend service_role.
-- Le client authentifié peut uniquement consulter ses propres lignes via RLS.

REVOKE ALL ON TABLE public.recruiter_requests
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.recruiter_requests TO authenticated;
GRANT ALL ON TABLE public.recruiter_requests TO service_role;
