"use client";

import {
  createContext,
  useContext,
  ReactNode,
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  useFreemiumLimits,
  PlanType,
  FeatureType,
  PLAN_LIMITS,
} from "@/hooks/use-freemium-limits";
import { useSubscriptionApi } from "@/hooks/use-subscription-api";
import { useOptionalAuth } from "@/contexts/auth-context";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { SubscriptionChangedModal } from "@/components/freemium/subscription-changed-modal";

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
    cvAnalysesToday: number;
    assistantMessagesUsedToday: number;
    lastResetDate: string;
  };

  // Feature access
  hasFeature: (feature: keyof PlanLimits) => boolean;
  getRequiredPlan: (feature: keyof PlanLimits) => PlanType;

  // Assistant message quota
  assistantMessagesRemaining: number;
  assistantMessagesLimit: number;

  // Limits
  limits: PlanLimits;

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
}

const SubscriptionContext = createContext<SubscriptionContextType | null>(null);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("subscription");

  // Get auth session for inconsistency detection
  const auth = useOptionalAuth();

  // NEW: Fetch subscription data from backend API
  const apiData = useSubscriptionApi();

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
      // Override with API data
      cv_analyses_per_day:
        apiData.quotas.cv_analysis.limit === -1
          ? Infinity
          : apiData.quotas.cv_analysis.limit,
      assistant_messages_per_day: apiData.quotas.assistant_messages
        ? apiData.quotas.assistant_messages.limit === -1
          ? Infinity
          : apiData.quotas.assistant_messages.limit
        : PLAN_LIMITS[plan].assistant_messages_per_day,
      job_searches_per_day:
        apiData.quotas.job_search.limit === -1
          ? Infinity
          : apiData.quotas.job_search.limit,
    } as PlanLimits;
  }, [apiData.quotas, plan]);

  // Build usage from API quotas (source of truth)
  const usageFromApi = useMemo(
    () => ({
      // From API backend (using ?? to avoid treating 0 as falsy)
      searchesToday: apiData.quotas?.job_search.used ?? 0,
      cvAnalysesToday: apiData.quotas?.cv_analysis.used ?? 0,
      assistantMessagesUsedToday: apiData.quotas?.assistant_messages?.used ?? 0,

      // From API backend (fallback to localStorage if not tracked)
      jobsViewedToday:
        apiData.quotas?.job_view?.used ?? freemium.usage.jobsViewedToday,
      lastResetDate:
        apiData.quotas?.cv_analysis.reset_at ?? freemium.usage.lastResetDate,
    }),
    [
      apiData.quotas,
      freemium.usage.jobsViewedToday,
      freemium.usage.lastResetDate,
    ],
  );

  // canUse helper: Check if user can use a feature based on API quotas + local state
  const canUse = useCallback(
    (feature: FeatureType): boolean => {
      // Check local optimistic state first (catches immediate post-action state)
      const localCanUse = freemium.canUse(feature);

      if (!apiData.quotas) {
        // API not loaded yet — use local state (conservative)
        return localCanUse;
      }

      // Check API quotas for ALL features with quota tracking
      const quotaKey =
        feature === "cv_analysis"
          ? "cv_analysis"
          : feature === "job_search"
            ? "job_search"
            : feature === "assistant_messages"
              ? "assistant_messages"
              : feature === "job_view"
                ? "job_view"
                : feature === "recruiter_search"
                  ? "recruiter_search"
                  : null;

      const apiCanUse =
        quotaKey && apiData.quotas[quotaKey]
          ? apiData.quotas[quotaKey].has_access
          : localCanUse;

      // Block if EITHER source says no (most conservative = safest)
      return apiCanUse && localCanUse;
    },
    [apiData.quotas, freemium],
  );

  // getRemaining helper: Get remaining quota based on API data for ALL features
  const getRemaining = useCallback(
    (feature: FeatureType): number => {
      const localRemaining = freemium.getRemaining(feature);
      if (!apiData.quotas) return localRemaining;

      // Generic lookup for all quota-tracked features
      const quotaData = apiData.quotas[feature];
      if (!quotaData) return localRemaining;

      const apiRemaining =
        quotaData.remaining === -1 ? Infinity : quotaData.remaining;

      // Return the lower value: if local was decremented but API hasn't refreshed yet
      return Math.min(apiRemaining, localRemaining);
    },
    [apiData.quotas, freemium],
  );

  // incrementUsage: Keep local for now (will be removed when backend tracks all usage)
  const incrementUsage = useCallback(
    (feature: FeatureType, amount?: number) => {
      // Optimistic local update for immediate UI feedback
      freemium.incrementUsage(feature, amount);
      // Refetch backend data after cache invalidation completes (~1.5s)
      setTimeout(() => {
        apiData.refetch();
      }, 1500);
    },
    [freemium, apiData],
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

      limits: limitsFromApi,

      setPlan: freemium.setPlan, // KEEP local until Stripe integration

      isLoaded: !apiData.isLoading && freemium.isLoaded,

      showPricingModal,
      openPricingModal,
      closePricingModal,
      pricingModalFeature,

      reconcileSubscription,
      refreshQuotas: apiData.refetch,
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
