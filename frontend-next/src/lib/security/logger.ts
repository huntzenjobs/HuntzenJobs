/**
 * Security Event Logger
 * Integrates with Supabase, Sentry, and Upstash for comprehensive security monitoring
 */

import { createClient } from '@/lib/supabase/client'
import * as Sentry from '@sentry/nextjs'

// Security event types
export type SecurityEventType =
  | 'auth.login_success'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.signup'
  | 'auth.password_reset_request'
  | 'auth.password_reset_success'
  | 'auth.oauth_callback_success'
  | 'auth.oauth_callback_error'
  | 'auth.oauth_failed'
  | 'auth.session_exchange_failed'
  | 'profile.avatar_updated'
  | 'profile.settings_updated'
  | 'profile.data_updated'
  | 'rls.policy_violation'
  | 'quota.limit_exceeded'
  | 'quota.limit_warning'
  | 'file.upload_success'
  | 'file.upload_failed'
  | 'api.rate_limit_exceeded'
  | 'api.unauthorized_access'

export type SecurityEventSeverity = 'info' | 'warning' | 'critical' | 'emergency'

export interface SecurityEventData {
  eventType: SecurityEventType
  severity?: SecurityEventSeverity
  userId?: string
  sessionId?: string
  ipAddress?: string
  userAgent?: string
  metadata?: Record<string, any>
}

/**
 * Get client IP address from request headers
 * Works with Vercel, Cloudflare, and standard proxies
 */
export function getClientIP(headers?: Headers): string | undefined {
  if (!headers) {
    // Browser environment - try to get from navigator
    return undefined
  }

  // Check common headers in order of reliability
  const ipHeaders = [
    'x-real-ip',
    'x-forwarded-for',
    'cf-connecting-ip', // Cloudflare
    'x-vercel-forwarded-for', // Vercel
    'x-client-ip',
  ]

  for (const header of ipHeaders) {
    const value = headers.get(header)
    if (value) {
      // x-forwarded-for can be comma-separated, take first IP
      return value.split(',')[0].trim()
    }
  }

  return undefined
}

/**
 * Get session ID from Supabase auth
 */
async function getSessionId(): Promise<string | undefined> {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.access_token
}

/**
 * Log a security event to Supabase, Sentry, and console
 */
export async function logSecurityEvent(data: SecurityEventData): Promise<void> {
  const {
    eventType,
    severity = 'info',
    userId,
    sessionId,
    ipAddress,
    userAgent,
    metadata = {},
  } = data

  try {
    const supabase = createClient()

    // Get session ID if not provided
    const finalSessionId = sessionId || (await getSessionId())

    // Get user agent if not provided (browser only)
    const finalUserAgent = userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : undefined)

    // Call PostgreSQL function to log event
    const { data: result, error } = await supabase.rpc('log_security_event', {
      p_event_type: eventType,
      p_severity: severity,
      p_user_id: userId || null,
      p_session_id: finalSessionId || null,
      p_ip_address: ipAddress || null,
      p_user_agent: finalUserAgent || null,
      p_event_data: metadata,
    })

    if (error) {
      console.error('Failed to log security event:', error)
      // Don't throw - logging failures shouldn't break app
    }

    // Send to Sentry for critical/emergency events
    if (severity === 'critical' || severity === 'emergency') {
      Sentry.captureMessage(`Security Event: ${eventType}`, {
        level: severity === 'emergency' ? 'fatal' : 'error',
        tags: {
          event_type: eventType,
          severity,
          user_id: userId || 'anonymous',
        },
        extra: {
          ip_address: ipAddress,
          user_agent: finalUserAgent,
          metadata,
        },
      })
    }

    // Console log for development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[SECURITY] ${severity.toUpperCase()}: ${eventType}`, {
        userId,
        ipAddress,
        metadata,
      })
    }
  } catch (error) {
    console.error('Error in logSecurityEvent:', error)
    // Silently fail to avoid breaking app functionality
  }
}

/**
 * Helper functions for common security events
 */

export async function logLoginSuccess(userId: string, metadata?: Record<string, any>) {
  await logSecurityEvent({
    eventType: 'auth.login_success',
    severity: 'info',
    userId,
    metadata,
  })
}

export async function logLoginFailed(email?: string, reason?: string) {
  await logSecurityEvent({
    eventType: 'auth.login_failed',
    severity: 'warning',
    metadata: { email, reason },
  })
}

export async function logLogout(userId: string) {
  await logSecurityEvent({
    eventType: 'auth.logout',
    severity: 'info',
    userId,
  })
}

export async function logProfileUpdate(userId: string, changedFields: string[]) {
  await logSecurityEvent({
    eventType: 'profile.data_updated',
    severity: 'info',
    userId,
    metadata: { changed_fields: changedFields },
  })
}

export async function logAvatarUpdate(userId: string, success: boolean) {
  await logSecurityEvent({
    eventType: 'profile.avatar_updated',
    severity: success ? 'info' : 'warning',
    userId,
    metadata: { success },
  })
}

export async function logRLSViolation(userId?: string, tableName?: string, operation?: string) {
  await logSecurityEvent({
    eventType: 'rls.policy_violation',
    severity: 'critical',
    userId,
    metadata: { table: tableName, operation },
  })
}

export async function logQuotaExceeded(userId: string, feature: string, limit: number) {
  await logSecurityEvent({
    eventType: 'quota.limit_exceeded',
    severity: 'warning',
    userId,
    metadata: { feature, limit },
  })
}

export async function logUnauthorizedAccess(userId?: string, resource?: string) {
  await logSecurityEvent({
    eventType: 'api.unauthorized_access',
    severity: 'critical',
    userId,
    metadata: { resource },
  })
}

/**
 * Check if user has exceeded rate limit using Upstash Redis
 * Returns true if rate limit exceeded
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  try {
    // This will be implemented with Upstash Redis
    // For now, return false (not rate limited)
    // TODO: Implement with Upstash REST API
    return false
  } catch (error) {
    console.error('Rate limit check failed:', error)
    // Fail open - don't block on rate limit errors
    return false
  }
}
