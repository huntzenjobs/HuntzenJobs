-- Les compteurs et quotas sont autoritatifs côté backend. Un client ne doit
-- jamais pouvoir les augmenter, les réinitialiser ou créer sa propre ligne.
ALTER TABLE public.usage_quotas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.usage_quotas
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.usage_quotas TO service_role;

DROP POLICY IF EXISTS "Users can insert own usage quotas"
  ON public.usage_quotas;
DROP POLICY IF EXISTS "Users can update own usage quotas"
  ON public.usage_quotas;

-- Le profil reste lisible par son propriétaire et seules les préférences
-- réellement éditables par l'interface sont modifiables depuis le navigateur.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.profiles
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT UPDATE (
  avatar_url,
  email_notifications,
  full_name,
  newsletter_subscribed,
  preferred_language,
  updated_at
) ON public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

-- La projection abonnement ne doit conserver aucune policy de mutation client,
-- même si les ACL de table la rendent déjà inopérante.
DROP POLICY IF EXISTS "Users can update own subscriptions"
  ON public.user_subscriptions;
