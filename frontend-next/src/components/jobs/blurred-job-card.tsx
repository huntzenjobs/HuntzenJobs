'use client'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Lock, Sparkles, MapPin, Building } from 'lucide-react'
import { useSubscription } from '@/contexts/subscription-context'

interface BlurredJobCardProps {
  index: number
  className?: string
}

export function BlurredJobCard({ index, className = '' }: BlurredJobCardProps) {
  const { openPricingModal } = useSubscription()

  // Generate fake content for visual appeal
  const fakeTitle = [
    'Developpeur Full Stack',
    'Product Manager',
    'Data Scientist',
    'DevOps Engineer',
    'UX Designer',
  ][index % 5]

  const fakeCompany = [
    'Tech Startup',
    'Grande Entreprise',
    'Scale-up',
    'Cabinet Conseil',
    'Agence Digital',
  ][index % 5]

  return (
    <Card
      className={`relative overflow-hidden group cursor-pointer hover:shadow-lg transition-all ${className}`}
      onClick={() => openPricingModal('jobs_visible')}
    >
      {/* Blurred content */}
      <div className="blur-md select-none pointer-events-none opacity-60">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-lg font-semibold line-clamp-2">{fakeTitle}</div>
              <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                <Building className="h-4 w-4" />
                {fakeCompany}
              </div>
            </div>
            <div className="px-2 py-1 rounded bg-gray-100 text-xs">Source</div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              Paris, France
            </div>
            <p className="text-sm font-medium text-green-600">45K - 65K EUR</p>
            <p className="text-sm text-muted-foreground line-clamp-3">
              Nous recherchons un talent passionne pour rejoindre notre equipe
              dynamique. Vous aurez l&apos;opportunite de travailler sur des
              projets innovants...
            </p>
          </div>
        </CardContent>
      </div>

      {/* Lock overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-white/90 via-white/70 to-white/50 dark:from-gray-900/90 dark:via-gray-900/70 dark:to-gray-900/50 pointer-events-none">
        <div className="text-center p-4 transform transition-transform group-hover:scale-105 pointer-events-auto">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 mb-3 shadow-lg shadow-violet-200 dark:shadow-violet-900/30 animate-pulse">
            <Lock className="w-6 h-6 text-white" />
          </div>
          <p className="font-semibold text-gray-800 dark:text-gray-200 mb-1">
            Offre verrouillee
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Passez Premium pour voir cette offre
          </p>
          <Button
            size="sm"
            className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 shadow-md"
          >
            <Sparkles className="w-4 h-4 mr-1" />
            Debloquer
          </Button>
        </div>
      </div>

      {/* Glow effect on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-r from-violet-500/5 to-purple-500/5" />
      </div>
    </Card>
  )
}

interface JobsLimitReachedProps {
  totalJobs: number
  visibleJobs: number
  className?: string
}

export function JobsLimitReached({
  totalJobs,
  visibleJobs,
  className = '',
}: JobsLimitReachedProps) {
  const { openPricingModal } = useSubscription()
  const hiddenJobs = totalJobs - visibleJobs

  return (
    <div
      className={`col-span-full p-8 rounded-xl bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 border-2 border-dashed border-violet-200 dark:border-violet-800 text-center ${className}`}
    >
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 mb-4 shadow-lg">
        <Lock className="w-8 h-8 text-white" />
      </div>
      <h3 className="text-xl font-bold mb-2">
        +{hiddenJobs} offres supplementaires
      </h3>
      <p className="text-muted-foreground mb-4 max-w-md mx-auto">
        Vous avez atteint la limite de {visibleJobs} offres visibles. Passez
        Premium pour acceder a toutes les offres et ne manquer aucune
        opportunite.
      </p>
      <Button
        size="lg"
        onClick={() => openPricingModal('jobs_visible')}
        className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 shadow-lg"
      >
        <Sparkles className="w-5 h-5 mr-2" />
        Voir toutes les offres
      </Button>
    </div>
  )
}
