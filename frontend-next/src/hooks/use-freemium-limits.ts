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
  | "ats_score"
  | "matching_score"
  | "custom_cv"
  | "assistant_messages"
  | "recruiter_search"
  | "cv_adapt"
  | "cover_letter"
  | "coach"
  | "saved_jobs";

// ── Plan limits — Dynamic from Supabase via /api/public/plans ──────────────
// PLAN_LIMITS is a Proxy that reads from the API cache (localStorage).
// If the cache is empty (first visit, API down), it falls back to HARDCODED_DEFAULTS.
// Admin changes in Supabase propagate here without code changes.

interface PlanLimitValues {
  job_searches_per_day: number;
  jobs_visible: number;
  cv_analyses_per_day: number; // Legacy, kept for compatibility
  ats_scores_per_day: number;
  matching_scores_per_day: number;
  custom_cvs_per_day: number;
  assistant_messages_per_day: number;
  max_saved_jobs: number;
  recruiter_searches_per_day: number;
  cv_adapt_per_day: number;
  cover_letter_per_day: number;
  has_advanced_filters: boolean;
  has_favorites: boolean;
  has_email_alerts: boolean;
  has_visual_score: boolean;
  has_pdf_export: boolean;
  has_cv_history: boolean;
  has_interview_sim: boolean;
  has_personalized_advice: boolean;
  has_coach_history: boolean;
  has_branding: boolean;
  has_cover_letter: boolean;
  has_cv_details: boolean;
  has_matching_score: boolean;
  page_jobs: boolean;
  page_cv_analysis: boolean;
  page_assistant: boolean;
  page_salons: boolean;
  page_saved_jobs: boolean;
  page_candidatures: boolean;
  page_expat: boolean;
  page_referral: boolean;
  page_recruiter_contact: boolean;
  page_documents: boolean;
}

// Hardcoded defaults — last resort if API cache is empty
const HARDCODED_DEFAULTS: Record<PlanType, PlanLimitValues> = {
  free: {
    job_searches_per_day: 5,
    jobs_visible: 10,
    cv_analyses_per_day: 1,
    ats_scores_per_day: 5,
    matching_scores_per_day: 5,
    custom_cvs_per_day: 10,
    assistant_messages_per_day: 5,
    max_saved_jobs: 10,
    recruiter_searches_per_day: 3,
    cv_adapt_per_day: 5,
    cover_letter_per_day: 5,
    has_advanced_filters: true,
    has_favorites: true,
    has_email_alerts: false,
    has_visual_score: true,
    has_pdf_export: true,
    has_cv_history: false,
    has_interview_sim: false,
    has_personalized_advice: false,
    has_coach_history: false,
    has_branding: false,
    has_cover_letter: false,
    has_cv_details: false,
    has_matching_score: true,
    page_jobs: true,
    page_cv_analysis: true,
    page_assistant: true,
    page_salons: true,
    page_saved_jobs: true,
    page_candidatures: false,
    page_expat: true,
    page_referral: true,
    page_recruiter_contact: true,
    page_documents: true,
  },
  starter: {
    job_searches_per_day: 10,
    jobs_visible: 20,
    cv_analyses_per_day: 5,
    ats_scores_per_day: 10,
    matching_scores_per_day: 15,
    custom_cvs_per_day: 20,
    assistant_messages_per_day: 20,
    max_saved_jobs: 30,
    recruiter_searches_per_day: 10,
    cv_adapt_per_day: 10,
    cover_letter_per_day: 10,
    has_advanced_filters: true,
    has_favorites: true,
    has_email_alerts: false,
    has_visual_score: true,
    has_pdf_export: true,
    has_cv_history: true,
    has_interview_sim: false,
    has_personalized_advice: false,
    has_coach_history: true,
    has_branding: false,
    has_cover_letter: false,
    has_cv_details: true,
    has_matching_score: true,
    page_jobs: true,
    page_cv_analysis: true,
    page_assistant: true,
    page_salons: true,
    page_saved_jobs: true,
    page_candidatures: true,
    page_expat: true,
    page_referral: true,
    page_recruiter_contact: true,
    page_documents: true,
  },
  pro: {
    job_searches_per_day: Infinity,
    jobs_visible: Infinity,
    cv_analyses_per_day: Infinity,
    ats_scores_per_day: Infinity,
    matching_scores_per_day: Infinity,
    custom_cvs_per_day: Infinity,
    assistant_messages_per_day: Infinity,
    max_saved_jobs: Infinity,
    recruiter_searches_per_day: Infinity,
    cv_adapt_per_day: Infinity,
    cover_letter_per_day: Infinity,
    has_advanced_filters: true,
    has_favorites: true,
    has_email_alerts: false,
    has_visual_score: true,
    has_pdf_export: true,
    has_cv_history: true,
    has_interview_sim: false,
    has_personalized_advice: false,
    has_coach_history: true,
    has_branding: true,
    has_cover_letter: true,
    has_cv_details: true,
    has_matching_score: true,
    page_jobs: true,
    page_cv_analysis: true,
    page_assistant: true,
    page_salons: true,
    page_saved_jobs: true,
    page_candidatures: true,
    page_expat: true,
    page_referral: true,
    page_recruiter_contact: true,
    page_documents: true,
  },
  premium: {
    job_searches_per_day: Infinity,
    jobs_visible: Infinity,
    cv_analyses_per_day: Infinity,
    ats_scores_per_day: Infinity,
    matching_scores_per_day: Infinity,
    custom_cvs_per_day: Infinity,
    assistant_messages_per_day: Infinity,
    max_saved_jobs: Infinity,
    recruiter_searches_per_day: Infinity,
    cv_adapt_per_day: Infinity,
    cover_letter_per_day: Infinity,
    has_advanced_filters: true,
    has_favorites: true,
    has_email_alerts: true,
    has_visual_score: true,
    has_pdf_export: true,
    has_cv_history: true,
    has_interview_sim: true,
    has_personalized_advice: true,
    has_coach_history: true,
    has_branding: true,
    has_cover_letter: true,
    has_cv_details: true,
    has_matching_score: true,
    page_jobs: true,
    page_cv_analysis: true,
    page_assistant: true,
    page_salons: true,
    page_saved_jobs: true,
    page_candidatures: true,
    page_expat: true,
    page_referral: true,
    page_recruiter_contact: true,
    page_documents: true,
  },
};

