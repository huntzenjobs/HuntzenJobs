-- Un seul trigger doit initialiser un nouvel utilisateur.
--
-- handle_new_user() crée déjà le profil, l'abonnement gratuit et les quotas.
-- Le trigger historique ci-dessous répétait l'abonnement et, n'étant pas
-- SECURITY DEFINER, échouait lorsque l'insertion provenait de Supabase Auth.

DROP TRIGGER IF EXISTS trigger_assign_free_plan_new_user ON auth.users;
DROP FUNCTION IF EXISTS public.assign_free_plan_to_new_user();
