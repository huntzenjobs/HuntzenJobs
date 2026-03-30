"use client";

import { SubscriptionChangedModal } from "@/components/freemium/subscription-changed-modal";
import { useOptionalAssistant } from "@/contexts/assistant-context";
import { useOptionalAuth } from "@/contexts/auth-context";
import {
  FeatureType,
  PLAN_LIMITS,
  PlanType,
  useFreemiumLimits,
} from "@/hooks/use-freemium-limits";
import { useSubscriptionApi } from "@/hooks/use-subscription-api";
import { useTranslations } from "next-intl";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

type PlanLimits = (typeof PLAN_LIMITS)[PlanType];

interface SubscriptionContextType {
  // Plan info
  plan: PlanType;
  planName: string;
  isFreePlan: boolean;
  isPaidPlan: boolean;

  // Usage tracking
  canUse: (feature: FeatureType) => boolean;
  getRemaining: (feature: FeatureType) => number;
  incrementUsage: (feature: FeatureType, amount?: number) => void;
  usage: {
    searchesToday: number;
    jobsViewedToday: number;
    atsScoresUsedToday: number;
    matchingScoresUsedToday: number;
    assistantMessagesUsedToday: number;
    savedJobsCount: number;
    cvAdaptsUsedToday: number;
    coverLettersUsedToday: number;
    recruiterSearchesUsedToday: number;
    lastResetDate: string;
  };

  // Feature access
  hasFeature: (feature: keyof PlanLimits) => boolean;
  getRequiredPlan: (feature: keyof PlanLimits) => PlanType;

  // Assistant message quota
  assistantMessagesRemaining: number;
  assistantMessagesLimit: number;

  // Saved jobs quota (total, not daily)
  savedJobsUsed: number;
  savedJobsLimit: number;

  // Limits
  limits: PlanLimits;

  // Raw API quotas (for features not in PlanLimits)
  quotas: Record<string, any> | null;

  // Actions
  setPlan: (plan: PlanType, expiresAt?: string) => void;

  // Loading state
  isLoaded: boolean;

  // Modal control
  showPricingModal: boolean;
  openPricingModal: (feature?: string) => void;
  closePricingModal: () => void;
  pricingModalFeature: string | null;

  // Subscription sync
  reconcileSubscription: () => Promise<void>;
  // Silent refresh (no toast) — use when opening usage modal
  refreshQuotas: () => Promise<void>;
  // Clear local optimistic state for a feature
  resetUsage: (feature: FeatureType) => void;
}

