'use client'

import { useEffect, useState } from 'react'
import { useSubscription } from '@/contexts/subscription-context'
import { FeatureType } from '@/hooks/use-freemium-limits'
import { Search, FileText, Clock, Eye } from 'lucide-react'

interface UsageCounterProps {
  feature: FeatureType
  className?: string
  showIcon?: boolean
  showBar?: boolean
  compact?: boolean
}

const featureConfig: Record<
  FeatureType,
  {
    icon: React.ReactNode
    label: string
    maxLabel: (max: number) => string
    formatValue: (value: number, max: number) => string
  }
> = {
  job_search: {
    icon: <Search className="w-4 h-4" aria-hidden="true" />,
    label: 'recherches',
    maxLabel: (max) => (max === Infinity ? 'illimitees' : `/${max}`),
    formatValue: (value, max) =>
      max === Infinity ? 'Illimite' : `${value}/${max}`,
  },
  job_view: {
    icon: <Eye className="w-4 h-4" aria-hidden="true" />,
    label: 'offres',
    maxLabel: (max) => (max === Infinity ? 'illimitees' : `/${max}`),
    formatValue: (value, max) =>
      max === Infinity ? 'Illimite' : `${value}/${max}`,
  },
  cv_analysis: {
    icon: <FileText className="w-4 h-4" aria-hidden="true" />,
    label: 'analyses',
    maxLabel: (max) => (max === Infinity ? 'illimitees' : `/${max}`),
    formatValue: (value, max) =>
      max === Infinity ? 'Illimite' : `${value}/${max}`,
  },
  coach_time: {
    icon: <Clock className="w-4 h-4" aria-hidden="true" />,
    label: 'restantes',
    maxLabel: () => '',
    formatValue: (seconds) => {
      if (seconds === Infinity || seconds > 3600 * 24) return 'Illimite'
      const mins = Math.floor(seconds / 60)
      const secs = seconds % 60
      return `${mins}:${secs.toString().padStart(2, '0')}`
    },
  },
}

