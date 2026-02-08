/**
 * Anomaly Detection System
 * Uses Upstash Redis for rate limiting and pattern detection
 * Falls back to Supabase for anomaly checks
 */

import { createClient } from '@/lib/supabase/client'
import { logSecurityEvent } from './logger'

// Configuration
const UPSTASH_REST_URL = process.env.UPSTASH_REDIS_REST_URL
const UPSTASH_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

/**
 * Upstash Redis REST API client
 */
class UpstashClient {
  private baseUrl: string
  private token: string

  constructor(url: string, token: string) {
    this.baseUrl = url
    this.token = token
  }

  async execute(command: string[]): Promise<any> {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(command),
      })

      if (!response.ok) {
        throw new Error(`Upstash request failed: ${response.statusText}`)
      }

      const data = await response.json()
      return data.result
    } catch (error) {
      console.error('Upstash request error:', error)
      return null
    }
  }

  async incr(key: string): Promise<number | null> {
    return await this.execute(['INCR', key])
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    return await this.execute(['EXPIRE', key, seconds.toString()])
  }

  async get(key: string): Promise<string | null> {
    return await this.execute(['GET', key])
  }

  async set(key: string, value: string, exSeconds?: number): Promise<string | null> {
    if (exSeconds) {
      return await this.execute(['SET', key, value, 'EX', exSeconds.toString()])
    }
    return await this.execute(['SET', key, value])
  }
}

// Initialize Upstash client if credentials are available
const upstash =
  UPSTASH_REST_URL && UPSTASH_REST_TOKEN
    ? new UpstashClient(UPSTASH_REST_URL, UPSTASH_REST_TOKEN)
    : null

/**
 * Check rate limit using Upstash Redis (or fallback to Supabase)
 */
export async function checkRateLimit(
  identifier: string, // user ID, IP, email, etc.
  action: string, // login, upload, api_call, etc.
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const key = `ratelimit:${action}:${identifier}`

  try {
    if (upstash) {
      // Use Upstash Redis
      const count = await upstash.incr(key)

      if (count === 1) {
        // First request, set expiration
        await upstash.expire(key, windowSeconds)
      }

      const allowed = count !== null && count <= limit
      const remaining = Math.max(0, limit - (count || 0))
      const resetAt = new Date(Date.now() + windowSeconds * 1000)

      if (!allowed) {
        // Log rate limit exceeded
        await logSecurityEvent({
          eventType: 'api.rate_limit_exceeded',
          severity: 'warning',
          metadata: {
            action,
            identifier,
            limit,
            count,
            window_seconds: windowSeconds,
          },
        })
      }

      return { allowed, remaining, resetAt }
    } else {
      // Fallback to Supabase (less performant but works)
      return await checkRateLimitSupabase(identifier, action, limit, windowSeconds)
    }
  } catch (error) {
    console.error('Rate limit check failed:', error)
    // Fail open - allow the request
    return { allowed: true, remaining: limit, resetAt: new Date(Date.now() + windowSeconds * 1000) }
  }
}

/**
 * Fallback rate limit check using Supabase
 */
async function checkRateLimitSupabase(
  identifier: string,
  action: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const supabase = createClient()
  const windowStart = new Date(Date.now() - windowSeconds * 1000)

  // Count recent events
  const { count, error } = await supabase
    .from('security_events')
    .select('*', { count: 'exact', head: true })
    .eq('event_type', action)
    .eq('user_id', identifier)
    .gte('created_at', windowStart.toISOString())

  if (error) {
    console.error('Supabase rate limit check failed:', error)
    // Fail open
    return { allowed: true, remaining: limit, resetAt: new Date(Date.now() + windowSeconds * 1000) }
  }

  const currentCount = count || 0
  const allowed = currentCount < limit
  const remaining = Math.max(0, limit - currentCount)
  const resetAt = new Date(Date.now() + windowSeconds * 1000)

  return { allowed, remaining, resetAt }
}

