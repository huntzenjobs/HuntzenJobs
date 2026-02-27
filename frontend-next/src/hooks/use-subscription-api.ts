"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/auth-context";
import { tokenRefreshService } from "@/lib/auth/token-refresh-service";

// Types from backend API response
interface UserData {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string | null;
}

interface SubscriptionData {
  plan_name: "free" | "starter" | "pro" | "premium";
  plan_display_name: string;
  price_monthly: number;
  status: string;
  current_period_end: string | null;
}

interface QuotaData {
  limit: number;
  used: number;
  remaining: number;
  percentage: number;
  has_access: boolean;
  reset_at: string;
}

interface QuotasData {
  cv_analysis: QuotaData;
  coach: QuotaData;
  job_search: QuotaData;
}

interface ApiResponse {
  success: boolean;
  user: UserData;
  subscription: SubscriptionData;
  quotas: QuotasData;
  error?: string;
}

interface SubscriptionApiData {
  user: UserData | null;
  subscription: SubscriptionData | null;
  quotas: QuotasData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  isFromCache: boolean;
}

const CACHE_KEY = "huntzen_subscription_cache";
const CACHE_EXPIRY_KEY = "huntzen_subscription_cache_expiry";
// Cache TTL: 5 min fallback (était 24h)
// Invalidation principale = événements (webhooks, actions utilisateur)
// TTL 5 min = filet de sécurité si événements ratés
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes (FALLBACK)
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * Hook to fetch subscription data from backend API /api/auth/me
 * - Auto-refreshes every 5 minutes
 * - Uses localStorage cache as fallback
 * - Handles token expiration and errors
 */
