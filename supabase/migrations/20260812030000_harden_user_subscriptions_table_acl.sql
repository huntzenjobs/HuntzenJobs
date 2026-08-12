-- La projection financière est écrite exclusivement par le backend
-- service_role. Les clients authentifiés conservent uniquement la lecture de
-- leur propre ligne via RLS ; anon ne doit posséder aucun privilège de table.
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_subscriptions
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.user_subscriptions TO authenticated;
GRANT ALL ON TABLE public.user_subscriptions TO service_role;
