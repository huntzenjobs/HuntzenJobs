"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { getClientId } from "@/lib/utils/client-id";

// Plan types
export type PlanType = "free" | "starter" | "pro" | "premium";

// Feature types for tracking
export type FeatureType =
  | "job_search"
  | "job_view"
  | "cv_analysis"
  | "assistant_messages";

// Limits per plan - Synced with Supabase subscription_plans table
// These are FALLBACK values when API is unavailable
// Real limits are fetched from /api/auth/me endpoint
export const PLAN_LIMITS = {
  free: {
    job_searches_per_day: 3,
    jobs_visible: 10,
    cv_analyses_per_day: 1,
    assistant_messages_per_day: 10,
    has_advanced_filters: false,
    has_favorites: false,
    has_email_alerts: false,
    has_visual_score: false,
    has_pdf_export: false,
    has_cv_history: false,
    has_interview_sim: false,
    has_personalized_advice: false,
    has_coach_history: false,
  },
  starter: {
    job_searches_per_day: Infinity, // -1 in DB = unlimited
    jobs_visible: Infinity,
    cv_analyses_per_day: 5, // CORRECTED: was Infinity, should be 5
    assistant_messages_per_day: 100,
    has_advanced_filters: true,
    has_favorites: true,
    has_email_alerts: false,
    has_visual_score: true,
    has_pdf_export: false,
    has_cv_history: false,
    has_interview_sim: false,
    has_personalized_advice: false,
    has_coach_history: false,
  },
  pro: {
    job_searches_per_day: Infinity, // -1 in DB = unlimited
    jobs_visible: Infinity,
    cv_analyses_per_day: 20, // CORRECTED: was Infinity, should be 20
    assistant_messages_per_day: Infinity,
    has_advanced_filters: true,
    has_favorites: true,
    has_email_alerts: false,
    has_visual_score: true,
    has_pdf_export: true,
    has_cv_history: false,
    has_interview_sim: true,
    has_personalized_advice: false,
    has_coach_history: false,
  },
  premium: {
    job_searches_per_day: Infinity, // -1 in DB = unlimited
    jobs_visible: Infinity,
    cv_analyses_per_day: Infinity, // -1 in DB = unlimited
    assistant_messages_per_day: Infinity,
    has_advanced_filters: true,
    has_favorites: true,
    has_email_alerts: true,
    has_visual_score: true,
    has_pdf_export: true,
    has_cv_history: true,
    has_interview_sim: true,
    has_personalized_advice: true,
    has_coach_history: true,
  },
} as const;

interface UsageLimits {
  searchesToday: number;
  jobsViewedToday: number;
  cvAnalysesToday: number;
  assistantMessagesUsedToday: number;
  lastResetDate: string;
}

interface FreemiumState {
  clientId: string;
  plan: PlanType;
  usage: UsageLimits;
  planExpiresAt: string | null;
}

const STORAGE_KEY = "huntzen_freemium_state";

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

function getDefaultState(): FreemiumState {
  return {
    clientId: "",
    plan: "free",
    usage: {
      searchesToday: 0,
      jobsViewedToday: 0,
      cvAnalysesToday: 0,
      assistantMessagesUsedToday: 0,
      lastResetDate: getTodayDate(),
    },
    planExpiresAt: null,
  };
}

function loadState(): FreemiumState {
  if (typeof window === "undefined") return getDefaultState();

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const state = JSON.parse(stored) as FreemiumState;
      // Reset daily limits if it's a new day
      if (state.usage.lastResetDate !== getTodayDate()) {
        state.usage = {
          ...getDefaultState().usage,
          lastResetDate: getTodayDate(),
        };
      }
      return state;
    }
  } catch {
    // Ignore parse errors
  }

  return getDefaultState();
}

