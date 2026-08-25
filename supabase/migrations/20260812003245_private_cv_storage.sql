BEGIN;

-- Les CV contiennent des données personnelles et ne doivent jamais être servis
-- par l'URL publique du bucket.
UPDATE storage.buckets
SET public = FALSE
WHERE id = 'cvs';

DROP POLICY IF EXISTS "Anonymous users can upload CVs" ON storage.objects;
DROP POLICY IF EXISTS "Anonymous users can read their CVs" ON storage.objects;

-- Le produit exige désormais une session pour analyser un CV. Les anciennes
-- policies anonymes testaient seulement la présence d'anonymous_id et rendaient
-- donc toutes les lignes anonymes visibles à n'importe quel visiteur.
DROP POLICY IF EXISTS "Users can read own CV analyses" ON public.cv_analyses;
DROP POLICY IF EXISTS "Users can insert own CV analyses" ON public.cv_analyses;
DROP POLICY IF EXISTS "Users can update own CV analyses" ON public.cv_analyses;
DROP POLICY IF EXISTS "Users can delete own CV analyses" ON public.cv_analyses;

REVOKE ALL ON TABLE public.cv_analyses FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.cv_analyses FROM authenticated;
GRANT SELECT ON TABLE public.cv_analyses TO authenticated;

CREATE POLICY "Authenticated users read own CV analyses"
  ON public.cv_analyses
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- L'écriture et la mise à jour du résultat restent exclusivement réalisées par
-- le backend service_role. Les policies Storage propriétaires déjà présentes
-- continuent d'autoriser la lecture du seul dossier auth.uid().

COMMIT;
