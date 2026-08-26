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
  ats_score: QuotaData;
  matching_score: QuotaData;
  coach: QuotaData;
  job_search: QuotaData;
  assistant_messages: QuotaData;
  job_view?: QuotaData;
  recruiter_search?: QuotaData;
  cv_adapt?: QuotaData;
  cover_letter?: QuotaData;
  saved_jobs?: QuotaData;
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
  refetch: () => Promise<boolean>;
  isFromCache: boolean;
}

const CACHE_KEY_PREFIX = "huntzen_subscription_cache";
const CACHE_TTL_MS = 15 * 60 * 1000;
const REFRESH_INTERVAL = 5 * 60 * 1000;
const REFRESH_JITTER_MS = 30 * 1000;
const VISIBILITY_REFRESH_COOLDOWN_MS = REFRESH_INTERVAL;

interface CachedSubscription {
  userId: string;
  cachedAt: number;
  data: ApiResponse;
}

function getCacheKey(userId: string): string {
  return `${CACHE_KEY_PREFIX}:${userId}`;
}

/**
 * Charge uniquement le cache récent de l'utilisateur courant.
 */
function loadPersistentCache(userId: string | undefined): ApiResponse | null {
  try {
    if (typeof window === "undefined" || !userId) return null;
    const cacheKey = getCacheKey(userId);
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;
    const parsed = JSON.parse(cached) as CachedSubscription;
    const isValid =
      parsed.userId === userId &&
      parsed.data?.user?.id === userId &&
      Date.now() - parsed.cachedAt <= CACHE_TTL_MS;
    if (!isValid) {
      localStorage.removeItem(cacheKey);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

/**
 * Enregistre un cache court et strictement associé à l'utilisateur courant.
 */
function savePersistentCache(userId: string, data: ApiResponse): void {
  try {
    if (data.user?.id !== userId) return;
    const cached: CachedSubscription = {
      userId,
      cachedAt: Date.now(),
      data,
    };
    localStorage.setItem(getCacheKey(userId), JSON.stringify(cached));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

/**
 * Clear persistent cache (on logout)
 */
export function clearSubscriptionCache(userId?: string): void {
  try {
    if (userId) {
      localStorage.removeItem(getCacheKey(userId));
    }
    // Supprime l'ancien cache global pour empêcher toute fuite inter-compte.
    localStorage.removeItem(CACHE_KEY_PREFIX);
    localStorage.removeItem(`${CACHE_KEY_PREFIX}_expiry`);
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
  const userId = session?.user?.id;
  const accessToken = session?.access_token;
  const hasSession = Boolean(session);

  // Initialize with defaults (no localStorage during SSR to avoid hydration #418)
  const [data, setData] = useState<Omit<SubscriptionApiData, "refetch">>({
    user: null,
    subscription: null,
    quotas: null,
    saved_jobs_quota: { used: 0, limit: -1 },
    feature_overrides: {},
    plan_feature_flags: {},
    isLoading: true,
    error: null,
    isFromCache: false,
  });

  // Hydrate from the current user's cache after mount.
  useEffect(() => {
    if (authLoading) return;
    const cached = loadPersistentCache(userId);
    if (cached) {
      setData({
        user: cached.user ?? null,
        subscription: cached.subscription ?? null,
        quotas: cached.quotas ?? null,
        saved_jobs_quota: cached.saved_jobs_quota ?? { used: 0, limit: -1 },
        feature_overrides: cached.feature_overrides ?? {},
        plan_feature_flags: cached.plan_feature_flags ?? {},
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
      isLoading: Boolean(accessToken),
      error: null,
      isFromCache: false,
    });
  }, [accessToken, authLoading, userId]);

  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activeRequestRef = useRef<{
    identityKey: string;
    controller: AbortController;
    promise: Promise<void>;
  } | null>(null);
  const forceDrainRef = useRef<{
    identityKey: string;
    promise: Promise<boolean>;
  } | null>(null);
  const forceGenerationRef = useRef(0);
  const mountedRef = useRef(false);
  const lastFetchSucceededRef = useRef(false);
  const lastFetchStartedAtRef = useRef(0);
  const previousUserIdRef = useRef<string | undefined>(undefined);
  const identityKey = `${userId ?? "anonymous"}:${accessToken ?? "no-token"}`;
  const identityKeyRef = useRef(identityKey);

  useEffect(() => {
    identityKeyRef.current = identityKey;
  }, [identityKey]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRequestRef.current?.controller.abort();
      activeRequestRef.current = null;
    };
  }, []);

  // Invalidate the previous identity's cache on logout/account switch.
  useEffect(() => {
    const previousUserId = previousUserIdRef.current;
    if (previousUserId && previousUserId !== userId) {
      clearSubscriptionCache(previousUserId);
    }
    if (!userId) clearSubscriptionCache();
    previousUserIdRef.current = userId;
  }, [userId]);

  /**
   * Fetch subscription data from backend API
   */
  const performFetch = useCallback(async (signal: AbortSignal) => {
    const commitData: typeof setData = (nextData) => {
      if (!signal.aborted) setData(nextData);
    };

    // CRITICAL FIX: Wait for auth to finish loading before checking session
    if (authLoading) {
      if (isDev)
        console.log("[SubscriptionAPI] Waiting for auth to finish loading...");
      return;
    }

    try {
      // If session object exists but token is not yet available, stay in loading
      // state — this is a brief race condition during Supabase session hydration.
      if (hasSession && !accessToken) {
        return;
      }

      // If no session at all, use persistent cache or reset
      if (!accessToken) {
        const cachedData = loadPersistentCache(userId);
        if (cachedData) {
          commitData({
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
          commitData({
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
      commitData((prev) => ({ ...prev, isLoading: true, error: null }));

      // Same-origin relay avoids browser extensions blocking Railway directly.
      const response = await fetch("/api/auth/me", {
        signal,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        // Handle 401 - Token expired, use centralized refresh service
        if (response.status === 401) {
          if (isDev)
            console.warn(
              "[SubscriptionAPI] Token expired (401), getting new token...",
            );

          const newToken = await tokenRefreshService.getValidToken();
          if (signal.aborted) return;

          if (!newToken) {
            // Fallback to persistent cache — never drop to "free"
            const cachedData = loadPersistentCache(userId);
            if (cachedData) {
              if (isDev)
                console.warn(
                  "[SubscriptionAPI] Using persistent cache after token refresh failed",
                );
              commitData({
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

            commitData({
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
          const retryResponse = await fetch("/api/auth/me", {
            signal,
            headers: {
              Authorization: `Bearer ${newToken}`,
              "Content-Type": "application/json",
            },
          });

          if (retryResponse.ok) {
            const retryData: ApiResponse = await retryResponse.json();
            if (signal.aborted) return;

            if (retryData.success) {
              lastFetchSucceededRef.current = true;
              if (userId) savePersistentCache(userId, retryData);
              commitData({
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
          clearSubscriptionCache(userId);
          window.dispatchEvent(new CustomEvent("subscription-downgraded"));
        }

        throw new Error(`Erreur ${response.status}: ${response.statusText}`);
      }

      const apiData: ApiResponse = await response.json();
      if (signal.aborted) return;

      if (!apiData.success) {
        throw new Error(
          apiData.error || "Erreur lors du chargement des données",
        );
      }

      lastFetchSucceededRef.current = true;
      // Save to persistent cache
      if (userId) savePersistentCache(userId, apiData);

      // Update state
      commitData({
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
      if (signal.aborted) return;
      if (isDev) console.error("[SubscriptionAPI] Fetch error:", error);

      // Fallback to persistent cache — never drop to "free" on transient errors
      const cachedData = loadPersistentCache(userId);
      if (cachedData) {
        if (isDev)
          console.warn("[SubscriptionAPI] Using persistent cache as fallback");
        commitData({
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
        commitData({
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
  }, [accessToken, authLoading, hasSession, userId]);

  const startFetch = useCallback((): Promise<void> => {
    lastFetchStartedAtRef.current = Date.now();
    lastFetchSucceededRef.current = false;
    const controller = new AbortController();
    const request = performFetch(controller.signal);
    const activeRequest = { identityKey, controller, promise: request };
    activeRequestRef.current = activeRequest;
    void request.then(
      () => {
        if (activeRequestRef.current === activeRequest) {
          activeRequestRef.current = null;
        }
      },
      () => {
        if (activeRequestRef.current === activeRequest) {
          activeRequestRef.current = null;
        }
      },
    );
    return request;
  }, [identityKey, performFetch]);

  const refreshSubscription = useCallback((): Promise<void> => {
    const activeRequest = activeRequestRef.current;
    if (!activeRequest) return startFetch();
    if (activeRequest.identityKey === identityKey) {
      return activeRequest.promise;
    }
    activeRequest.controller.abort();
    activeRequestRef.current = null;
    return startFetch();
  }, [identityKey, startFetch]);

  const forceRefetch = useCallback((): Promise<boolean> => {
    forceGenerationRef.current += 1;
    if (!mountedRef.current) return Promise.resolve(false);

    const existingDrain = forceDrainRef.current;
    if (existingDrain?.identityKey === identityKey) {
      return existingDrain.promise;
    }

    const drainPromise = (async () => {
      while (
        mountedRef.current &&
        identityKeyRef.current === identityKey
      ) {
        const targetGeneration = forceGenerationRef.current;
        const activeRequest = activeRequestRef.current;
        if (activeRequest?.identityKey === identityKey) {
          await activeRequest.promise;
        } else if (activeRequest) {
          activeRequest.controller.abort();
          activeRequestRef.current = null;
        }

        if (
          !mountedRef.current ||
          identityKeyRef.current !== identityKey
        ) {
          return false;
        }

        await startFetch();
        if (forceGenerationRef.current === targetGeneration) {
          return lastFetchSucceededRef.current;
        }
      }
      return false;
    })();
    const drain = { identityKey, promise: drainPromise };
    forceDrainRef.current = drain;
    void drainPromise.then(
      () => {
        if (forceDrainRef.current === drain) forceDrainRef.current = null;
      },
      () => {
        if (forceDrainRef.current === drain) forceDrainRef.current = null;
      },
    );
    return drainPromise;
  }, [identityKey, startFetch]);

  // Initial fetch and auto-refresh setup
  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) {
      if (isDev)
        console.log("[SubscriptionAPI] Auth still loading, waiting...");
      return;
    }

    // Initial fetch
    void refreshSubscription();

    const refreshIfStale = () => {
      if (document.visibilityState !== "visible") return;
      if (
        Date.now() - lastFetchStartedAtRef.current <
        VISIBILITY_REFRESH_COOLDOWN_MS
      ) {
        return;
      }
      void refreshSubscription();
    };

    const scheduleRefresh = () => {
      const delay =
        REFRESH_INTERVAL + Math.floor(Math.random() * REFRESH_JITTER_MS);
      refreshTimerRef.current = setTimeout(() => {
        refreshIfStale();
        scheduleRefresh();
      }, delay);
    };

    if (accessToken) {
      scheduleRefresh();
      document.addEventListener("visibilitychange", refreshIfStale);
      window.addEventListener("focus", refreshIfStale);
    }

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      document.removeEventListener("visibilitychange", refreshIfStale);
      window.removeEventListener("focus", refreshIfStale);
      const activeRequest = activeRequestRef.current;
      if (activeRequest?.identityKey === identityKey) {
        activeRequest.controller.abort();
        activeRequestRef.current = null;
      }
    };
  }, [
    authLoading,
    accessToken,
    identityKey,
    refreshSubscription,
  ]);

  useEffect(() => {
    const handleSubscriptionChange = () => {
      clearSubscriptionCache(userId);
      void forceRefetch();
    };
    window.addEventListener("subscription-changed", handleSubscriptionChange);
    return () => {
      window.removeEventListener(
        "subscription-changed",
        handleSubscriptionChange,
      );
    };
  }, [forceRefetch, userId]);

  return {
    ...data,
    refetch: forceRefetch,
  };
}