/**
 * Detect failed login anomaly for a user
 */
export async function detectFailedLoginAnomaly(
  userId: string,
  threshold: number = 5,
  windowMinutes: number = 15
): Promise<boolean> {
  const supabase = createClient()

  const { data, error } = await supabase.rpc('detect_failed_login_anomaly', {
    p_user_id: userId,
    p_threshold: threshold,
    p_time_window: `${windowMinutes} minutes`,
  })

  if (error) {
    console.error('Failed login anomaly detection failed:', error)
    return false
  }

  return data === true
}

/**
 * Detect suspicious IP activity
 * Returns true if IP has attempted logins for multiple different accounts
 */
export async function detectSuspiciousIP(
  ipAddress: string,
  uniqueAccountThreshold: number = 3,
  windowMinutes: number = 60
): Promise<boolean> {
  if (upstash) {
    // Use Redis sets to track unique accounts per IP
    const key = `ip:${ipAddress}:accounts`
    const accounts = await upstash.get(key)

    if (accounts) {
      const accountList = JSON.parse(accounts)
      return accountList.length >= uniqueAccountThreshold
    }

    return false
  } else {
    // Fallback to Supabase
    const supabase = createClient()
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000)

    const { data, error } = await supabase
      .from('security_events')
      .select('user_id')
      .eq('event_type', 'auth.login_failed')
      .eq('ip_address', ipAddress)
      .gte('created_at', windowStart.toISOString())

    if (error || !data) {
      return false
    }

    const uniqueUsers = new Set(data.map((e) => e.user_id))
    return uniqueUsers.size >= uniqueAccountThreshold
  }
}

/**
 * Track user account attempt for IP address
 */
export async function trackIPAccountAttempt(ipAddress: string, userId: string): Promise<void> {
  if (!upstash) return

  const key = `ip:${ipAddress}:accounts`
  const windowSeconds = 3600 // 1 hour

  try {
    const existing = await upstash.get(key)
    const accounts = existing ? JSON.parse(existing) : []

    if (!accounts.includes(userId)) {
      accounts.push(userId)
      await upstash.set(key, JSON.stringify(accounts), windowSeconds)
    }
  } catch (error) {
    console.error('Failed to track IP account attempt:', error)
  }
}

/**
 * Get anomaly score for a user
 * Returns a score from 0-100 (higher = more suspicious)
 */
export async function getUserAnomalyScore(userId: string): Promise<number> {
  let score = 0

  try {
    const supabase = createClient()
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

    // Count recent security events
    const { count: totalEvents } = await supabase
      .from('security_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', last24h.toISOString())

    const { count: failedLogins } = await supabase
      .from('security_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('event_type', 'auth.login_failed')
      .gte('created_at', last24h.toISOString())

    const { count: criticalEvents } = await supabase
      .from('security_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('severity', ['critical', 'emergency'])
      .gte('created_at', last24h.toISOString())

    // Calculate score
    score += (totalEvents || 0) > 50 ? 20 : 0 // High activity
    score += (failedLogins || 0) > 5 ? 30 : (failedLogins || 0) * 5 // Failed logins
    score += (criticalEvents || 0) * 25 // Critical events are very suspicious

    return Math.min(100, score)
  } catch (error) {
    console.error('Failed to calculate anomaly score:', error)
    return 0
  }
}

/**
 * Block user temporarily if anomaly score is too high
 */
export async function checkAndBlockSuspiciousUser(userId: string): Promise<boolean> {
  const score = await getUserAnomalyScore(userId)

  if (score >= 80) {
    // Very suspicious - log and potentially block
    await logSecurityEvent({
      eventType: 'api.unauthorized_access',
      severity: 'emergency',
      userId,
      metadata: {
        anomaly_score: score,
        action: 'temporary_block_recommended',
      },
    })

    // TODO: Implement actual blocking mechanism
    // For now, just return true to indicate user should be blocked
    return true
  }

  return false
}
