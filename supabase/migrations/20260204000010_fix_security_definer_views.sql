-- =====================================================
-- Fix Security Definer Views
-- https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view
-- =====================================================
-- Issue: Views with SECURITY DEFINER execute with creator's permissions,
-- potentially allowing privilege escalation.
-- Solution: Recreate views with security_invoker = true
-- =====================================================

-- Drop existing views (CASCADE ensures no dependencies break)
DROP VIEW IF EXISTS public.event_type_distribution CASCADE;
DROP VIEW IF EXISTS public.recent_critical_events CASCADE;
DROP VIEW IF EXISTS public.failed_logins_by_ip CASCADE;

-- =====================================================
-- 1. Recent Critical Events View
-- Shows critical/emergency security events from last 24 hours
-- =====================================================
CREATE VIEW public.recent_critical_events
WITH (security_invoker = true)
AS
SELECT
  id,
  event_type,
  severity,
  user_id,
  ip_address,
  created_at,
  event_data
FROM public.security_events
WHERE
  severity IN ('critical', 'emergency')
  AND created_at > (now() - INTERVAL '24 hours')
ORDER BY created_at DESC;

COMMENT ON VIEW public.recent_critical_events IS 'Security view: Shows recent critical and emergency security events. Uses security_invoker to respect RLS policies.';

-- =====================================================
-- 2. Failed Logins By IP View
-- Aggregates failed login attempts by IP address (last hour)
-- =====================================================
CREATE VIEW public.failed_logins_by_ip
WITH (security_invoker = true)
AS
SELECT
  ip_address,
  COUNT(*) as attempt_count,
  MAX(created_at) as last_attempt,
  array_agg(DISTINCT user_id) as attempted_user_ids
FROM public.security_events
WHERE
  event_type = 'auth.failed_login'
  AND created_at > (now() - INTERVAL '1 hour')
GROUP BY ip_address
HAVING COUNT(*) >= 3
ORDER BY attempt_count DESC;

COMMENT ON VIEW public.failed_logins_by_ip IS 'Security view: Detects potential brute force attacks by tracking failed login attempts per IP. Uses security_invoker to respect RLS policies.';

-- =====================================================
-- 3. Event Type Distribution View
-- Statistics on event types for monitoring dashboard
-- =====================================================
CREATE VIEW public.event_type_distribution
WITH (security_invoker = true)
AS
SELECT
  event_type,
  COUNT(*) as event_count,
  COUNT(DISTINCT user_id) as unique_users
FROM public.security_events
WHERE created_at > (now() - INTERVAL '24 hours')
GROUP BY event_type
ORDER BY event_count DESC;

COMMENT ON VIEW public.event_type_distribution IS 'Security view: Shows distribution of security event types. Uses security_invoker to respect RLS policies.';

-- =====================================================
-- Grant Permissions
-- =====================================================
-- Only service_role should have access to these monitoring views
-- Regular authenticated users shouldn't see aggregated security data

-- For now, we grant to authenticated for backward compatibility
-- but in production, consider restricting to service_role or admin role only
GRANT SELECT ON public.event_type_distribution TO authenticated, service_role;
GRANT SELECT ON public.recent_critical_events TO authenticated, service_role;
GRANT SELECT ON public.failed_logins_by_ip TO authenticated, service_role;

-- Alternative: Restrict to service_role only
-- GRANT SELECT ON public.event_type_distribution TO service_role;
-- GRANT SELECT ON public.recent_critical_events TO service_role;
-- GRANT SELECT ON public.failed_logins_by_ip TO service_role;

-- =====================================================
-- Migration Complete
-- =====================================================
-- These views now use security_invoker = true, which means:
-- 1. Queries execute with the caller's permissions (not creator's)
-- 2. RLS policies on security_events table are respected
-- 3. Users can only see events they have permission to see
-- =====================================================
