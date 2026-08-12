-- is_admin() est utilisé par les politiques RLS. Il doit rester disponible au
-- rôle authenticated, mais ne doit jamais permettre de tester un autre UUID.
CREATE OR REPLACE FUNCTION public.is_admin(
  user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  authenticated_user_id UUID := auth.uid();
  caller_role TEXT := COALESCE(
    auth.jwt()->>'role',
    current_setting('request.jwt.claim.role', true)
  );
  checked_user_id UUID;
BEGIN
  IF caller_role = 'service_role' THEN
    checked_user_id := user_id;
  ELSE
    IF authenticated_user_id IS NULL OR user_id <> authenticated_user_id THEN
      RETURN FALSE;
    END IF;
    checked_user_id := authenticated_user_id;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    WHERE profile.id = checked_user_id
      AND profile.is_admin IS TRUE
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID)
  TO authenticated, service_role;

-- Ne jamais conserver un JWT historique dans la colonne session_id.
UPDATE public.security_events
SET session_id = NULL
WHERE length(COALESCE(session_id, '')) > 128
   OR session_id ~ '^eyJ[^.]+\.[^.]+\.[^.]+$';

CREATE OR REPLACE FUNCTION public.log_security_event(
  p_event_type TEXT,
  p_severity TEXT DEFAULT 'info',
  p_user_id UUID DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_event_data JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  authenticated_user_id UUID := auth.uid();
  caller_role TEXT := COALESCE(
    auth.jwt()->>'role',
    current_setting('request.jwt.claim.role', true)
  );
  effective_user_id UUID;
  effective_session_id TEXT;
  effective_ip_address INET;
  effective_user_agent TEXT;
  event_id UUID;
  client_event_types CONSTANT TEXT[] := ARRAY[
    'auth.login_success',
    'auth.logout',
    'auth.signup',
    'auth.password_reset_request',
    'auth.password_reset_success',
    'auth.oauth_callback_success',
    'profile.avatar_updated',
    'profile.settings_updated',
    'profile.data_updated',
    'rls.policy_violation',
    'quota.limit_exceeded',
    'quota.limit_warning',
    'file.upload_success',
    'file.upload_failed',
    'api.rate_limit_exceeded',
    'api.unauthorized_access'
  ];
BEGIN
  IF caller_role = 'service_role' THEN
    effective_user_id := p_user_id;
    effective_session_id := LEFT(NULLIF(p_session_id, ''), 128);
    effective_ip_address := NULLIF(p_ip_address, '')::INET;
    effective_user_agent := LEFT(NULLIF(p_user_agent, ''), 512);
  ELSE
    IF authenticated_user_id IS NULL THEN
      RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_user_id IS NOT NULL AND p_user_id <> authenticated_user_id THEN
      RAISE EXCEPTION 'Cannot log an event for another user';
    END IF;

    IF p_event_type IS NULL OR NOT (p_event_type = ANY(client_event_types)) THEN
      RAISE EXCEPTION 'Client event type is not allowed';
    END IF;

    IF p_severity NOT IN ('info', 'warning') THEN
      RAISE EXCEPTION 'Client severity is not allowed';
    END IF;

    effective_user_id := authenticated_user_id;
    effective_session_id := LEFT(auth.jwt()->>'session_id', 128);
    -- Une RPC navigateur ne constitue pas une source fiable pour l'IP ou l'UA.
    effective_ip_address := NULL;
    effective_user_agent := NULL;
  END IF;

  IF p_severity NOT IN ('info', 'warning', 'critical', 'emergency') THEN
    RAISE EXCEPTION 'Invalid severity';
  END IF;

  IF p_event_type IS NULL OR length(p_event_type) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Invalid event type';
  END IF;

  IF octet_length(COALESCE(p_event_data, '{}'::JSONB)::TEXT) > 8192 THEN
    RAISE EXCEPTION 'Security event payload is too large';
  END IF;

  INSERT INTO public.security_events (
    event_type,
    severity,
    user_id,
    session_id,
    ip_address,
    user_agent,
    event_data
  ) VALUES (
    p_event_type,
    p_severity,
    effective_user_id,
    effective_session_id,
    effective_ip_address,
    effective_user_agent,
    COALESCE(p_event_data, '{}'::JSONB)
  )
  RETURNING id INTO event_id;

  RETURN event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_security_event(
  TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_security_event(
  TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB
) TO authenticated, service_role;

-- Les fonctions de trigger s'exécutent via leur trigger et ne doivent être
-- appelables directement par aucun rôle Data API, y compris service_role.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM service_role;
REVOKE ALL ON FUNCTION public.log_cv_analysis_updates() FROM service_role;
