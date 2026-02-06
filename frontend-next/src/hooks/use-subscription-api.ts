'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { createClient } from '@/lib/supabase/client'

// Types from backend API response
interface UserData {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  created_at: string | null
}

interface SubscriptionData {
  plan_name: 'free' | 'starter' | 'pro' | 'premium'
  plan_display_name: string
  price_monthly: number
  status: string
  current_period_end: string | null
}

interface QuotaData {
  limit: number
  used: number
  remaining: number
  percentage: number
  has_access: boolean
  reset_at: string
}

interface QuotasData {
  cv_analysis: QuotaData
  coach: QuotaData
  job_search: QuotaData
}

interface ApiResponse {
  success: boolean
  user: UserData
  subscription: SubscriptionData
  quotas: QuotasData
  error?: string
}

interface SubscriptionApiData {
  user: UserData | null
  subscription: SubscriptionData | null
  quotas: QuotasData | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  isFromCache: boolean
}

const CACHE_KEY = 'huntzen_subscription_cache'
const CACHE_EXPIRY_KEY = 'huntzen_subscription_cache_expiry'
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours
const REFRESH_INTERVAL = 5 * 60 * 1000 // 5 minutes

/**
 * Hook to fetch subscription data from backend API /api/auth/me
 * - Auto-refreshes every 5 minutes
 * - Uses localStorage cache as fallback
 * - Handles token expiration and errors
 */
export function useSubscriptionApi(): SubscriptionApiData {
  const { session, loading: authLoading } = useAuth()
  const [data, setData] = useState<Omit<SubscriptionApiData, 'refetch'>>({
    user: null,
    subscription: null,
    quotas: null,
    isLoading: true,
    error: null,
    isFromCache: false,
  })

  // Use ref to avoid recreating interval on every render
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  // Prevent multiple simultaneous refresh attempts
  const isRefreshingRef = useRef(false)

  /**
   * Load cached data from localStorage
   */
  const loadCache = useCallback((): ApiResponse | null => {
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      const expiry = localStorage.getItem(CACHE_EXPIRY_KEY)

      if (!cached || !expiry) return null

      // Check if cache expired
      const expiryTime = parseInt(expiry, 10)
      if (Date.now() > expiryTime) {
        // Cache expired, remove it
        localStorage.removeItem(CACHE_KEY)
        localStorage.removeItem(CACHE_EXPIRY_KEY)
        return null
      }

      return JSON.parse(cached)
    } catch (error) {
      console.error('[SubscriptionAPI] Error loading cache:', error)
      return null
    }
  }, [])

  /**
   * Save data to localStorage cache
   */
  const saveCache = useCallback((apiData: ApiResponse) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(apiData))
      localStorage.setItem(CACHE_EXPIRY_KEY, (Date.now() + CACHE_DURATION).toString())
    } catch (error) {
      console.error('[SubscriptionAPI] Error saving cache:', error)
    }
  }, [])

  /**
   * Fetch subscription data from backend API
   */
  const fetchSubscription = useCallback(async () => {
    // Prevent multiple simultaneous refresh attempts
    if (isRefreshingRef.current) {
      console.warn('[SubscriptionAPI] Already refreshing, skipping...')
      return
    }

    // CRITICAL FIX: Wait for auth to finish loading before checking session
    if (authLoading) {
      console.log('[SubscriptionAPI] Waiting for auth to finish loading...')
      return
    }

    try {
      // If no session, try to use cache
      if (!session?.access_token) {
        console.warn('[SubscriptionAPI] No session token, using cache')
        const cachedData = loadCache()
        if (cachedData) {
          setData({
            user: cachedData.user,
            subscription: cachedData.subscription,
            quotas: cachedData.quotas,
            isLoading: false,
            error: null,
            isFromCache: true,
          })
        } else {
          setData({
            user: null,
            subscription: null,
            quotas: null,
            isLoading: false,
            error: 'Session expirée - veuillez vous reconnecter',
            isFromCache: false,
          })
        }
        return
      }

      // Fetch from backend
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/api/auth/me`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      )

      if (!response.ok) {
        // Handle 401 - Token expired, try refresh (only once)
        if (response.status === 401 && !isRefreshingRef.current) {
          console.warn('[SubscriptionAPI] Token expired (401), trying to refresh...')
          isRefreshingRef.current = true

          try {
            const supabase = createClient()
            const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()

            if (refreshError || !refreshData.session) {
              console.error('[SubscriptionAPI] Session refresh failed:', refreshError)
              throw new Error('Session expirée - veuillez vous reconnecter')
            }

            console.log('[SubscriptionAPI] Session refreshed, retrying...')

            // Retry with new token
            const retryResponse = await fetch(
              `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/api/auth/me`,
              {
                headers: {
                  Authorization: `Bearer ${refreshData.session.access_token}`,
                  'Content-Type': 'application/json',
                },
              }
            )

            if (!retryResponse.ok) {
              throw new Error(`Erreur ${retryResponse.status} après refresh`)
            }

            const retryData: ApiResponse = await retryResponse.json()

            if (!retryData.success) {
              throw new Error(retryData.error || 'Erreur lors du chargement des données')
            }

            // Save to cache and update state
            saveCache(retryData)
            setData({
              user: retryData.user,
              subscription: retryData.subscription,
              quotas: retryData.quotas,
              isLoading: false,
              error: null,
              isFromCache: false,
            })
            return
          } finally {
            isRefreshingRef.current = false
          }
        }

        throw new Error(`Erreur ${response.status}: ${response.statusText}`)
      }

      const apiData: ApiResponse = await response.json()

      if (!apiData.success) {
        throw new Error(apiData.error || 'Erreur lors du chargement des données')
      }

      // Save to cache
      saveCache(apiData)

      // Update state
      setData({
        user: apiData.user,
        subscription: apiData.subscription,
        quotas: apiData.quotas,
        isLoading: false,
        error: null,
        isFromCache: false,
      })
    } catch (error) {
      console.error('[SubscriptionAPI] Fetch error:', error)

      // Try to use cache as fallback
      const cachedData = loadCache()
      if (cachedData) {
        console.warn('[SubscriptionAPI] Using cached data as fallback')
        setData({
          user: cachedData.user,
          subscription: cachedData.subscription,
          quotas: cachedData.quotas,
          isLoading: false,
          error: 'Données en cache (mode hors ligne)',
          isFromCache: true,
        })
      } else {
        setData({
          user: null,
          subscription: null,
          quotas: null,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Erreur inconnue',
          isFromCache: false,
        })
      }
    }
  }, [session?.access_token, authLoading, loadCache, saveCache])

  // Initial fetch and auto-refresh setup
  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) {
      console.log('[SubscriptionAPI] Auth still loading, waiting...')
      return
    }

    // Initial fetch
    fetchSubscription()

    // Setup auto-refresh interval (5 minutes)
    // Only if we have a session
    if (session?.access_token) {
      intervalRef.current = setInterval(() => {
        console.log('[SubscriptionAPI] Auto-refresh triggered')
        fetchSubscription()
      }, REFRESH_INTERVAL)
    }

    // Cleanup interval on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, session ? 'logged-in' : 'logged-out']) // Re-run when auth finishes loading or login state changes

  return {
    ...data,
    refetch: fetchSubscription,
  }
}
