'use client'

import { createContext, useContext, ReactNode, useEffect, useState, useMemo, useCallback } from 'react'
import {
  useFreemiumLimits,
  PlanType,
  FeatureType,
  PLAN_LIMITS,
} from '@/hooks/use-freemium-limits'
import { useSubscriptionApi } from '@/hooks/use-subscription-api'

type PlanLimits = (typeof PLAN_LIMITS)[PlanType]

interface SubscriptionContextType {
  // Plan info
  plan: PlanType
  planName: string
  isFreePlan: boolean
  isPaidPlan: boolean

  // Usage tracking
  canUse: (feature: FeatureType) => boolean
  getRemaining: (feature: FeatureType) => number
  incrementUsage: (feature: FeatureType, amount?: number) => void
  usage: {
    searchesToday: number
    jobsViewedToday: number
    cvAnalysesToday: number
    coachSecondsUsedToday: number
    lastResetDate: string
  }

  // Feature access
  hasFeature: (feature: keyof PlanLimits) => boolean
  getRequiredPlan: (feature: keyof PlanLimits) => PlanType

  // Coach timer
  coachTimeRemaining: number
  startCoachSession: () => void
  stopCoachSession: () => void
  isCoachSessionActive: boolean

  // Limits
  limits: PlanLimits

  // Actions
  setPlan: (plan: PlanType, expiresAt?: string) => void

  // Loading state
  isLoaded: boolean

  // Modal control
  showPricingModal: boolean
  openPricingModal: (feature?: string) => void
  closePricingModal: () => void
  pricingModalFeature: string | null
}

const SubscriptionContext = createContext<SubscriptionContextType | null>(null)

