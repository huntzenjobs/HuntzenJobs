'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { useSubscription } from '@/contexts/subscription-context'
import { PLAN_LIMITS } from '@/hooks/use-freemium-limits'
import {
  Crown,
  Sparkles,
  Zap,
  Gift,
  TrendingUp,
  FileText,
  MessageSquare,
  Briefcase,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface UsageModalProps {
  isOpen: boolean
  onClose: () => void
}

const PLAN_CONFIG = {
  free: {
    name: 'Gratuit',
    icon: <Gift className="w-5 h-5" />,
    color: 'bg-gray-500',
    bgGradient: 'from-gray-400 to-gray-500',
  },
  starter: {
    name: 'Starter',
    icon: <Sparkles className="w-5 h-5" />,
    color: 'bg-blue-500',
    bgGradient: 'from-blue-500 to-blue-600',
  },
  pro: {
    name: 'Pro',
    icon: <Zap className="w-5 h-5" />,
    color: 'bg-violet-500',
    bgGradient: 'from-violet-500 to-purple-600',
  },
  premium: {
    name: 'Premium',
    icon: <Crown className="w-5 h-5" />,
    color: 'bg-amber-500',
    bgGradient: 'from-amber-500 to-orange-500',
  },
}

interface QuotaCardProps {
  title: string
  icon: React.ReactNode
  used: number
  limit: number
  unit?: string
  color: string
}

function QuotaCard({ title, icon, used, limit, unit = '', color }: QuotaCardProps) {
  const isUnlimited = limit === Infinity
  const percentage = isUnlimited ? 0 : Math.min((used / limit) * 100, 100)
  const remaining = isUnlimited ? Infinity : Math.max(limit - used, 0)

  const getStatusColor = () => {
    if (isUnlimited) return 'text-green-600'
    if (percentage < 50) return 'text-green-600'
    if (percentage < 80) return 'text-orange-600'
    return 'text-red-600'
  }

  const getProgressColor = () => {
    if (isUnlimited) return 'bg-green-500'
    if (percentage < 50) return 'bg-green-500'
    if (percentage < 80) return 'bg-orange-500'
    return 'bg-red-500'
  }

  return (
    <div className="bg-white border-2 border-gray-100 rounded-xl p-4 space-y-3 hover:border-gray-200 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn('p-2 rounded-lg', color)}>
            {icon}
          </div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
        </div>
        <div className={cn('text-sm font-bold', getStatusColor())}>
          {isUnlimited ? '∞' : `${remaining}${unit}`}
        </div>
      </div>

      {!isUnlimited && (
        <>
          <Progress value={percentage} className="h-2" indicatorClassName={getProgressColor()} />
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              {used}{unit} utilisé{used > 1 ? 's' : ''}
            </span>
            <span>
              sur {limit}{unit}
            </span>
          </div>
        </>
      )}

      {isUnlimited && (
        <p className="text-xs text-green-600 font-medium">
          ✨ Utilisation illimitée
        </p>
      )}

      {!isUnlimited && remaining === 0 && (
        <p className="text-xs text-red-600 font-medium">
          ⚠️ Quota atteint pour aujourd'hui
        </p>
      )}
    </div>
  )
}

export function UsageModal({ isOpen, onClose }: UsageModalProps) {
  const {
    plan,
    planName,
    limits,
    usage,
    openPricingModal,
    isFreePlan,
  } = useSubscription()

  const planConfig = PLAN_CONFIG[plan]
  const planLimits = PLAN_LIMITS[plan]

  const handleUpgrade = () => {
    onClose()
    openPricingModal()
  }

  // Convert coach time from seconds to minutes
  const coachUsedMinutes = Math.floor((usage?.coachSecondsUsedToday || 0) / 60)
  const coachLimitMinutes = planLimits.coach_minutes_per_day === Infinity
    ? Infinity
    : planLimits.coach_minutes_per_day

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Mon Utilisation</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Current Plan */}
          <div className={cn(
            'p-5 rounded-xl border-2',
            isFreePlan ? 'bg-gray-50 border-gray-200' : 'bg-gradient-to-br from-violet-50 to-purple-50 border-violet-200'
          )}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={cn('p-2.5 rounded-lg bg-gradient-to-br text-white', planConfig.bgGradient)}>
                  {planConfig.icon}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    Plan {planConfig.name}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {isFreePlan ? 'Découvrez HuntZen gratuitement' : 'Abonnement actif'}
                  </p>
                </div>
              </div>
              {!isFreePlan && (
                <Badge className="bg-green-500">
                  Actif
                </Badge>
              )}
            </div>

            {isFreePlan && (
              <Button
                onClick={handleUpgrade}
                className="w-full mt-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                Passer à un plan payant
              </Button>
            )}
          </div>

          <Separator />

          {/* Quotas Usage */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Utilisation du jour
              </h3>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <Clock className="w-3.5 h-3.5" />
                <span>Réinitialisation à minuit</span>
              </div>
            </div>

            <div className="grid gap-4">
              {/* CV Analysis */}
              <QuotaCard
                title="Analyses CV"
                icon={<FileText className="w-4 h-4 text-white" />}
                used={usage?.cvAnalysesToday || 0}
                limit={planLimits.cv_analyses_per_day}
                color="bg-blue-500"
              />

              {/* Coach Time */}
              <QuotaCard
                title="Temps Coach IA"
                icon={<MessageSquare className="w-4 h-4 text-white" />}
                used={coachUsedMinutes}
                limit={coachLimitMinutes}
                unit=" min"
                color="bg-violet-500"
              />

              {/* Job Searches */}
              <QuotaCard
                title="Recherches d'emploi"
                icon={<Briefcase className="w-4 h-4 text-white" />}
                used={usage?.searchesToday || 0}
                limit={planLimits.job_searches_per_day}
                color="bg-green-500"
              />
            </div>
          </div>

          {/* Upgrade CTA for free users */}
          {isFreePlan && (
            <>
              <Separator />
              <div className="bg-gradient-to-r from-violet-50 to-purple-50 border-2 border-violet-200 rounded-xl p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <Crown className="w-6 h-6 text-violet-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="font-semibold text-violet-900">
                      Débloquez tout le potentiel de HuntZen
                    </h4>
                    <p className="text-sm text-violet-700">
                      Passez à un plan payant pour des analyses illimitées, plus de temps de coaching,
                      et des fonctionnalités exclusives.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={handleUpgrade}
                  className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
                >
                  Voir les plans disponibles
                </Button>
              </div>
            </>
          )}

          {/* Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900">
              <span className="font-semibold">💡 Bon à savoir :</span> Vos quotas se réinitialisent
              automatiquement chaque jour à minuit. Passez à un plan supérieur pour augmenter vos limites.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
