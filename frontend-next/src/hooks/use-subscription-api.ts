"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/auth-context";
import { tokenRefreshService } from "@/lib/auth/token-refresh-service";

const isDev = process.env.NODE_ENV === "development";

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
  status: "active" | "trialing" | "past_due" | "canceled" | string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

interface CoachQuotaData {
  used: number;
  remaining: number;
  has_access: boolean;
}

interface QuotaData {
  limit: number;
  used: number;
  remaining: number;
  percentage: number;
  has_access: boolean;
  reset_at: string;
  by_coach?: Record<string, CoachQuotaData>;
}

interface QuotasData {
  cv_analysis: QuotaData;
  coach: QuotaData;
  job_search: QuotaData;
  assistant_messages: QuotaData;
  job_view?: QuotaData;
  recruiter_search?: QuotaData;
  cv_adapt?: QuotaData;
  cover_letter?: QuotaData;
}

interface SavedJobsQuota {
  used: number;
  limit: number;
}

interface ApiResponse {
  success: boolean;
  user: UserData;
  subscription: SubscriptionData;
  quotas: QuotasData;
  saved_jobs_quota?: SavedJobsQuota;
  feature_overrides: Record<string, boolean>;
  plan_feature_flags: Record<string, boolean>;
  error?: string;
}

interface SubscriptionApiData {
  user: UserData | null;
  subscription: SubscriptionData | null;
  quotas: QuotasData | null;
  saved_jobs_quota: SavedJobsQuota;
  feature_overrides: Record<string, boolean>;
  plan_feature_flags: Record<string, boolean>;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  isFromCache: boolean;
}

const CACHE_KEY = "huntzen_subscription_cache";
// Persistent cache — no TTL expiry.
// Data is saved permanently and used as fallback when API fails.
// Background refresh every 5 min keeps data fresh.
const REFRESH_INTERVAL = 30 * 1000; // 30 seconds — pre-commercialisation, propagation rapide des changements admin

/**
 * Load cached subscription data from localStorage (persistent, no TTL)
 */
function loadPersistentCache(): ApiResponse | null {
  try {
    if (typeof window === "undefined") return null;
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    return JSON.parse(cached);
  } catch {
    return null;
  }
}

/**
 * Save subscription data to localStorage (persistent, no TTL)
 */
function savePersistentCache(data: ApiResponse): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

/**
 * Clear persistent cache (on logout)
 */
function clearPersistentCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // silently ignore
  }
}

/**
 * Hook to fetch subscription data from backend API /api/auth/me
 * - Auto-refreshes every 5 minutes
 * - Uses localStorage cache as fallback
 * - Handles token expiration and errors
 */