const PLAN_NAMES: Record<PlanType, string> = {
  free: 'Gratuit',
  starter: 'Starter',
  pro: 'Pro',
  premium: 'Premium',
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  // NEW: Fetch subscription data from backend API
  const apiData = useSubscriptionApi()

  // KEEP: Local state for setPlan() and coach session until Stripe integration
  const freemium = useFreemiumLimits()

  const [showPricingModal, setShowPricingModal] = useState(false)
  const [pricingModalFeature, setPricingModalFeature] = useState<string | null>(null)
  const [coachTimeRemaining, setCoachTimeRemaining] = useState(0)

  // Update coach time remaining every second when session is active
  useEffect(() => {
    if (!freemium.isLoaded) return

    // Only run timer logic if coach session is active
    if (freemium.isCoachSessionActive) {
      const updateTime = () => {
        setCoachTimeRemaining(freemium.getCoachTimeRemaining())
      }

      updateTime() // Initial update only when active
      const interval = setInterval(updateTime, 1000)
      return () => clearInterval(interval)
    } else {
      // Calculate once when not active (no recurring updates)
      const totalAllowed = freemium.limits.coach_minutes_per_day * 60
      const remaining = Math.max(0, totalAllowed - freemium.usage.coachSecondsUsedToday)
      setCoachTimeRemaining(remaining)
    }
  }, [
    freemium.isLoaded,
    freemium.isCoachSessionActive,
    freemium.limits.coach_minutes_per_day,
    freemium.usage.coachSecondsUsedToday,
  ])

  const openPricingModal = useCallback((feature?: string) => {
    setPricingModalFeature(feature || null)
    setShowPricingModal(true)
  }, [])

  const closePricingModal = useCallback((open?: boolean) => {
    // Si un paramètre est fourni (par le Dialog onOpenChange), on l'utilise
    // Sinon on ferme par défaut
    setShowPricingModal(open ?? false)
    if (open === false || open === undefined) {
      setPricingModalFeature(null)
    }
  }, [])

  // Map API data to interface (use API as source of truth, localStorage as fallback)
  const plan: PlanType = apiData.subscription?.plan_name || freemium.plan
  const planName = PLAN_NAMES[plan]

  // Build limits from API quotas (source of truth)
  const limitsFromApi: PlanLimits = useMemo(() => {
    if (!apiData.quotas) {
      // Fallback to hardcoded limits if API data not available
      return PLAN_LIMITS[plan]
    }

    // Get base plan limits for feature flags
    const baseLimits = PLAN_LIMITS[plan]

    // Override numeric limits from API, keep feature flags from PLAN_LIMITS
    return {
      ...baseLimits,
      // Override with API data
      cv_analyses_per_day: apiData.quotas.cv_analysis.limit === -1 ? Infinity : apiData.quotas.cv_analysis.limit,
      coach_minutes_per_day: apiData.quotas.coach.limit === -1 ? Infinity : Math.round(apiData.quotas.coach.limit / 60),
      job_searches_per_day: apiData.quotas.job_search.limit === -1 ? Infinity : apiData.quotas.job_search.limit,
    } as PlanLimits
  }, [apiData.quotas, plan])

  // Build usage from API quotas (source of truth)
  const usageFromApi = useMemo(() => ({
    // From API backend (using ?? to avoid treating 0 as falsy)
    searchesToday: apiData.quotas?.job_search.used ?? 0,
    cvAnalysesToday: apiData.quotas?.cv_analysis.used ?? 0,
    coachSecondsUsedToday: apiData.quotas?.coach.used ?? 0,

    // From localStorage (not tracked in backend)
    jobsViewedToday: freemium.usage.jobsViewedToday,
    lastResetDate: apiData.quotas?.cv_analysis.reset_at ?? freemium.usage.lastResetDate,
  }), [
    apiData.quotas,
    freemium.usage.jobsViewedToday,
    freemium.usage.lastResetDate,
  ])

  // canUse helper: Check if user can use a feature based on API quotas
  const canUse = useCallback((feature: FeatureType): boolean => {
    if (!apiData.quotas) return freemium.canUse(feature)

    switch (feature) {
      case 'cv_analysis':
        return apiData.quotas.cv_analysis.has_access
      case 'coach_time':
        return apiData.quotas.coach.has_access
      case 'job_search':
        return apiData.quotas.job_search.has_access
      default:
        return freemium.canUse(feature)
    }
  }, [apiData.quotas, freemium])

  // getRemaining helper: Get remaining quota based on API data
  const getRemaining = useCallback((feature: FeatureType): number => {
    if (!apiData.quotas) return freemium.getRemaining(feature)

    switch (feature) {
      case 'cv_analysis':
        return apiData.quotas.cv_analysis.remaining === -1 ? Infinity : apiData.quotas.cv_analysis.remaining
      case 'coach_time':
        // Convert seconds to minutes
        return apiData.quotas.coach.remaining === -1 ? Infinity : Math.round(apiData.quotas.coach.remaining / 60)
      case 'job_search':
        return apiData.quotas.job_search.remaining === -1 ? Infinity : apiData.quotas.job_search.remaining
      default:
        return freemium.getRemaining(feature)
    }
  }, [apiData.quotas, freemium])

  // incrementUsage: Keep local for now (will be removed when backend tracks all usage)
  const incrementUsage = useCallback((feature: FeatureType, amount?: number) => {
    // Local increment for immediate UI feedback
    freemium.incrementUsage(feature, amount)
    // Backend will update on next API refresh (5 min)
  }, [freemium])

  // useMemo with ONLY primitive dependencies that actually change
  const value: SubscriptionContextType = useMemo(() => ({
    plan,
    planName,
    isFreePlan: plan === 'free',
    isPaidPlan: plan !== 'free',

    canUse,
    getRemaining,
    incrementUsage,
    usage: usageFromApi,

    hasFeature: freemium.hasFeature,
    getRequiredPlan: freemium.getRequiredPlan,

    coachTimeRemaining,
    startCoachSession: freemium.startCoachSession,
    stopCoachSession: freemium.stopCoachSession,
    isCoachSessionActive: freemium.isCoachSessionActive,

    limits: limitsFromApi,

    setPlan: freemium.setPlan, // KEEP local until Stripe integration

    isLoaded: !apiData.isLoading && freemium.isLoaded,

    showPricingModal,
    openPricingModal,
    closePricingModal,
    pricingModalFeature,
  }), [
    // Plan data from API
    plan,
    planName,

    // Helpers
    canUse,
    getRemaining,
    incrementUsage,

    // Usage from API
    usageFromApi,

    // Limits from API
    limitsFromApi,

    // Coach timer
    coachTimeRemaining,
    freemium.isCoachSessionActive,

    // Loading states
    apiData.isLoading,
    freemium.isLoaded,

    // Modal state
    showPricingModal,
    pricingModalFeature,

    // Keep functions stable
    openPricingModal,
    closePricingModal,
  ])

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  )
}

export function useSubscription() {
  const context = useContext(SubscriptionContext)
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider')
  }
  return context
}

// Hook optional qui ne throw pas d'erreur (pour Sidebar)
export function useOptionalSubscription() {
  const context = useContext(SubscriptionContext)
  return context
}

// Helper hook for checking specific features
export function useFeatureAccess(feature: keyof PlanLimits) {
  const { hasFeature, getRequiredPlan, openPricingModal } = useSubscription()

  const hasAccess = hasFeature(feature)
  const requiredPlan = getRequiredPlan(feature)

  const requestAccess = () => {
    if (!hasAccess) {
      openPricingModal(feature)
    }
  }

  return {
    hasAccess,
    requiredPlan,
    requestAccess,
  }
}
