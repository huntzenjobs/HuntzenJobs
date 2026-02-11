/**
 * Centralized Token Refresh Service
 *
 * Handles automatic JWT token refresh with the following features:
 * - Queues requests during an active refresh to prevent race conditions
 * - Ensures only ONE refreshSession() call even with multiple simultaneous requests
 * - Invalidates caches via CustomEvent dispatch
 * - Prevents excessive refresh calls by queuing parallel requests
 *
 * Note: Supabase has a rate limit of 150 refresh/5min per IP. This service
 * naturally respects this by queuing concurrent requests rather than making
 * multiple refresh calls.
 *
 * Usage:
 * ```typescript
 * import { tokenRefreshService } from '@/lib/auth/token-refresh-service'
 *
 * const token = await tokenRefreshService.getValidToken()
 * if (!token) {
 *   // Session expired, user will be redirected to login
 * }
 * ```
 */

import { createClient } from '@/lib/supabase/client'
import type { Session } from '@supabase/supabase-js'

type TokenCallback = (token: string | null) => void

class TokenRefreshService {
  private isRefreshing = false
  private refreshPromise: Promise<Session | null> | null = null
  private pendingCallbacks: TokenCallback[] = []
  private supabase = createClient()

  /**
   * Get a valid access token. If the current token is expired,
   * automatically refresh it. If a refresh is already in progress,
   * queue the request and wait for the refresh to complete.
   *
   * @returns Valid access token or null if session is expired
   */
  async getValidToken(): Promise<string | null> {
    // 1. Check current session
    const { data: { session }, error } = await this.supabase.auth.getSession()

    if (error) {
      console.error('[TokenRefreshService] Error getting session:', error)
      return null
    }

    // 2. If we have a valid token, return it
    if (session?.access_token && !this.isTokenExpired(session.access_token)) {
      return session.access_token
    }

    // 3. If refresh is already in progress, queue this request
    if (this.isRefreshing && this.refreshPromise) {
      console.log('[TokenRefreshService] Refresh already in progress, queuing request...')
      return new Promise<string | null>((resolve) => {
        this.pendingCallbacks.push(resolve)
      })
    }

    // 4. Start a new refresh
    return this.performRefresh()
  }

  /**
   * Force a token refresh. Used by AuthContext when TOKEN_REFRESHED event is received.
   */
  async forceRefresh(): Promise<void> {
    console.log('[TokenRefreshService] Force refresh requested')
    await this.performRefresh()
  }

  /**
   * Invalidate all caches (subscription, quotas, etc.)
   * Called after successful token refresh.
   */
  invalidateCaches(): void {
    console.log('[TokenRefreshService] Invalidating caches...')

    // Clear subscription cache
    localStorage.removeItem('huntzen_subscription_cache')
    localStorage.removeItem('huntzen_subscription_cache_expiry')

    // Dispatch event for contexts to listen to
    window.dispatchEvent(new CustomEvent('subscription-changed'))

    console.log('[TokenRefreshService] Caches invalidated')
  }

  /**
   * Perform the actual token refresh operation.
   * Handles queuing, error cases, and cache invalidation.
   */
  private async performRefresh(): Promise<string | null> {
    console.log('[TokenRefreshService] Starting token refresh...')

    this.isRefreshing = true
    this.refreshPromise = this.supabase.auth.refreshSession().then(({ data }) => data.session)

    try {
      const session = await this.refreshPromise

      if (!session?.access_token) {
        console.error('[TokenRefreshService] Refresh failed - no session returned')

        // Notify all pending callbacks with null
        this.notifyPendingCallbacks(null)

        // Dispatch token-expired event
        window.dispatchEvent(new CustomEvent('token-expired'))

        // Force logout and redirect
        await this.supabase.auth.signOut()
        window.location.href = '/login?error=session_expired'

        return null
      }

      console.log('[TokenRefreshService] Token refresh successful')

      const token = session.access_token

      // Notify all pending callbacks with the new token
      this.notifyPendingCallbacks(token)

      // Invalidate caches to force refetch with new token
      this.invalidateCaches()

      // Dispatch token-refreshed event
      window.dispatchEvent(new CustomEvent('token-refreshed'))

      return token

    } catch (error) {
      console.error('[TokenRefreshService] Refresh error:', error)

      // Notify pending callbacks with null
      this.notifyPendingCallbacks(null)

      // Dispatch token-expired event
      window.dispatchEvent(new CustomEvent('token-expired'))

      // Force logout and redirect
      try {
        await this.supabase.auth.signOut()
      } catch (signOutError) {
        console.warn('[TokenRefreshService] Sign out error (continuing anyway):', signOutError)
      }

      window.location.href = '/login?error=session_expired'

      return null

    } finally {
      this.isRefreshing = false
      this.refreshPromise = null
    }
  }

  /**
   * Notify all pending callbacks waiting for token refresh.
   */
  private notifyPendingCallbacks(token: string | null): void {
    if (this.pendingCallbacks.length > 0) {
      console.log(`[TokenRefreshService] Notifying ${this.pendingCallbacks.length} pending callbacks`)
      this.pendingCallbacks.forEach(callback => callback(token))
      this.pendingCallbacks = []
    }
  }

  /**
   * Check if a JWT token is expired.
   * Returns true if token will expire in the next 120 seconds (buffer).
   *
   * Buffer rationale: 120s provides margin for network latency, clock skew,
   * and request processing time. Better to refresh early than fail mid-request.
   */
  private isTokenExpired(token: string): boolean {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      const expiresAt = payload.exp * 1000 // Convert to milliseconds
      const now = Date.now()
      const bufferMs = 120 * 1000 // 120 seconds buffer for network latency

      return expiresAt - now < bufferMs
    } catch (error) {
      console.error('[TokenRefreshService] Error parsing token:', error)
      return true // Assume expired if we can't parse
    }
  }
}

// Export singleton instance
export const tokenRefreshService = new TokenRefreshService()
