-- Migration historique conservée pour maintenir l'alignement des versions.
--
-- La table public.cv_profiles, ses politiques RLS, ses index et son trigger sont
-- déjà créés par 20260227000005_create_cv_profiles.sql. L'ancienne version de ce
-- fichier répétait les mêmes CREATE POLICY/INDEX/TRIGGER sans garde et empêchait
-- donc toute reconstruction d'une base depuis zéro.
--
-- Aucun changement de schéma n'est nécessaire ici.
DO $$
BEGIN
  IF to_regclass('public.cv_profiles') IS NULL THEN
    RAISE EXCEPTION
      'public.cv_profiles doit être créée par 20260227000005 avant cette migration';
  END IF;
END
$$;