export function UsageCounter({
  feature,
  className = '',
  showIcon = true,
  showBar = true,
  compact = false,
}: UsageCounterProps) {
  const { getRemaining, limits, isFreePlan } = useSubscription()

  const remaining = getRemaining(feature)
  const config = featureConfig[feature]

  // Get max for this feature
  let max: number
  switch (feature) {
    case 'job_search':
      max = limits.job_searches_per_day
      break
    case 'job_view':
      max = limits.jobs_visible
      break
    case 'cv_analysis':
      max = limits.cv_analyses_per_day
      break
    case 'coach_time':
      max = limits.coach_minutes_per_day * 60
      break
    default:
      max = 0
  }

  // Calculate percentage
  const used = max - remaining
  const percentage = max === Infinity ? 0 : Math.min(100, (used / max) * 100)

  // Determine color based on remaining
  const getColor = () => {
    if (max === Infinity) return 'text-green-600 bg-green-100'
    const ratio = remaining / max
    if (ratio > 0.5) return 'text-green-600 bg-green-100'
    if (ratio > 0.25) return 'text-orange-600 bg-orange-100'
    return 'text-red-600 bg-red-100'
  }

  const getBarColor = () => {
    if (max === Infinity) return 'bg-green-500'
    const ratio = remaining / max
    if (ratio > 0.5) return 'bg-green-500'
    if (ratio > 0.25) return 'bg-orange-500'
    return 'bg-red-500'
  }

  if (!isFreePlan && max === Infinity) {
    // Don't show counter for unlimited features
    return null
  }

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getColor()} ${className}`}
      >
        {showIcon && config.icon}
        {config.formatValue(
          feature === 'coach_time' ? remaining : used,
          max
        )}
      </span>
    )
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-white/70">
          {showIcon && config.icon}
          <span>
            {feature === 'coach_time'
              ? config.formatValue(remaining, max)
              : `${remaining} ${config.label}`}
            {feature !== 'coach_time' && (
              <span className="text-xs ml-1 text-white/50">
                {config.maxLabel(max)}
              </span>
            )}
          </span>
        </span>
      </div>

      {showBar && max !== Infinity && (
        <div
          className="h-2 bg-gray-100 rounded-full overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={remaining}
          aria-label={`${config.label}: ${remaining} restant(e)s sur ${max}`}
        >
          <div
            className={`h-full transition-all duration-300 ${getBarColor()}`}
            style={{ width: `${100 - percentage}%` }}
          />
        </div>
      )}
    </div>
  )
}

interface CoachTimerProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export function CoachTimer({ className = '', size = 'md' }: CoachTimerProps) {
  const { isCoachSessionActive, limits, coachTimeRemaining } = useSubscription()

  // Utiliser le temps du context (pour tests) ou calculer depuis localStorage
  const [localTimeRemaining, setLocalTimeRemaining] = useState(coachTimeRemaining || 0)

  // Calculer le temps restant localement
  useEffect(() => {
    // Si le context fournit la valeur, l'utiliser directement
    if (coachTimeRemaining !== undefined && coachTimeRemaining !== null) {
      setLocalTimeRemaining(coachTimeRemaining)
      return
    }

    const calculateTimeRemaining = () => {
      try {
        const stored = localStorage.getItem('huntzen_freemium_state')
        if (!stored) return 0

        const state = JSON.parse(stored)
        const totalAllowed = limits.coach_minutes_per_day * 60
        let used = state.usage?.coachSecondsUsedToday || 0

        // Ajouter le temps de la session active
        if (state.usage?.coachSessionStartTime !== null && state.usage?.coachSessionStartTime !== undefined) {
          used += Math.floor((Date.now() - state.usage.coachSessionStartTime) / 1000)
        }

        return Math.max(0, totalAllowed - used)
      } catch {
        return 0
      }
    }

    // Calculer immédiatement
    setLocalTimeRemaining(calculateTimeRemaining())

    // Si session active, mettre à jour chaque seconde
    if (isCoachSessionActive) {
      const interval = setInterval(() => {
        setLocalTimeRemaining(calculateTimeRemaining())
      }, 1000)

      return () => clearInterval(interval)
    }
  }, [isCoachSessionActive, limits.coach_minutes_per_day, coachTimeRemaining])

  const maxSeconds = limits.coach_minutes_per_day * 60
  const percentage =
    maxSeconds === Infinity
      ? 100
      : Math.min(100, (localTimeRemaining / maxSeconds) * 100)

  const formatTime = (seconds: number) => {
    if (seconds === Infinity || seconds > 3600 * 24) return 'Illimite'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getColor = () => {
    if (maxSeconds === Infinity) return 'text-green-600'
    if (percentage > 50) return 'text-green-600'
    if (percentage > 20) return 'text-orange-600'
    return 'text-red-600'
  }

  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  }

  return (
    <div
      className={`flex items-center gap-2 ${sizeClasses[size]} ${className}`}
    >
      <Clock
        className={`${
          size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-6 h-6' : 'w-5 h-5'
        } ${isCoachSessionActive ? 'animate-pulse' : ''} ${getColor()}`}
        aria-hidden="true"
      />
      <span className={`font-mono font-medium ${getColor()}`}>
        {formatTime(localTimeRemaining)}
      </span>
      {isCoachSessionActive && (
        <span className="text-xs text-muted-foreground">(en cours)</span>
      )}
    </div>
  )
}

interface UsageSummaryProps {
  className?: string
}

export function UsageSummary({ className = '' }: UsageSummaryProps) {
  const { plan, isFreePlan } = useSubscription()

  if (!isFreePlan) {
    return null
  }

  return (
    <div className={className}>
      <h4 className="text-sm font-semibold mb-3 text-white/90">Utilisation du jour</h4>
      <div className="space-y-3">
        <UsageCounter feature="job_search" showBar />
        <UsageCounter feature="cv_analysis" showBar />
        <UsageCounter feature="coach_time" showBar />
      </div>
    </div>
  )
}