/**
 * Build plan limits from API data (limits JSONB + feature_flags JSONB).
 * Converts -1 (DB unlimited) to Infinity (JS unlimited).
 * Falls back to hardcoded defaults for missing fields.
 */
function buildLimitsFromApi(
  planName: PlanType,
  apiLimits: Record<string, number> | null,
  apiFlags: Record<string, boolean> | null,
): PlanLimitValues {
  const defaults = HARDCODED_DEFAULTS[planName];
  if (!apiLimits && !apiFlags) return defaults;

  const num = (key: string, fallback: number): number => {
    const val = apiLimits?.[key];
    if (val === undefined || val === null) return fallback;
    return val === -1 ? Infinity : val;
  };

  const flag = (key: string, fallback: boolean): boolean => {
    return apiFlags?.[key] ?? fallback;
  };

  return {
    job_searches_per_day: num("job_searches_per_day", defaults.job_searches_per_day),
    jobs_visible: num("jobs_visible", defaults.jobs_visible),
    cv_analyses_per_day: num("cv_analyses_per_day", defaults.cv_analyses_per_day),
    ats_scores_per_day: num("ats_scores_per_day", defaults.ats_scores_per_day),
    matching_scores_per_day: num(
      "matching_scores_per_day",
      defaults.matching_scores_per_day,
    ),
    custom_cvs_per_day: num("custom_cvs_per_day", defaults.custom_cvs_per_day),
    assistant_messages_per_day: num(
      "assistant_messages_per_day",
      defaults.assistant_messages_per_day,
    ),
    max_saved_jobs: num("max_saved_jobs", defaults.max_saved_jobs),
    recruiter_searches_per_day: num("recruiter_searches_per_day", defaults.recruiter_searches_per_day),
    cv_adapt_per_day: num("cv_adapt_per_day", defaults.cv_adapt_per_day),
    cover_letter_per_day: num("cover_letter_per_day", defaults.cover_letter_per_day),
    has_advanced_filters: flag(
      "advanced_filters",
      defaults.has_advanced_filters,
    ),
    has_favorites: flag("favorites", defaults.has_favorites),
    has_email_alerts: flag("email_alerts", defaults.has_email_alerts),
    has_visual_score: flag("visual_score", defaults.has_visual_score),
    has_pdf_export: flag("pdf_export", defaults.has_pdf_export),
    has_cv_history: flag("cv_history", defaults.has_cv_history),
    has_interview_sim: flag("interview_sim", defaults.has_interview_sim),
    has_personalized_advice: flag(
      "personalized_advice",
      defaults.has_personalized_advice,
    ),
    has_coach_history: flag("coach_history", defaults.has_coach_history),
    has_branding: flag("branding", defaults.has_branding),
    has_cover_letter: flag("cover_letter", defaults.has_cover_letter),
    has_cv_details: flag("cv_details", defaults.has_cv_details),
    has_matching_score: flag("matching_score", defaults.has_matching_score),
    page_jobs: flag("page_jobs", defaults.page_jobs),
    page_cv_analysis: flag("page_cv_analysis", defaults.page_cv_analysis),
    page_assistant: flag("page_assistant", defaults.page_assistant),
    page_salons: flag("page_salons", defaults.page_salons),
    page_saved_jobs: flag("page_saved_jobs", defaults.page_saved_jobs),
    page_candidatures: flag("page_candidatures", defaults.page_candidatures),
    page_expat: flag("page_expat", defaults.page_expat),
    page_referral: flag("page_referral", defaults.page_referral),
    page_recruiter_contact: flag("page_recruiter_contact", defaults.page_recruiter_contact),
    page_documents: flag("page_documents", defaults.page_documents),
  };
}

