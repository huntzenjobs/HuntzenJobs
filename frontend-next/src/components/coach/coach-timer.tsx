'use client'

import * as React from 'react'
import { Clock, AlertTriangle, Ban } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

/**
 * CoachTimer - Session timer with progressive alerts
 *
 * Features:
 * - Visual countdown timer
 * - Progressive color coding (gray → amber → red)
 * - Alert toasts at key intervals (5min, 2min, 1min, 30s)
 * - Pulse animation when time is low
 * - Compact badge design
 *
 * UX Benefits:
 * - Non-intrusive time awareness
 * - Clear visual hierarchy
 * - Prevents unexpected session end
 * - Encourages upgrade at right moment
 */

export interface CoachTimerProps {
  /** Total seconds for the session */
  totalSeconds: number
  /** Handler when time runs out */
  onTimeUp?: () => void
  /** Custom className */
  className?: string
  /** Compact mode (smaller) */
  compact?: boolean
}

export function CoachTimer({
  totalSeconds,
  onTimeUp,
  className,
  compact = false,
}: CoachTimerProps) {
  const [secondsRemaining, setSecondsRemaining] = React.useState(totalSeconds)
  const [alertsShown, setAlertsShown] = React.useState<Set<number>>(new Set())
  const [hasCalledTimeUp, setHasCalledTimeUp] = React.useState(false)

  // Calculate time parts
  const minutes = Math.floor(secondsRemaining / 60)
  const seconds = secondsRemaining % 60

  // Format time as MM:SS
  const formattedTime = String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0')

  // Determine color state
  const getColorState = (): 'normal' | 'warning' | 'critical' | 'expired' => {
    if (secondsRemaining <= 0) return 'expired'
    if (secondsRemaining <= 60) return 'critical'  // Last minute
    if (secondsRemaining <= 300) return 'warning'  // Last 5 minutes
    return 'normal'
  }

  const colorState = getColorState()

  // Timer countdown
  React.useEffect(() => {
    if (secondsRemaining <= 0) {
      // Only call onTimeUp once when time expires
      if (!hasCalledTimeUp) {
        setHasCalledTimeUp(true)
        onTimeUp?.()
      }
      return
    }

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [secondsRemaining, onTimeUp, hasCalledTimeUp])

  // Progressive alerts
  React.useEffect(() => {
    // Alert thresholds: 5min, 2min, 1min, 30s
    const alertThresholds = [300, 120, 60, 30]

    for (const threshold of alertThresholds) {
      if (secondsRemaining === threshold && !alertsShown.has(threshold)) {
        showAlert(threshold)
        setAlertsShown((prev) => new Set([...prev, threshold]))
      }
    }
  }, [secondsRemaining, alertsShown])

  // Show alert toast
  const showAlert = (threshold: number) => {
    let message = ''
    let icon: React.ReactNode

    if (threshold === 300) {
      message = 'Il vous reste 5 minutes de session gratuite'
      icon = <Clock className="size-5 text-amber-500" />
    } else if (threshold === 120) {
      message = 'Il vous reste 2 minutes de session'
      icon = <AlertTriangle className="size-5 text-orange-500" />
    } else if (threshold === 60) {
      message = 'Dernière minute de session gratuite !'
      icon = <AlertTriangle className="size-5 text-red-500" />
    } else if (threshold === 30) {
      message = 'Session gratuite terminée dans 30 secondes'
      icon = <Ban className="size-5 text-red-600" />
    }

    toast.warning(message, {
      icon,
      duration: 5000,
      action: threshold <= 120 ? {
        label: 'Passer Premium',
        onClick: () => {
          // Open pricing modal (will be handled by parent)
          window.dispatchEvent(new CustomEvent('open-pricing-modal'))
        },
      } : undefined,
    })
  }

  // Percentage for progress ring
  const percentage = (secondsRemaining / totalSeconds) * 100

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2',
        'px-3 py-2 rounded-full',
        'border-2',
        'transition-all duration-300',
        colorState === 'normal' && 'bg-gray-50 border-gray-300 text-gray-700',
        colorState === 'warning' && 'bg-amber-50 border-amber-300 text-amber-700',
        colorState === 'critical' && 'bg-red-50 border-red-400 text-red-700 animate-pulse',
        colorState === 'expired' && 'bg-red-100 border-red-500 text-red-900',
        compact && 'px-2 py-1 text-sm',
        className
      )}
      role="timer"
      aria-label={'Temps restant: ' + formattedTime}
      aria-live="polite"
    >
      {/* Icon */}
      {colorState === 'expired' ? (
        <Ban className={cn('flex-shrink-0', compact ? 'size-4' : 'size-5')} />
      ) : (
        <Clock className={cn('flex-shrink-0', compact ? 'size-4' : 'size-5')} />
      )}

      {/* Time display */}
      <span
        className={cn(
          'font-mono font-semibold tabular-nums',
          compact ? 'text-xs' : 'text-sm'
        )}
      >
        {formattedTime}
      </span>

      {/* Visual indicator dot */}
      <div
        className={cn(
          'size-2 rounded-full',
          colorState === 'normal' && 'bg-gray-400',
          colorState === 'warning' && 'bg-amber-500 animate-pulse',
          colorState === 'critical' && 'bg-red-600 animate-ping',
          colorState === 'expired' && 'bg-red-700'
        )}
        aria-hidden="true"
      />
    </div>
  )
}

/**
 * CoachTimerBadge - Minimal badge version for header
 */
export function CoachTimerBadge({
  totalSeconds,
  onTimeUp,
  className,
}: Omit<CoachTimerProps, 'compact'>) {
  return <CoachTimer totalSeconds={totalSeconds} onTimeUp={onTimeUp} compact className={className} />
}