function saveState(state: FreemiumState): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function useFreemiumLimits() {
  const [state, setState] = useState<FreemiumState>(getDefaultState);
  const [isLoaded, setIsLoaded] = useState(false);

  // Use refs to access current state without causing re-renders
  const stateRef = useRef(state);
  const limitsRef = useRef(PLAN_LIMITS[state.plan]);

  // Update refs when state changes
  useEffect(() => {
    stateRef.current = state;
    limitsRef.current = PLAN_LIMITS[state.plan];
  }, [state]);

  // Load state on mount
  useEffect(() => {
    const loadedState = loadState();
    loadedState.clientId = getClientId();
    setState(loadedState);
    saveState(loadedState);
    setIsLoaded(true);
  }, []);

  // Get current plan limits - memoize to prevent reference changes
  const limits = useMemo(() => PLAN_LIMITS[state.plan], [state.plan]);

  // Check if user can use a feature - stable reference using ref
  const canUse = useCallback(
    (feature: FeatureType): boolean => {
      const currentState = stateRef.current;
      const currentLimits = limitsRef.current;

      switch (feature) {
        case "job_search":
          return (
            currentState.usage.searchesToday <
            currentLimits.job_searches_per_day
          );
        case "job_view":
          return (
            currentState.usage.jobsViewedToday < currentLimits.jobs_visible
          );
        case "cv_analysis":
          return (
            currentState.usage.cvAnalysesToday <
            currentLimits.cv_analyses_per_day
          );
        case "assistant_messages":
          return (
            currentState.usage.assistantMessagesUsedToday <
            currentLimits.assistant_messages_per_day
          );
        default:
          return false;
      }
    },
    [], // No dependencies - stable reference
  );

  // Get remaining usage for a feature - stable reference using ref
  const getRemaining = useCallback(
    (feature: FeatureType): number => {
      const currentState = stateRef.current;
      const currentLimits = limitsRef.current;

      switch (feature) {
        case "job_search":
          return Math.max(
            0,
            currentLimits.job_searches_per_day -
              currentState.usage.searchesToday,
          );
        case "job_view":
          return Math.max(
            0,
            currentLimits.jobs_visible - currentState.usage.jobsViewedToday,
          );
        case "cv_analysis":
          return Math.max(
            0,
            currentLimits.cv_analyses_per_day -
              currentState.usage.cvAnalysesToday,
          );
        case "assistant_messages":
          return Math.max(
            0,
            currentLimits.assistant_messages_per_day -
              currentState.usage.assistantMessagesUsedToday,
          );
        default:
          return 0;
      }
    },
    [], // No dependencies - stable reference
  );

  // Increment usage for a feature
  const incrementUsage = useCallback(
    (feature: FeatureType, amount: number = 1): void => {
      setState((prev) => {
        const newState = {
          ...prev,
          usage: { ...prev.usage },
        };
        switch (feature) {
          case "job_search":
            newState.usage.searchesToday += amount;
            break;
          case "job_view":
            newState.usage.jobsViewedToday += amount;
            break;
          case "cv_analysis":
            newState.usage.cvAnalysesToday += amount;
            break;
          case "assistant_messages":
            newState.usage.assistantMessagesUsedToday += amount;
            break;
        }
        saveState(newState);
        return newState;
      });
    },
    [],
  );

  // Check if user has a premium feature - stable reference using ref
  const hasFeature = useCallback(
    (feature: keyof (typeof PLAN_LIMITS)["free"]): boolean => {
      const currentLimits = limitsRef.current;
      return !!currentLimits[feature];
    },
    [], // No dependencies - stable reference
  );

  // Get required plan for a feature
  const getRequiredPlan = useCallback(
    (feature: keyof (typeof PLAN_LIMITS)["free"]): PlanType => {
      if (PLAN_LIMITS.free[feature]) return "free";
      if (PLAN_LIMITS.starter[feature]) return "starter";
      if (PLAN_LIMITS.pro[feature]) return "pro";
      return "premium";
    },
    [],
  );

  // Upgrade plan (for testing or when user subscribes)
  const setPlan = useCallback((plan: PlanType, expiresAt?: string): void => {
    setState((prev) => {
      const newState = {
        ...prev,
        plan,
        planExpiresAt: expiresAt || null,
      };
      saveState(newState);
      return newState;
    });
  }, []);

  // Memoize usage object to prevent reference changes
  const usage = useMemo(
    () => state.usage,
    [
      state.usage.searchesToday,
      state.usage.jobsViewedToday,
      state.usage.cvAnalysesToday,
      state.usage.assistantMessagesUsedToday,
      state.usage.lastResetDate,
    ],
  );

  return {
    // State
    clientId: state.clientId,
    plan: state.plan,
    usage,
    limits,
    isLoaded,

    // Methods
    canUse,
    getRemaining,
    incrementUsage,
    hasFeature,
    getRequiredPlan,
    setPlan,
  };
}