/**
 * Try to load plans from the localStorage cache written by usePlansConfig().
 * Returns null if no cache exists.
 */
function loadApiPlansCache(): Record<PlanType, PlanLimitValues> | null {
  if (typeof window === "undefined") return null;
  try {
    // Try locale-specific cache keys first (written by usePlansConfig),
    // then fallback to legacy key for backward compatibility
    const locales = ["fr", "en", "es", "pt"];
    let raw: string | null = null;
    for (const locale of locales) {
      raw = localStorage.getItem(`plans_config_cache:${locale}`);
      if (raw) break;
    }
    // Legacy fallback
    if (!raw) raw = localStorage.getItem("plans_config_cache");
    if (!raw) return null;
    const { data, expiry } = JSON.parse(raw);
    // Respect TTL if present
    if (expiry && Date.now() > expiry) return null;
    if (!Array.isArray(data)) return null;

    const result = {} as Record<PlanType, PlanLimitValues>;
    for (const plan of data) {
      if (
        plan.name &&
        ["free", "starter", "pro", "premium"].includes(plan.name)
      ) {
        result[plan.name as PlanType] = buildLimitsFromApi(
          plan.name as PlanType,
          plan.limits,
          plan.feature_flags,
        );
      }
    }

    // Only return if all 4 plans are present
    if (result.free && result.starter && result.pro && result.premium) {
      return result;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

/**
 * PLAN_LIMITS — Proxy that reads from API cache, falls back to hardcoded defaults.
 *
 * Usage unchanged: PLAN_LIMITS["free"].cv_analyses_per_day
 * Type unchanged: typeof PLAN_LIMITS is Record<PlanType, PlanLimitValues>
 *
 * When usePlansConfig() fetches /api/public/plans and writes to localStorage,
 * subsequent reads of PLAN_LIMITS will return the API values automatically.
 */
export const PLAN_LIMITS: Record<PlanType, PlanLimitValues> = new Proxy(
  HARDCODED_DEFAULTS,
  {
    get(target, prop: string) {
      if (!["free", "starter", "pro", "premium"].includes(prop)) {
        return Reflect.get(target, prop);
      }
      const apiCache = loadApiPlansCache();
      if (apiCache && apiCache[prop as PlanType]) {
        return apiCache[prop as PlanType];
      }
      return target[prop as PlanType];
    },
  },
);

interface UsageLimits {
  searchesToday: number;
  jobsViewedToday: number;
  atsScoresUsedToday: number;
  matchingScoresUsedToday: number;
  customCvsUsedToday: number;
  assistantMessagesUsedToday: number;
  savedJobsCount: number;
  cvAdaptsUsedToday: number;
  coverLettersUsedToday: number;
  recruiterSearchesUsedToday: number;
  lastResetDate: string;
  lastIncrementTimestamps?: Record<string, number>; // Used to protect against sync race conditions
}

interface FreemiumState {
  clientId: string;
  plan: PlanType;
  usage: UsageLimits;
  planExpiresAt: string | null;
}

const STORAGE_KEY_PREFIX = "huntzen_freemium_state";

function getStorageKey(userId?: string): string {
  return userId ? `${STORAGE_KEY_PREFIX}_${userId}` : STORAGE_KEY_PREFIX;
}

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
      atsScoresUsedToday: 0,
      matchingScoresUsedToday: 0,
      customCvsUsedToday: 0,
      assistantMessagesUsedToday: 0,
      savedJobsCount: 0,
      cvAdaptsUsedToday: 0,
      coverLettersUsedToday: 0,
      recruiterSearchesUsedToday: 0,
      lastResetDate: getTodayDate(),
      lastIncrementTimestamps: {},
    },
    planExpiresAt: null,
  };
}