const SubscriptionContext = createContext<SubscriptionContextType | null>(null);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("subscription");

  // Get auth session for inconsistency detection
  const auth = useOptionalAuth();

  // Get currently selected assistant for per-coach quota checks
  const assistantCtx = useOptionalAssistant();

  // NEW: Fetch subscription data from backend API
  const apiData = useSubscriptionApi();
  const userId = auth?.user?.id;

  // KEEP: Local state for setPlan() and coach session until Stripe integration
  // Scoped by userId to prevent cross-user quota leakage
  const freemium = useFreemiumLimits(auth?.user?.id);

  const [showPricingModal, setShowPricingModal] = useState(false);
  const [pricingModalFeature, setPricingModalFeature] = useState<string | null>(
    null,
  );
  const [hasShownInconsistencyWarning, setHasShownInconsistencyWarning] =
    useState(false);
  const [showPlanChangedModal, setShowPlanChangedModal] = useState(false);

  // Stable ref for refetch — prevents re-triggering inconsistency check when refetch changes reference
  const apiRefetchRef = useRef<(() => Promise<void>) | undefined>(undefined);
  useEffect(() => {
    apiRefetchRef.current = apiData.refetch;
  });

  const openPricingModal = useCallback((feature?: string) => {
    setPricingModalFeature(feature || null);
    setShowPricingModal(true);
  }, []);

  const closePricingModal = useCallback((open?: boolean) => {
    // Si un paramètre est fourni (par le Dialog onOpenChange), on l'utilise
    // Sinon on ferme par défaut
    setShowPricingModal(open ?? false);
    if (open === false || open === undefined) {
      setPricingModalFeature(null);
    }
  }, []);

  // Manual reconciliation function (for debugging or user-triggered sync)
  const reconcileSubscription = useCallback(async () => {
    // Clear local cache
    try {
      localStorage.removeItem("huntzen_subscription_cache");
      localStorage.removeItem("huntzen_subscription_cache_expiry");
    } catch (error) {
      console.error("[SUBSCRIPTION] Failed to clear cache:", error);
    }

    // Force refetch from API
    if (apiData.refetch) {
      await apiData.refetch();
      toast.success(t("toasts.synced"), {
        description: t("toasts.syncedDesc"),
      });
    } else {
      toast.error(t("toasts.syncFailed"), {
        description: t("toasts.syncFailedDesc"),
      });
    }

    // Reset warning flag
    setHasShownInconsistencyWarning(false);
  }, [apiData.refetch]);

  // Map API data to interface (distinguish loading/error/no-subscription states)
  const plan: PlanType = (() => {
    // 1. API data available (fresh fetch OR persistent cache loaded) → source of truth
    if (apiData.subscription?.plan_name) {
      return apiData.subscription.plan_name;
    }

    // 2. No session → visitor not logged in → free is legitimate
    if (!auth?.session) return "free";

    // 3. Authenticated, API loading, no data yet → new user → "free"
    if (apiData.isLoading) return "free";

    // 4. API error → use freemium state (localStorage usage tracking)
    if (apiData.error) return freemium.plan;

    // 5. API responded but no subscription data → free user
    return "free";
  })();
  // plan_display_name vient directement de /api/auth/me (champ subscription)
  const planName = apiData.subscription?.plan_display_name || plan;

  // Detect inconsistency: user authenticated but no subscription data from API
  useEffect(() => {
    const isAuthenticated =
      auth?.session !== null && auth?.session !== undefined;
    const hasSubscriptionData =
      apiData.subscription !== null && apiData.subscription !== undefined;
    const isApiLoading = apiData.isLoading;
    const isApiError = apiData.error !== null;

    // Only check when:
    // - User is authenticated
    // - API has finished loading
    // - No subscription data received from API
    // - Haven't already shown warning this session
    if (
      isAuthenticated &&
      !isApiLoading &&
      !hasSubscriptionData &&
      !hasShownInconsistencyWarning
    ) {
      console.warn(
        "[SUBSCRIPTION] Inconsistency detected: authenticated but no subscription data from API",
        {
          hasSession: !!auth?.session,
          apiSubscription: apiData.subscription,
          fallbackPlan: freemium.plan,
          apiError: apiData.error,
        },
      );

      setHasShownInconsistencyWarning(true);

      // Auto-refetch after 5 seconds if not an error
      if (!isApiError) {
        setTimeout(() => {
          apiRefetchRef.current?.();
        }, 5000);
      }
    }

    // Reset warning flag when subscription data is successfully loaded
    if (hasSubscriptionData && hasShownInconsistencyWarning) {
      setHasShownInconsistencyWarning(false);
    }
  }, [
    auth?.session,
    apiData.subscription,
    apiData.isLoading,
    apiData.error,
    hasShownInconsistencyWarning,
    freemium.plan,
    // apiData.refetch intentionally omitted — accessed via apiRefetchRef to prevent
    // this effect from re-running when refetch changes reference
  ]);

  // Listen for token-expired event and show reconnect toast
  useEffect(() => {
    const handleTokenExpired = () => {
      toast.error(t("toasts.sessionExpired"), {
        description: t("toasts.sessionExpiredDesc"),
        action: {
          label: t("toasts.sessionExpiredAction"),
          onClick: () => (window.location.href = "/login"),
        },
        duration: 10000,
      });
    };

    window.addEventListener("token-expired", handleTokenExpired);
    return () =>
      window.removeEventListener("token-expired", handleTokenExpired);
  }, []);

  // Sync local state with API quotas
  // Handles resets (administrative/daily) and "catch-up" scenarios
  useEffect(() => {
    if (!apiData.quotas) return;

    const trackedFeatures: FeatureType[] = [
      "job_search",
      "ats_score",
      "matching_score",
      "assistant_messages",
      "saved_jobs",
      "cv_adapt",
      "cover_letter",
      "recruiter_search",
    ];

    trackedFeatures.forEach((feature) => {
      let q = (apiData.quotas as any)[feature];
      if (!q) return;

      // Find local usage value
      let localUsed = 0;
      switch (feature) {
        case "job_search":
          localUsed = freemium.usage.searchesToday;
          break;
        case "saved_jobs":
          localUsed = freemium.usage.savedJobsCount;
          break;
        case "ats_score":
          localUsed = freemium.usage.atsScoresUsedToday;
          break;
        case "matching_score":
          localUsed = freemium.usage.matchingScoresUsedToday;
          break;
        case "assistant_messages":
          localUsed = freemium.usage.assistantMessagesUsedToday;
          break;
        case "cv_adapt":
          localUsed = freemium.usage.cvAdaptsUsedToday;
          break;
        case "cover_letter":
          localUsed = freemium.usage.coverLettersUsedToday;
          break;
        case "recruiter_search":
          localUsed = freemium.usage.recruiterSearchesUsedToday;
          break;
      }

      if (q.used === 0 && localUsed > 0) {
        // API shows reset, but we have local usage
        // Check if we JUST incremented this locally (short protection window)
        const lastIncrement =
          freemium.usage.lastIncrementTimestamps?.[feature] || 0;
        const timeSinceIncrement = Date.now() - lastIncrement;

        // Use a small window (5 seconds) to avoid fighting with in-flight requests,
        // but allow admin/daily resets to propagate quickly.
        if (timeSinceIncrement > 5000) {
          console.log(
            `[SUBSCRIPTION] Sync: Resetting local usage for ${feature} (API is 0 and no recent local increment)`,
          );
          freemium.resetUsage(feature);
        }
      } else if (q.used !== localUsed) {
        // API differs from local state (usually we sync UP, but we must also heal DOWN)
        // Check if we JUST incremented this locally (5 seconds protection window for in-flight requests)
        const lastIncrement =
          freemium.usage.lastIncrementTimestamps?.[feature] || 0;
        const timeSinceIncrement = Date.now() - lastIncrement;

        if (timeSinceIncrement > 5000 || q.used > localUsed) {
          // Sync local state down if bugged, up if API is ahead
          console.log(
            `[SUBSCRIPTION] Sync: Correcting local usage for ${feature} from API (${localUsed} -> ${q.used})`,
          );
          freemium.syncUsage(feature, q.used);
        }
      }
    });
  }, [apiData.quotas, freemium.usage]);

  // Listen for subscription-downgraded event (403 interceptor)
  useEffect(() => {
    const handler = () => {
      setShowPlanChangedModal(true);
      apiData.refetch();
    };
    window.addEventListener("subscription-downgraded", handler);
    return () => window.removeEventListener("subscription-downgraded", handler);
  }, [apiData.refetch]);

  // Build limits from API quotas (source of truth)
  const limitsFromApi: PlanLimits = useMemo(() => {
    if (!apiData.quotas) {
      // Fallback to hardcoded limits if API data not available
      return PLAN_LIMITS[plan];
    }

    // Get base plan limits for feature flags
    const baseLimits = PLAN_LIMITS[plan];

    // Override numeric limits from API, keep feature flags from PLAN_LIMITS
    return {
      ...baseLimits,
      // Override with API data if available, otherwise use hardcoded defaults
      job_searches_per_day:
        apiData.quotas.job_search?.limit === -1
          ? Infinity
          : (apiData.quotas.job_search?.limit ??
            baseLimits.job_searches_per_day),
      ats_scores_per_day:
        apiData.quotas.ats_score?.limit === -1
          ? Infinity
          : (apiData.quotas.ats_score?.limit ?? baseLimits.ats_scores_per_day),
      matching_scores_per_day:
        apiData.quotas.matching_score?.limit === -1
          ? Infinity
          : (apiData.quotas.matching_score?.limit ??
            baseLimits.matching_scores_per_day),
      saved_jobs_per_day:
        apiData.quotas.saved_jobs?.limit === -1
          ? Infinity
          : (apiData.quotas.saved_jobs?.limit ?? baseLimits.saved_jobs_per_day),
      assistant_messages_per_day:
        apiData.quotas.assistant_messages?.limit === -1
          ? Infinity
          : (apiData.quotas.assistant_messages?.limit ??
            baseLimits.assistant_messages_per_day),
      recruiter_searches_per_day:
        apiData.quotas.recruiter_search?.limit === -1
          ? Infinity
          : (apiData.quotas.recruiter_search?.limit ??
            baseLimits.recruiter_searches_per_day),
      cv_adapt_per_day:
        apiData.quotas.cv_adapt?.limit === -1
          ? Infinity
          : (apiData.quotas.cv_adapt?.limit ?? baseLimits.cv_adapt_per_day),
      cover_letter_per_day:
        apiData.quotas.cover_letter?.limit === -1
          ? Infinity
          : (apiData.quotas.cover_letter?.limit ??
            baseLimits.cover_letter_per_day),
    } as PlanLimits;
  }, [apiData.quotas, plan]);

  // Build unified usage (combines API source of truth with local optimistic updates)
  const usageFromApi = useMemo(
    () => ({
      // Use the higher value between API and local for EACH feature to ensure conservative tracking
      searchesToday: Math.max(
        apiData.quotas?.job_search?.used ?? 0,
        freemium.usage.searchesToday,
      ),
      atsScoresUsedToday: Math.max(
        apiData.quotas?.ats_score?.used ?? 0,
        freemium.usage.atsScoresUsedToday,
      ),
      matchingScoresUsedToday: Math.max(
        apiData.quotas?.matching_score?.used ?? 0,
        freemium.usage.matchingScoresUsedToday,
      ),
      assistantMessagesUsedToday: Math.max(
        apiData.quotas?.assistant_messages?.used ?? 0,
        freemium.usage.assistantMessagesUsedToday,
      ),
      savedJobsCount: Math.max(
        apiData.quotas?.saved_jobs?.used ?? apiData.saved_jobs_quota?.used ?? 0,
        freemium.usage.savedJobsCount,
      ),
      cvAdaptsUsedToday: Math.max(
        apiData.quotas?.cv_adapt?.used ?? 0,
        freemium.usage.cvAdaptsUsedToday,
      ),
      coverLettersUsedToday: Math.max(
        apiData.quotas?.cover_letter?.used ?? 0,
        freemium.usage.coverLettersUsedToday,
      ),
      recruiterSearchesUsedToday: Math.max(
        apiData.quotas?.recruiter_search?.used ?? 0,
        freemium.usage.recruiterSearchesUsedToday,
      ),
      jobsViewedToday:
        apiData.quotas?.job_view?.used ?? freemium.usage.jobsViewedToday,
      lastResetDate:
        apiData.quotas?.ats_score?.reset_at ?? freemium.usage.lastResetDate,
    }),
    [apiData.quotas, freemium.usage],
  );

  // canUse helper: Check if user can use a feature based on API quotas + local state
  const canUse = useCallback(
    (feature: FeatureType): boolean => {
      // 1. Check local optimistic state (fast path for guest/offline)
      const localCanUse = freemium.canUse(feature);

      // 2. If no API data yet, rely on local state
      if (!apiData.quotas) {
        return localCanUse;
      }

      // 3. Extract API access flag
      const q = apiData.quotas[feature as keyof typeof apiData.quotas];
      const apiCanUse = q ? (q as any).has_access : localCanUse;

      // 4. IMPORTANT: If user is authenticated and API says YES, trust it.
      // This allows custom_limits (set in DB) to override local plan defaults.
      if (userId && apiCanUse) return true;

      // 5. If API says NO and used > 0, trust API (exhausted).
      // (Exception: if used is 0, it might be a refresh delay, so we check local too)
      if (userId && !apiCanUse && q && q.used > 0) return false;

      // 6. Default to conservative (both must agree)
      return apiCanUse && localCanUse;
    },
    [apiData.quotas, freemium, userId],
  );

  // getRemaining helper: Get remaining quota based on API data for ALL features
  const getRemaining = useCallback(
    (feature: FeatureType): number => {
      const localRemaining = freemium.getRemaining(feature);
      if (!apiData.quotas) return localRemaining;

      // Per-coach remaining for assistant_messages
      if (
        feature === "assistant_messages" &&
        apiData.quotas.assistant_messages?.by_coach
      ) {
        const selectedCoach = assistantCtx?.selectedAssistant ?? "career-coach";
        const coachQuota =
          apiData.quotas.assistant_messages.by_coach[selectedCoach];
        if (coachQuota) {
          return coachQuota.remaining === -1 ? Infinity : coachQuota.remaining;
        }
      }

      // Special case: saved_jobs (prefer the most aggressive used count)
      if (feature === "saved_jobs") {
        const apiUsed =
          apiData.quotas?.saved_jobs?.used ??
          apiData.saved_jobs_quota?.used ??
          0;
        const localUsed = freemium.usage.savedJobsCount;
        const mostUsed = Math.max(apiUsed, localUsed);

        const limit =
          apiData.saved_jobs_quota?.limit ??
          PLAN_LIMITS[plan].saved_jobs_per_day;
        if (limit === Infinity || limit === -1) return Infinity;
        return Math.max(0, limit - mostUsed);
      }

      // Generic lookup for all other quota-tracked features
      const quotaData = apiData.quotas[feature as keyof typeof apiData.quotas];
      if (!quotaData) return localRemaining;

      // Calculate remaining based on API limit minus unified usage
      const limit = (quotaData as any).limit;
      if (limit === -1 || limit === Infinity) return Infinity;

      // Use usageFromApi which already incorporates Math.max(api, local)
      const used =
        (usageFromApi as any)[
          feature === "job_search"
            ? "searchesToday"
            : feature === "ats_score"
              ? "atsScoresUsedToday"
              : feature === "matching_score"
                ? "matchingScoresUsedToday"
                : feature === "cv_adapt"
                  ? "cvAdaptsUsedToday"
                  : feature === "cover_letter"
                    ? "coverLettersUsedToday"
                    : feature === "assistant_messages"
                      ? "assistantMessagesUsedToday"
                      : feature === "recruiter_search"
                        ? "recruiterSearchesUsedToday"
                        : "searchesToday" // fallback
        ] ?? quotaData.used;

      return Math.max(0, limit - used);
    },
    [apiData.quotas, freemium, assistantCtx?.selectedAssistant],
  );

  // Refs to keep incrementUsage stable across renders (prevents downstream effect re-runs)
  const freemiumRef = useRef(freemium);
  const apiDataRef = useRef(apiData);
  useEffect(() => {
    freemiumRef.current = freemium;
    apiDataRef.current = apiData;
  }, [freemium, apiData]);

  // incrementUsage: Stable reference to prevent billing loops in components
  const incrementUsage = useCallback(
    (feature: FeatureType, amount?: number) => {
      // Optimistic local update for immediate UI feedback
      freemiumRef.current.incrementUsage(feature, amount);
      // Direct refetch (no delay) to sync with backend
      apiDataRef.current.refetch();
    },
    [], // Stable dependency array
  );

  // hasFeature: Check feature availability — admin overrides take priority over plan
  const hasFeature = useCallback(
    (feature: keyof PlanLimits): boolean => {
      // Admin feature override takes absolute priority
      const overrides = apiData.feature_overrides ?? {};
      if (feature in overrides) return overrides[feature as string];

      // Feature flags dynamiques depuis la DB (via /api/auth/me → plan_feature_flags)
      const planFlags = apiData.plan_feature_flags ?? {};
      if (feature in planFlags) return !!planFlags[feature as string];

      // Fallback PLAN_LIMITS si plan_feature_flags absent (API indisponible)
      const currentPlan = apiData.subscription?.plan_name || freemium.plan;
      const limits = PLAN_LIMITS[currentPlan];
      return !!limits[feature];
    },
    [
      apiData.subscription?.plan_name,
      apiData.feature_overrides,
      apiData.plan_feature_flags,
      freemium.plan,
    ],
  );

  // Computed assistant message quota values
  const assistantMessagesRemaining = useMemo((): number => {
    if (!apiData.quotas?.assistant_messages) {
      const limit = PLAN_LIMITS[plan].assistant_messages_per_day;
      return limit === Infinity ? Infinity : (limit as number);
    }
    const q = apiData.quotas.assistant_messages;
    return q.remaining === -1 ? Infinity : q.remaining;
  }, [apiData.quotas, plan]);

  const assistantMessagesLimit = useMemo((): number => {
    if (!apiData.quotas?.assistant_messages) {
      const limit = PLAN_LIMITS[plan].assistant_messages_per_day;
      return limit === Infinity ? Infinity : (limit as number);
    }
    const q = apiData.quotas.assistant_messages;
    return q.limit === -1 ? Infinity : q.limit;
  }, [apiData.quotas, plan]);

  // useMemo with ONLY primitive dependencies that actually change
  const value: SubscriptionContextType = useMemo(
    () => ({
      plan,
      planName,
      isFreePlan: plan === "free",
      isPaidPlan: plan !== "free",

      canUse,
      getRemaining,
      incrementUsage,
      usage: usageFromApi,

      hasFeature,
      getRequiredPlan: freemium.getRequiredPlan,

      assistantMessagesRemaining,
      assistantMessagesLimit,

      savedJobsUsed: Math.max(
        apiData.quotas?.saved_jobs?.used ?? apiData.saved_jobs_quota?.used ?? 0,
        freemium.usage.savedJobsCount,
      ),
      savedJobsLimit: apiData.saved_jobs_quota?.limit ?? -1,

      limits: limitsFromApi,

      quotas: apiData.quotas ?? null,

      setPlan: freemium.setPlan, // KEEP local until Stripe integration

      isLoaded: !apiData.isLoading && freemium.isLoaded,

      showPricingModal,
      openPricingModal,
      closePricingModal,
      pricingModalFeature,

      reconcileSubscription,
      refreshQuotas: apiData.refetch,
      resetUsage: freemium.resetUsage,
    }),
    [
      // Plan data from API
      plan,
      planName,

      // Helpers
      canUse,
      getRemaining,
      incrementUsage,
      hasFeature,

      // Usage from API
      usageFromApi,

      // Limits from API
      limitsFromApi,

      // Assistant message quota
      assistantMessagesRemaining,
      assistantMessagesLimit,

      // Saved jobs quota
      apiData.saved_jobs_quota?.used,
      apiData.saved_jobs_quota?.limit,
      freemium.usage.savedJobsCount,

      // Loading states
      apiData.isLoading,
      freemium.isLoaded,

      // Modal state
      showPricingModal,
      pricingModalFeature,

      // Keep functions stable
      openPricingModal,
      closePricingModal,
      reconcileSubscription,
      apiData.refetch,
    ],
  );

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
      <SubscriptionChangedModal
        open={showPlanChangedModal}
        onClose={() => setShowPlanChangedModal(false)}
        onUpgrade={() => {
          setShowPlanChangedModal(false);
          openPricingModal();
        }}
        currentPlan={plan}
      />
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error(
      "useSubscription must be used within a SubscriptionProvider",
    );
  }
  return context;
}

// Hook optional qui ne throw pas d'erreur (pour Sidebar)
export function useOptionalSubscription() {
  const context = useContext(SubscriptionContext);
  return context;
}

// Helper hook for checking specific features
export function useFeatureAccess(feature: keyof PlanLimits) {
  const { hasFeature, getRequiredPlan, openPricingModal } = useSubscription();

  const hasAccess = hasFeature(feature);
  const requiredPlan = getRequiredPlan(feature);

  const requestAccess = () => {
    if (!hasAccess) {
      openPricingModal(feature);
    }
  };

  return {
    hasAccess,
    requiredPlan,
    requestAccess,
  };
}
