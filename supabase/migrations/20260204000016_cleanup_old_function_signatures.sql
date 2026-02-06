-- =====================================================
-- Cleanup Old Function Signatures
-- =====================================================
-- Issue: Old versions of functions without search_path still exist
-- Solution: Drop old signatures explicitly
-- =====================================================

-- =====================================================
-- 1. DROP OLD log_security_event SIGNATURE
-- =====================================================
-- Old signature: log_security_event(user_id, action, resource_type, resource_id, success, error_message)
-- This version logs to security_audit_log table (old schema)

DROP FUNCTION IF EXISTS public.log_security_event(
  UUID,      -- p_user_id
  TEXT,      -- p_action
  TEXT,      -- p_resource_type
  UUID,      -- p_resource_id
  BOOLEAN,   -- p_success
  TEXT       -- p_error_message
);

-- Note: The new version with proper signature is already in place from migration 000011:
-- log_security_event(event_type, severity, user_id, session_id, ip_address, user_agent, event_data)

COMMENT ON FUNCTION public.log_security_event(TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB) IS
  'Logs security events with severity validation. Uses search_path = public, pg_temp for security.';

-- =====================================================
-- 2. VERIFY update_coach_conversation_metadata
-- =====================================================
-- This function should already be fixed in migration 000011
-- Verify it has search_path set

DO $$
DECLARE
  v_has_search_path BOOLEAN;
BEGIN
  SELECT
    'search_path' = ANY(string_to_array(array_to_string(proconfig, ','), ','))
  INTO v_has_search_path
  FROM pg_proc
  WHERE proname = 'update_coach_conversation_metadata'
    AND pronamespace = 'public'::regnamespace;

  IF v_has_search_path THEN
    RAISE NOTICE '✅ update_coach_conversation_metadata has search_path configured';
  ELSE
    RAISE NOTICE '⚠️  update_coach_conversation_metadata missing search_path - may need manual intervention';
  END IF;
END $$;

-- =====================================================
-- 3. LIST ALL FUNCTIONS WITHOUT search_path
-- =====================================================
-- Query to find any remaining SECURITY DEFINER functions without search_path

DO $$
DECLARE
  v_count INTEGER;
  v_func RECORD;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.prosecdef = true
    AND NOT ('search_path' = ANY(string_to_array(array_to_string(p.proconfig, ','), ',')));

  IF v_count > 0 THEN
    RAISE NOTICE '⚠️  Found % SECURITY DEFINER functions without search_path:', v_count;

    FOR v_func IN
      SELECT
        p.proname as function_name,
        pg_get_function_identity_arguments(p.oid) as arguments
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.prosecdef = true
        AND NOT ('search_path' = ANY(string_to_array(array_to_string(p.proconfig, ','), ',')))
      ORDER BY p.proname
    LOOP
      RAISE NOTICE '  - %(%) needs search_path', v_func.function_name, v_func.arguments;
    END LOOP;
  ELSE
    RAISE NOTICE '✅ All SECURITY DEFINER functions have search_path configured';
  END IF;
END $$;

-- =====================================================
-- Migration Complete
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Cleanup complete';
  RAISE NOTICE 'Old function signatures removed';
END $$;
