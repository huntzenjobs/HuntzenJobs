'use client'

import { Lock, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSubscription } from '@/contexts/subscription-context'
import { PlanType, PLAN_LIMITS } from '@/hooks/use-freemium-limits'

const PLAN_NAMES: Record<PlanType, string> = {
  free: 'Gratuit',
  starter: 'Starter',
  pro: 'Pro',
  premium: 'Premium',
}

const PLAN_COLORS: Record<PlanType, string> = {
  free: 'gray',
  starter: 'blue',
  pro: 'violet',
  premium: 'amber',
}

interface FeatureLockOverlayProps {
  feature: keyof (typeof PLAN_LIMITS)['free']
  children: React.ReactNode
  className?: string
  message?: string
}

export function FeatureLockOverlay({
  feature,
  children,
  className = '',
  message,
}: FeatureLockOverlayProps) {
  const { hasFeature, getRequiredPlan, openPricingModal } = useSubscription()

  const hasAccess = hasFeature(feature)
  const requiredPlan = getRequiredPlan(feature)

  if (hasAccess) {
    return <>{children}</>
  }

  return (
    <div className={`relative ${className}`}>
      {/* Blurred content */}
      <div className="pointer-events-none select-none blur-sm opacity-50">
        {children}
      </div>

      {/* Lock overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-gray-900/60 backdrop-blur-[2px] rounded-lg pointer-events-none">
        <div className="text-center p-4 pointer-events-auto">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 mb-3 animate-pulse">
            <Lock className="w-6 h-6 text-gray-500" />
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {message || `Disponible avec ${PLAN_NAMES[requiredPlan]}`}
          </p>
          <Button
            size="sm"
            onClick={() => openPricingModal(feature)}
            className="mt-2"
          >
            <Sparkles className="w-4 h-4 mr-1" />
            Debloquer
          </Button>
        </div>
      </div>
    </div>
  )
}

interface FeatureLockBadgeProps {
  feature: keyof (typeof PLAN_LIMITS)['free']
  className?: string
  showText?: boolean
}

export function FeatureLockBadge({
  feature,
  className = '',
  showText = true,
}: FeatureLockBadgeProps) {
  const { hasFeature, getRequiredPlan, openPricingModal } = useSubscription()

  const hasAccess = hasFeature(feature)
  const requiredPlan = getRequiredPlan(feature)
  const color = PLAN_COLORS[requiredPlan]

  if (hasAccess) {
    return null
  }

  return (
    <button
      onClick={() => openPricingModal(feature)}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all hover:scale-105 ${
        color === 'blue'
          ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
          : color === 'violet'
          ? 'bg-violet-100 text-violet-700 hover:bg-violet-200'
          : color === 'amber'
          ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      } ${className}`}
    >
      <Lock className="w-3 h-3" />
      {showText && PLAN_NAMES[requiredPlan]}
    </button>
  )
}

interface LockedButtonProps {
  feature: keyof (typeof PLAN_LIMITS)['free']
  children: React.ReactNode
  onClick?: () => void
  className?: string
  variant?: 'default' | 'outline' | 'ghost' | 'secondary'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  disabled?: boolean
}

export function LockedButton({
  feature,
  children,
  onClick,
  className = '',
  variant = 'default',
  size = 'default',
  disabled = false,
}: LockedButtonProps) {
  const { hasFeature, openPricingModal } = useSubscription()

  const hasAccess = hasFeature(feature)

  const handleClick = () => {
    if (hasAccess) {
      onClick?.()
    } else {
      openPricingModal(feature)
    }
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      disabled={disabled}
      className={`relative ${className}`}
    >
      {children}
      {!hasAccess && (
        <Lock className="w-3 h-3 ml-1 text-current opacity-70" />
      )}
    </Button>
  )
}

interface LockedFeatureWrapperProps {
  feature: keyof (typeof PLAN_LIMITS)['free']
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function LockedFeatureWrapper({
  feature,
  children,
  fallback,
}: LockedFeatureWrapperProps) {
  const { hasFeature } = useSubscription()

  if (hasFeature(feature)) {
    return <>{children}</>
  }

  return <>{fallback || null}</>
}
