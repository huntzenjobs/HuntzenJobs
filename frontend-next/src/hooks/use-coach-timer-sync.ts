/**
 * Coach Timer Sync Hook
 *
 * Synchronizes coach session time usage from frontend to backend
 * to ensure accurate quota tracking even if browser crashes or closes.
 *
 * Optimized sync strategy:
 * - Sync every 2 minutes during active session (vs 30s before)
 * - Sync on session end (normal termination)
 * - Sync on beforeunload/visibilitychange (browser close/minimize)
 * - Minimum delta threshold: only sync if > 10s used since last sync
 *
 * Performance:
 * - 1-hour session = ~30 requests (vs 120 with 30s interval)
 * - 75% reduction in backend calls
 * - Still guarantees data accuracy within 2 minutes
 */

import { useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/auth-context'

const SYNC_INTERVAL = 2 * 60 * 1000 // 2 minutes (optimized from 30s)
const MIN_SYNC_DELTA = 10 // Minimum 10 seconds before syncing

export function useCoachTimerSync(
  isSessionActive: boolean,
  getSecondsUsed: () => number
) {
  const { session } = useAuth()
  const lastSyncedSecondsRef = useRef(0)
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isSyncingRef = useRef(false)

  /**
   * Sync current usage delta to backend
   * Returns true if sync was successful
   */
  const syncToBackend = async (force: boolean = false): Promise<boolean> => {
    // Don't sync if already in progress
    if (isSyncingRef.current) {
      console.log('[CoachSync] Sync already in progress, skipping')
      return false
    }

    const totalSecondsUsed = getSecondsUsed()
    const deltaSeconds = totalSecondsUsed - lastSyncedSecondsRef.current

    // Only sync if meaningful delta (> 10s) or forced
    if (!force && deltaSeconds < MIN_SYNC_DELTA) {
      console.log(`[CoachSync] Delta too small (${deltaSeconds}s), skipping`)
      return false
    }

    if (!session?.access_token) {
      console.warn('[CoachSync] No access token, cannot sync')
      return false
    }

    try {
      isSyncingRef.current = true
      console.log(`[CoachSync] Syncing ${deltaSeconds}s to backend (total: ${totalSecondsUsed}s)`)

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/coach/sync-time`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ seconds_used: deltaSeconds })
        }
      )

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      console.log('[CoachSync] Sync successful:', data)

      // Update last synced reference
      lastSyncedSecondsRef.current = totalSecondsUsed

      return true

    } catch (error) {
      console.error('[CoachSync] Sync error:', error)
      return false
    } finally {
      isSyncingRef.current = false
    }
  }

  // Effect: Setup sync interval during active session
  useEffect(() => {
    if (!isSessionActive || !session?.access_token) {
      // Clear interval when session ends or no auth
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current)
        syncIntervalRef.current = null
      }
      return
    }

    console.log('[CoachSync] Starting sync interval (2 min)')

    // Initial sync after 5 seconds (small delay to accumulate some usage)
    const initialTimeout = setTimeout(() => {
      syncToBackend()
    }, 5000)

    // Periodic sync every 2 minutes
    syncIntervalRef.current = setInterval(() => {
      syncToBackend()
    }, SYNC_INTERVAL)

    return () => {
      clearTimeout(initialTimeout)
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current)
        syncIntervalRef.current = null
      }
      // Final sync when session ends (normal termination)
      console.log('[CoachSync] Session ended, final sync')
      syncToBackend(true) // Force sync on cleanup
    }
  }, [isSessionActive, session?.access_token])

  // Effect: Sync on beforeunload (browser close/refresh)
  useEffect(() => {
    if (!isSessionActive) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Synchronous sync on unload (best effort)
      const delta = getSecondsUsed() - lastSyncedSecondsRef.current

      if (delta >= MIN_SYNC_DELTA && session?.access_token) {
        console.log('[CoachSync] beforeunload - syncing', delta, 's')

        // Use sendBeacon for async sync during unload (more reliable than fetch)
        // Note: sendBeacon doesn't support Authorization header well,
        // so we use query param for token (less secure but necessary for unload)
        const url = `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/coach/sync-time?token=${session.access_token}`
        const payload = JSON.stringify({ seconds_used: delta })

        navigator.sendBeacon(url, payload)
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [isSessionActive, session?.access_token, getSecondsUsed])

  // Effect: Sync on visibility change (tab hidden/minimized)
  useEffect(() => {
    if (!isSessionActive) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Tab hidden - sync current state
        console.log('[CoachSync] Tab hidden, syncing')
        syncToBackend()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isSessionActive])

  // Return manual sync function (if needed by parent component)
  return {
    syncNow: () => syncToBackend(true),
    lastSyncedSeconds: lastSyncedSecondsRef.current
  }
}