function loadState(userId?: string): FreemiumState {
  if (typeof window === "undefined") return getDefaultState();

  try {
    const key = getStorageKey(userId);
    const stored = localStorage.getItem(key);
    if (stored) {
      const state = JSON.parse(stored) as FreemiumState;
      // Reset daily limits if it's a new day
      if (state.usage.lastResetDate !== getTodayDate()) {
        state.usage = {
          ...getDefaultState().usage,
          lastResetDate: getTodayDate(),
        };
      } else {
        // Ensure all usage keys exist in state.usage (fix for NaN on day-of-update)
        state.usage = {
          ...getDefaultState().usage,
          ...state.usage,
        };
      }
      return state;
    }
    // Migration: try loading from old global key and move to user-scoped key
    if (userId) {
      const oldStored = localStorage.getItem(STORAGE_KEY_PREFIX);
      if (oldStored) {
        localStorage.removeItem(STORAGE_KEY_PREFIX);
      }
    }
  } catch {
    // Ignore parse errors
  }

  return getDefaultState();
}

function saveState(state: FreemiumState, userId?: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(getStorageKey(userId), JSON.stringify(state));
}

export function useFreemiumLimits(userId?: string) {
  const [state, setState] = useState<FreemiumState>(getDefaultState);
  const [isLoaded, setIsLoaded] = useState(false);

  // Use refs to access current state without causing re-renders
  const stateRef = useRef(state);
  const limitsRef = useRef(PLAN_LIMITS[state.plan]);
  const userIdRef = useRef(userId);

  // Update refs when state changes
  useEffect(() => {
    stateRef.current = state;
    limitsRef.current = PLAN_LIMITS[state.plan];
    userIdRef.current = userId;
  }, [state, userId]);

  // Load state on mount or when userId changes
  useEffect(() => {
    const loadedState = loadState(userId);
    loadedState.clientId = getClientId();
    setState(loadedState);
    saveState(loadedState, userId);
    setIsLoaded(true);
  }, [userId]);

  // Reset daily usage at midnight for users keeping the app open across days
  useEffect(() => {
    const checkMidnightReset = () => {
      setState((prev) => {
        if (prev.usage.lastResetDate !== getTodayDate()) {
          const resetState = {
            ...prev,
            usage: {
              ...getDefaultState().usage,
              lastResetDate: getTodayDate(),
            },
          };
          saveState(resetState, userIdRef.current);
          return resetState;
        }
        return prev;
      });
    };
    const id = setInterval(checkMidnightReset, 60_000);
    return () => clearInterval(id);
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
        case "ats_score":
        case "cv_analysis":
          return (
            currentState.usage.atsScoresUsedToday <
            currentLimits.ats_scores_per_day
          );
        case "matching_score":
          return (
            currentState.usage.matchingScoresUsedToday <
            currentLimits.matching_scores_per_day
          );
        case "custom_cv":
          return (
            currentState.usage.customCvsUsedToday <
            currentLimits.custom_cvs_per_day
          );
        case "assistant_messages":
          return (
            currentState.usage.assistantMessagesUsedToday <
            currentLimits.assistant_messages_per_day
          );
        case "saved_jobs":
          return currentState.usage.savedJobsCount < currentLimits.max_saved_jobs;
        case "cv_adapt":
        case "cover_letter":
          // These are usually handled via API quotas or hasFeature
          return true;
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
        case "ats_score":
        case "cv_analysis":
          return Math.max(
            0,
            currentLimits.ats_scores_per_day -
              currentState.usage.atsScoresUsedToday,
          );
        case "matching_score":
          return Math.max(
            0,
            currentLimits.matching_scores_per_day -
              currentState.usage.matchingScoresUsedToday,
          );
        case "custom_cv":
          return Math.max(
            0,
            currentLimits.custom_cvs_per_day -
              currentState.usage.customCvsUsedToday,
          );
        case "assistant_messages":
          return Math.max(
            0,
            currentLimits.assistant_messages_per_day -
              currentState.usage.assistantMessagesUsedToday,
          );
        case "saved_jobs":
          return Math.max(
            0,
            currentLimits.max_saved_jobs - currentState.usage.savedJobsCount,
          );
        case "cv_adapt":
        case "cover_letter":
          return 10; // Placeholder for legacy local tracking
        default:
          return 0;
      }
    },
    [], // No dependencies - stable reference
  );

  // Sync usage for a feature from external source (e.g. API)
  const syncUsage = useCallback(
    (feature: FeatureType, value: number): void => {
      setState((prev) => {
        // Only sync if API value is different
        let localUsed = 0;
        switch (feature) {
          case "job_search": localUsed = prev.usage.searchesToday; break;
          case "ats_score": localUsed = prev.usage.atsScoresUsedToday; break;
          case "matching_score": localUsed = prev.usage.matchingScoresUsedToday; break;
          case "custom_cv": localUsed = prev.usage.customCvsUsedToday; break;
          case "assistant_messages": localUsed = prev.usage.assistantMessagesUsedToday; break;
          case "saved_jobs": localUsed = prev.usage.savedJobsCount; break;
        }

        if (localUsed === value) return prev;

        const newState = {
          ...prev,
          usage: {
            ...prev.usage,
          },
        };

        switch (feature) {
          case "job_search": newState.usage.searchesToday = value; break;
          case "ats_score":
          case "cv_analysis": newState.usage.atsScoresUsedToday = value; break;
          case "matching_score": newState.usage.matchingScoresUsedToday = value; break;
          case "custom_cv": newState.usage.customCvsUsedToday = value; break;
          case "assistant_messages": newState.usage.assistantMessagesUsedToday = value; break;
          case "saved_jobs": newState.usage.savedJobsCount = value; break;
        }

        stateRef.current = newState;
        saveState(newState, userIdRef.current);
        return newState;
      });
    },
    [],
  );

  // Increment usage for a feature
  const incrementUsage = useCallback(
    (feature: FeatureType, amount: number = 1): void => {
      const timestamp = Date.now();
      setState((prev) => {
        const newState = {
          ...prev,
          usage: {
            ...prev.usage,
            lastIncrementTimestamps: {
              ...(prev.usage.lastIncrementTimestamps || {}),
              [feature]: timestamp,
            },
          },
        };
        switch (feature) {
          case "job_search":
            newState.usage.searchesToday += amount;
            break;
          case "job_view":
            newState.usage.jobsViewedToday += amount;
            break;
          case "ats_score":
            newState.usage.atsScoresUsedToday += amount;
            break;
          case "matching_score":
            newState.usage.matchingScoresUsedToday += amount;
            break;
          case "custom_cv":
            newState.usage.customCvsUsedToday += amount;
            break;
          case "assistant_messages":
            newState.usage.assistantMessagesUsedToday += amount;
            break;
          case "saved_jobs":
            newState.usage.savedJobsCount += amount;
            break;
        }
        stateRef.current = newState;
        saveState(newState, userIdRef.current);
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
      saveState(newState, userIdRef.current); // Assuming userIdRef.current is used consistently for saving state
      return newState;
    });
  }, []);

  // Memoize usage object to prevent reference changes
  const usage = useMemo(
    () => state.usage,
    [
      state.usage.searchesToday,
      state.usage.jobsViewedToday,
      state.usage.atsScoresUsedToday,
      state.usage.matchingScoresUsedToday,
      state.usage.customCvsUsedToday,
      state.usage.assistantMessagesUsedToday,
      state.usage.savedJobsCount,
      state.usage.cvAdaptsUsedToday,
      state.usage.coverLettersUsedToday,
      state.usage.recruiterSearchesUsedToday,
      state.usage.lastResetDate,
      state.usage.lastIncrementTimestamps,
    ],
  );

  // Reset usage for a feature (e.g. when API shows a reset)
  const resetUsage = useCallback(
    (feature: FeatureType): void => {
      setState((prev) => {
        const newState = {
          ...prev,
          usage: { ...prev.usage },
        };
        switch (feature) {
          case "job_search":
            newState.usage.searchesToday = 0;
            break;
          case "job_view":
            newState.usage.jobsViewedToday = 0;
            break;
          case "ats_score":
            newState.usage.atsScoresUsedToday = 0;
            break;
          case "matching_score":
            newState.usage.matchingScoresUsedToday = 0;
            break;
          case "custom_cv":
            newState.usage.customCvsUsedToday = 0;
            break;
          case "assistant_messages":
            newState.usage.assistantMessagesUsedToday = 0;
            break;
          case "saved_jobs":
            newState.usage.savedJobsCount = 0;
            break;
          case "cv_adapt":
          case "cover_letter":
            break;
        }
        saveState(newState, userIdRef.current);
        return newState;
      });
    },
    [],
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
    syncUsage,
    resetUsage,
    hasFeature,
    getRequiredPlan,
    setPlan,
  };
}