export function useSubscriptionApi(): SubscriptionApiData {
  const { session, loading: authLoading } = useAuth();

  // Pre-populate state from persistent cache so users see their last known plan immediately
  const [data, setData] = useState<Omit<SubscriptionApiData, "refetch">>(() => {
    const cached = loadPersistentCache();
    return {
      user: cached?.user ?? null,
      subscription: cached?.subscription ?? null,
      quotas: cached?.quotas ?? null,
      saved_jobs_quota: cached?.saved_jobs_quota ?? { used: 0, limit: -1 },
      feature_overrides: cached?.feature_overrides ?? {},
      plan_feature_flags: cached?.plan_feature_flags ?? {},
      isLoading: !cached, // If cache exists, no loading state
      error: null,
      isFromCache: !!cached,
    };
  });

  // Use ref to avoid recreating interval on every render
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Clear persistent cache on logout
  useEffect(() => {
    if (!session) {
      clearPersistentCache();
    }
  }, [session]);

  /**
   * Fetch subscription data from backend API
   */
  const fetchSubscription = useCallback(async () => {
    // CRITICAL FIX: Wait for auth to finish loading before checking session
    if (authLoading) {
      if (isDev)
        console.log("[SubscriptionAPI] Waiting for auth to finish loading...");
      return;
    }

    try {
      // If session object exists but token is not yet available, stay in loading
      // state — this is a brief race condition during Supabase session hydration.
      if (session && !session.access_token) {
        return;
      }

      // If no session at all, use persistent cache or reset
      if (!session?.access_token) {
        const cachedData = loadPersistentCache();
        if (cachedData) {
          setData({
            user: cachedData.user,
            subscription: cachedData.subscription,
            quotas: cachedData.quotas,
            saved_jobs_quota: cachedData.saved_jobs_quota ?? {
              used: 0,
              limit: -1,
            },
            feature_overrides: cachedData.feature_overrides ?? {},
            plan_feature_flags: cachedData.plan_feature_flags ?? {},
            isLoading: false,
            error: null,
            isFromCache: true,
          });
        } else {
          setData({
            user: null,
            subscription: null,
            quotas: null,
            saved_jobs_quota: { used: 0, limit: -1 },
            feature_overrides: {},
            plan_feature_flags: {},
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
          if (isDev)
            console.warn(
              "[SubscriptionAPI] Token expired (401), getting new token...",
            );

          const newToken = await tokenRefreshService.getValidToken();

          if (!newToken) {
            // Fallback to persistent cache — never drop to "free"
            const cachedData = loadPersistentCache();
            if (cachedData) {
              if (isDev)
                console.warn(
                  "[SubscriptionAPI] Using persistent cache after token refresh failed",
                );
              setData({
                user: cachedData.user,
                subscription: cachedData.subscription,
                quotas: cachedData.quotas,
                saved_jobs_quota: cachedData.saved_jobs_quota ?? {
                  used: 0,
                  limit: -1,
                },
                feature_overrides: cachedData.feature_overrides ?? {},
                plan_feature_flags: cachedData.plan_feature_flags ?? {},
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
              saved_jobs_quota: { used: 0, limit: -1 },
              feature_overrides: {},
              plan_feature_flags: {},
              isLoading: false,
              error: "Session expirée - veuillez vous reconnecter",
              isFromCache: false,
            });
            return;
          }

          if (isDev)
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
              savePersistentCache(retryData);
              setData({
                user: retryData.user,
                subscription: retryData.subscription,
                quotas: retryData.quotas,
                saved_jobs_quota: retryData.saved_jobs_quota ?? {
                  used: 0,
                  limit: -1,
                },
                feature_overrides: retryData.feature_overrides ?? {},
                plan_feature_flags: retryData.plan_feature_flags ?? {},
                isLoading: false,
                error: null,
                isFromCache: false,
              });
              return;
            }
          }
        }

        // Handle 403 - Subscription downgraded or plan changed
        if (response.status === 403) {
          clearPersistentCache();
          window.dispatchEvent(new CustomEvent("subscription-downgraded"));
        }

        throw new Error(`Erreur ${response.status}: ${response.statusText}`);
      }

      const apiData: ApiResponse = await response.json();

      if (!apiData.success) {
        throw new Error(
          apiData.error || "Erreur lors du chargement des données",
        );
      }

      // Save to persistent cache
      savePersistentCache(apiData);

      // Update state
      setData({
        user: apiData.user,
        subscription: apiData.subscription,
        quotas: apiData.quotas,
        saved_jobs_quota: apiData.saved_jobs_quota ?? { used: 0, limit: -1 },
        feature_overrides: apiData.feature_overrides ?? {},
        plan_feature_flags: apiData.plan_feature_flags ?? {},
        isLoading: false,
        error: null,
        isFromCache: false,
      });
    } catch (error) {
      if (isDev) console.error("[SubscriptionAPI] Fetch error:", error);

      // Fallback to persistent cache — never drop to "free" on transient errors
      const cachedData = loadPersistentCache();
      if (cachedData) {
        if (isDev)
          console.warn("[SubscriptionAPI] Using persistent cache as fallback");
        setData({
          user: cachedData.user,
          subscription: cachedData.subscription,
          quotas: cachedData.quotas,
          saved_jobs_quota: cachedData.saved_jobs_quota ?? {
            used: 0,
            limit: -1,
          },
          feature_overrides: cachedData.feature_overrides ?? {},
          plan_feature_flags: cachedData.plan_feature_flags ?? {},
          isLoading: false,
          error: null,
          isFromCache: true,
        });
      } else {
        setData({
          user: null,
          subscription: null,
          quotas: null,
          saved_jobs_quota: { used: 0, limit: -1 },
          feature_overrides: {},
          plan_feature_flags: {},
          isLoading: false,
          error: error instanceof Error ? error.message : "Erreur inconnue",
          isFromCache: false,
        });
      }
    }
  }, [session?.access_token, authLoading]);

  // Initial fetch and auto-refresh setup
  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) {
      if (isDev)
        console.log("[SubscriptionAPI] Auth still loading, waiting...");
      return;
    }

    // Initial fetch
    fetchSubscription();

    // Setup auto-refresh interval (5 minutes)
    // Only if we have a session
    if (session?.access_token) {
      intervalRef.current = setInterval(() => {
        if (isDev) console.log("[SubscriptionAPI] Auto-refresh triggered");
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
      if (isDev)
        console.log("[SubscriptionSync] Subscription changed event detected");
      clearPersistentCache();
      refetchRef.current();
      if (isDev)
        console.log(
          "[SubscriptionSync] Cache invalidated and refetch triggered",
        );
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
