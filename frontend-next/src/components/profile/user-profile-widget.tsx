'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { User, Crown, Loader2, AlertCircle } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { createClient } from '@/lib/supabase/client'

interface UserData {
  user: {
    id: string
    email: string
    full_name: string | null
    avatar_url: string | null
    created_at: string | null
  }
  subscription: {
    plan_name: string
    plan_display_name: string
    price_monthly: number
    status: string
    current_period_end: string | null
  }
  quotas: {
    cv_analysis?: QuotaStatus
    coach?: QuotaStatus
    job_search?: QuotaStatus
  }
}

interface QuotaStatus {
  limit: number
  used: number
  remaining: number
  percentage: number
  has_access: boolean
  reset_at: string | null
}

const FEATURE_LABELS: Record<string, string> = {
  cv_analysis: 'Analyses CV',
  coach: 'Minutes Coach',
  job_search: 'Recherches d\'emploi'
}

interface QuotaBarProps {
  feature: string
  quota: QuotaStatus
}

function QuotaBar({ feature, quota }: QuotaBarProps) {
  const { limit, used, remaining, percentage } = quota

  // Format value based on feature type
  const formatValue = () => {
    if (limit === -1) return '∞'
    if (feature === 'coach') {
      // Convert seconds to minutes
      const usedMins = Math.floor(used / 60)
      const limitMins = Math.floor(limit / 60)
      return `${usedMins}/${limitMins} min`
    }
    return `${used}/${limit}`
  }

  // Determine color based on percentage
  const getBarColor = () => {
    if (limit === -1) return 'bg-green-500'
    if (percentage < 50) return 'bg-green-500'
    if (percentage < 80) return 'bg-orange-500'
    return 'bg-red-500'
  }

  const getTextColor = () => {
    if (limit === -1) return 'text-green-600'
    if (percentage < 50) return 'text-green-600'
    if (percentage < 80) return 'text-orange-600'
    return 'text-red-600'
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700 dark:text-gray-300">
          {FEATURE_LABELS[feature] || feature}
        </span>
        <span className={`font-semibold ${getTextColor()}`}>
          {formatValue()}
        </span>
      </div>

      {limit !== -1 && (
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${getBarColor()}`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={limit}
            aria-valuenow={used}
            aria-label={`${FEATURE_LABELS[feature]}: ${used} utilisé(s) sur ${limit}`}
          />
        </div>
      )}

      {remaining === 0 && limit !== -1 && (
        <p className="text-xs text-red-600 dark:text-red-400">
          Quota atteint pour aujourd'hui
        </p>
      )}
    </div>
  )
}

interface UserProfileWidgetProps {
  className?: string
}

export function UserProfileWidget({ className = '' }: UserProfileWidgetProps) {
  const { user, session } = useAuth()
  const [userData, setUserData] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session?.access_token) {
      setLoading(false)
      setError('Session expirée - veuillez vous reconnecter')
      return
    }

    const fetchUserData = async () => {
      try {
        setLoading(true)
        setError(null)

        if (!process.env.NEXT_PUBLIC_BACKEND_URL) {
          throw new Error('NEXT_PUBLIC_BACKEND_URL is not configured')
        }

        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        })

        if (!response.ok) {
          // Handle 401 specifically - expired or invalid token
          if (response.status === 401) {
            console.warn('[UserProfile] Token expired (401), trying to refresh session...')

            // Try to refresh the session
            const supabase = createClient()
            const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()

            if (refreshError || !refreshData.session) {
              console.error('[UserProfile] Session refresh failed:', refreshError)
              throw new Error('Session expirée - veuillez vous reconnecter')
            }

            console.log('[UserProfile] Session refreshed successfully, retrying...')

            // Retry with new token
            const retryResponse = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/me`, {
              headers: {
                'Authorization': `Bearer ${refreshData.session.access_token}`,
                'Content-Type': 'application/json'
              }
            })

            if (!retryResponse.ok) {
              throw new Error(`Erreur ${retryResponse.status} après refresh: ${retryResponse.statusText}`)
            }

            const retryData = await retryResponse.json()
            if (!retryData.success) {
              throw new Error(retryData.error || 'Erreur lors du chargement des données')
            }

            setUserData(retryData)
            return
          }

          throw new Error(`Erreur ${response.status}: ${response.statusText}`)
        }

        const data = await response.json()

        if (!data.success) {
          throw new Error(data.error || 'Erreur lors du chargement des données')
        }

        setUserData(data)
      } catch (err) {
        console.error('[UserProfile] Error fetching user data:', err)
        setError(err instanceof Error ? err.message : 'Erreur inconnue')
      } finally {
        setLoading(false)
      }
    }

    fetchUserData()
  }, [session?.access_token])

  if (loading) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="flex items-center gap-4">
          <Skeleton className="w-16 h-16 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-60" />
          </div>
        </div>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive" className={className}>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {error}
        </AlertDescription>
      </Alert>
    )
  }

  if (!userData) {
    return null
  }

  const { user: profile, subscription, quotas } = userData

  return (
    <div className={`space-y-6 ${className}`}>
      {/* User Info */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.full_name || 'Avatar'}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            <User className="w-8 h-8" />
          )}
        </div>

        <div className="flex-1">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {profile.full_name || 'Utilisateur'}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {profile.email}
          </p>
        </div>
      </div>

      {/* Subscription Info */}
      <div className="p-4 rounded-lg bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border border-blue-200 dark:border-blue-800">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Plan {subscription.plan_display_name}
            </h3>
          </div>
          {subscription.price_monthly > 0 && (
            <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
              {subscription.price_monthly}€<span className="text-sm font-normal">/mois</span>
            </span>
          )}
        </div>

        {subscription.current_period_end && (
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Renouvellement le {new Date(subscription.current_period_end).toLocaleDateString('fr-FR')}
          </p>
        )}
      </div>

      {/* Quotas */}
      <div className="space-y-4">
        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <span>Utilisation du jour</span>
          {quotas.cv_analysis?.reset_at && (
            <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">
              (réinitialisation à minuit)
            </span>
          )}
        </h3>

        {Object.entries(quotas).map(([feature, quota]) => (
          <QuotaBar key={feature} feature={feature} quota={quota} />
        ))}
      </div>

      {/* Account Info */}
      <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Membre depuis {profile.created_at ? new Date(profile.created_at).toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }) : 'N/A'}
        </p>
      </div>
    </div>
  )
}
