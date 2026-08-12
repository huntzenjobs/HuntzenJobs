-- La suppression d'un utilisateur Auth cascade vers user_subscriptions puis
-- subscription_history. Le trigger historique tentait alors de recréer une
-- ligne liée à l'utilisateur déjà supprimé et faisait échouer toute l'opération.
CREATE OR REPLACE FUNCTION public.track_subscription_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  action_type TEXT;
  old_plan_name TEXT;
  new_plan_name TEXT;
  affected_user_id UUID := COALESCE(NEW.user_id, OLD.user_id);
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = OLD.user_id
  ) THEN
    -- Suppression en cascade du compte : l'historique de cet utilisateur est
    -- lui aussi supprimé par conception, il ne faut pas tenter de le recréer.
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    action_type := 'created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
      action_type := 'cancelled';
    ELSIF NEW.status = 'trialing' AND OLD.status IS DISTINCT FROM 'trialing' THEN
      action_type := 'trialing';
    ELSIF NEW.plan_id IS DISTINCT FROM OLD.plan_id THEN
      SELECT name INTO old_plan_name
      FROM public.subscription_plans
      WHERE id = OLD.plan_id;

      SELECT name INTO new_plan_name
      FROM public.subscription_plans
      WHERE id = NEW.plan_id;

      IF new_plan_name > old_plan_name THEN
        action_type := 'upgraded';
      ELSE
        action_type := 'downgraded';
      END IF;
    ELSIF NEW.current_period_end > OLD.current_period_end THEN
      action_type := 'renewed';
    ELSE
      action_type := 'updated';
    END IF;
  ELSE
    action_type := 'deleted';
  END IF;

  INSERT INTO public.subscription_history (
    user_id,
    subscription_id,
    plan_id,
    action_type,
    old_values,
    new_values,
    triggered_by
  ) VALUES (
    affected_user_id,
    COALESCE(NEW.id, OLD.id),
    COALESCE(NEW.plan_id, OLD.plan_id),
    action_type,
    CASE WHEN TG_OP <> 'INSERT' THEN row_to_json(OLD) ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN row_to_json(NEW) ELSE NULL END,
    'trigger'
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.track_subscription_changes()
  FROM PUBLIC, anon, authenticated, service_role;