export function useSubscriptionApi(): SubscriptionApiData {
  const { session, loading: authLoading } = useAuth();
  const [data, setData] = useState<Omit<SubscriptionApiData, "refetch">>({
    user: null,
    subscription: null,
    quotas: null,
    isLoading: true,
    error: null,
    isFromCache: false,
  });

  // Use ref to avoid recreating interval on every render
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Load cached data from localStorage
   */
  const loadCache = useCallback((): ApiResponse | null => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      const expiry = localStorage.getItem(CACHE_EXPIRY_KEY);

      if (!cached || !expiry) return null;

      // Check if cache expired
      const expiryTime = parseInt(expiry, 10);
      if (Date.now() > expiryTime) {
        // Cache expired, remove it
        localStorage.removeItem(CACHE_KEY);
        localStorage.removeItem(CACHE_EXPIRY_KEY);
        return null;
      }

      return JSON.parse(cached);
    } catch (error) {
      console.error("[SubscriptionAPI] Error loading cache:", error);
      return null;
    }
  }, []);

  /**
   * Save data to localStorage cache
   */
  const saveCache = useCallback((apiData: ApiResponse) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(apiData));
      localStorage.setItem(
        CACHE_EXPIRY_KEY,
        (Date.now() + CACHE_DURATION).toString(),
      );
    } catch (error) {
      console.error("[SubscriptionAPI] Error saving cache:", error);
    }
  }, []);

  /**
   * Fetch subscription data from backend API
   */
  const fetchSubscription = useCallback(async () => {
    // CRITICAL FIX: Wait for auth to finish loading before checking session
    if (authLoading) {
      console.log("[SubscriptionAPI] Waiting for auth to finish loading...");
      return;
    }

    try {
      // If session object exists but token is not yet available, stay in loading
      // state — this is a brief race condition during Supabase session hydration.
      if (session && !session.access_token) {
        return;
      }

      // If no session at all, try to use cache
      if (!session?.access_token) {
        const cachedData = loadCache();
        if (cachedData) {
          setData({
            user: cachedData.user,
            subscription: cachedData.subscription,
            quotas: cachedData.quotas,
            isLoading: false,
            error: null,
            isFromCache: true,
          });
        } else {
          setData({
            user: null,
            subscription: null,
            quotas: null,
            isLoading: false,
            error: null,
            isFromCache: false,
          });
        }
        return;
      }

      // Signal loading immediately — prevents race condition where
      // auth.session is set but isLoading is still false from previous state
      setData((prev) => ({ ...prev, isLoading: true, error: null }));

      // Fetch from backend
      if (!process.env.NEXT_PUBLIC_BACKEND_URL) {
        throw new Error("NEXT_PUBLIC_BACKEND_URL is not configured");
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/me`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        // Handle 401 - Token expired, use centralized refresh service
        if (response.status === 401) {
          console.warn(
            "[SubscriptionAPI] Token expired (401), getting new token...",
          );

          const newToken = await tokenRefreshService.getValidToken();

          if (!newToken) {
            // Fallback to cache if available
            const cachedData = loadCache();
            if (cachedData) {
              console.warn(
                "[SubscriptionAPI] Using cached data as fallback after token refresh failed",
              );
              setData({
                user: cachedData.user,
                subscription: cachedData.subscription,
                quotas: cachedData.quotas,
                isLoading: false,
                error: null,
                isFromCache: true,
              });
              return;
            }

            setData({
              user: null,
              subscription: null,
              quotas: null,
              isLoading: false,
              error: "Session expirée - veuillez vous reconnecter",
              isFromCache: false,
            });
            return;
          }

          console.log("[SubscriptionAPI] Got new token, retrying request...");

          // Retry with new token
          const retryResponse = await fetch(
            `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/me`,
            {
              headers: {
                Authorization: `Bearer ${newToken}`,
                "Content-Type": "application/json",
              },
            },
          );

          if (retryResponse.ok) {
            const retryData: ApiResponse = await retryResponse.json();

            if (retryData.success) {
              saveCache(retryData);
              setData({
                user: retryData.user,
                subscription: retryData.subscription,
                quotas: retryData.quotas,
                isLoading: false,
                error: null,
                isFromCache: false,
              });
              return;
            }
          }
        }

        throw new Error(`Erreur ${response.status}: ${response.statusText}`);
      }

      const apiData: ApiResponse = await response.json();

      if (!apiData.success) {
        throw new Error(
          apiData.error || "Erreur lors du chargement des données",
        );
      }

      // Save to cache
      saveCache(apiData);

      // Update state
      setData({
        user: apiData.user,
        subscription: apiData.subscription,
        quotas: apiData.quotas,
        isLoading: false,
        error: null,
        isFromCache: false,
      });
    } catch (error) {
      console.error("[SubscriptionAPI] Fetch error:", error);

      // Try to use cache as fallback
      const cachedData = loadCache();
      if (cachedData) {
        console.warn("[SubscriptionAPI] Using cached data as fallback");
        setData({
          user: cachedData.user,
          subscription: cachedData.subscription,
          quotas: cachedData.quotas,
          isLoading: false,
          error: "Données en cache (mode hors ligne)",
          isFromCache: true,
        });
      } else {
        setData({
          user: null,
          subscription: null,
          quotas: null,
          isLoading: false,
          error: error instanceof Error ? error.message : "Erreur inconnue",
          isFromCache: false,
        });
      }
    }
  }, [session?.access_token, authLoading, loadCache, saveCache]);

  // Initial fetch and auto-refresh setup
  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) {
      console.log("[SubscriptionAPI] Auth still loading, waiting...");
      return;
    }

    // Initial fetch
    fetchSubscription();

    // Setup auto-refresh interval (5 minutes)
    // Only if we have a session
    if (session?.access_token) {
      intervalRef.current = setInterval(() => {
        console.log("[SubscriptionAPI] Auto-refresh triggered");
        fetchSubscription();
      }, REFRESH_INTERVAL);
    }

    // Cleanup interval on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authLoading,
    session ? "logged-in" : "logged-out",
    !!session?.access_token,
  ]); // Re-run when token becomes available after hydration

  return {
    ...data,
    refetch: fetchSubscription,
  };
}

/**
 * Hook to invalidate cache on subscription changes (event-based)
 *
 * Listens for custom 'subscription-changed' events and immediately
 * invalidates the cache + refetches fresh data.
 *
 * This ensures users see their new subscription immediately after
 * Stripe checkout success, without waiting for cache TTL.
 *
 * Usage:
 * ```tsx
 * const { invalidateCache } = useSubscriptionSync()
 * // Cache is automatically invalidated on 'subscription-changed' events
 * ```
 */
export function useSubscriptionSync() {
  const { refetch } = useSubscriptionApi();

  // Keep ref always up-to-date so the listener can call the latest refetch
  // without needing to re-register itself every time refetch changes
  const refetchRef = useRef<() => Promise<void>>(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  });

  // Register listener ONCE — never re-registers even if refetch changes
  useEffect(() => {
    const handleSubscriptionChange = () => {
      console.log("[SubscriptionSync] Subscription changed event detected");
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(CACHE_EXPIRY_KEY);
      refetchRef.current();
      console.log("[SubscriptionSync] Cache invalidated and refetch triggered");
    };

    window.addEventListener("subscription-changed", handleSubscriptionChange);

    return () => {
      window.removeEventListener(
        "subscription-changed",
        handleSubscriptionChange,
      );
    };
  }, []); // empty deps — registers exactly once on mount

  return {
    invalidateCache: refetch,
  };
}
