'use client'

import { useState, useEffect } from 'react'
import { X, Sparkles, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSubscription } from '@/contexts/subscription-context'

const BANNER_DISMISSED_KEY = 'huntzen_upgrade_banner_dismissed'

interface UpgradeBannerProps {
  className?: string
  variant?: 'default' | 'minimal' | 'gradient'
}

export function UpgradeBanner({
  className = '',
  variant = 'default',
}: UpgradeBannerProps) {
  const { isFreePlan, openPricingModal } = useSubscription()
  const [isDismissed, setIsDismissed] = useState(true)

  useEffect(() => {
    // Check if banner was dismissed today
    const dismissedDate = localStorage.getItem(BANNER_DISMISSED_KEY)
    const today = new Date().toISOString().split('T')[0]

    if (dismissedDate !== today) {
      setIsDismissed(false)
    }
  }, [])

  const handleDismiss = () => {
    const today = new Date().toISOString().split('T')[0]
    localStorage.setItem(BANNER_DISMISSED_KEY, today)
    setIsDismissed(true)
  }

  if (!isFreePlan || isDismissed) {
    return null
  }

  if (variant === 'minimal') {
    return (
      <div
        className={`flex items-center justify-between gap-4 px-4 py-2 bg-gradient-to-r from-violet-500/10 to-purple-500/10 border-b border-violet-200 ${className}`}
      >
        <p className="text-sm text-violet-700">
          <Sparkles className="w-4 h-4 inline mr-1" />
          Passez Premium pour debloquer toutes les fonctionnalites
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => openPricingModal()}
            className="text-violet-700 hover:text-violet-800 hover:bg-violet-100"
          >
            Voir les offres
          </Button>
          <button
            onClick={handleDismiss}
            className="text-violet-400 hover:text-violet-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }

  if (variant === 'gradient') {
    return (
      <div
        className={`relative overflow-hidden rounded-lg bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 p-4 text-white ${className}`}
      >
        {/* Background decoration */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white blur-3xl" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-white blur-3xl" />
        </div>

        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-white/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold">Passez a HuntZen Pro</p>
              <p className="text-sm text-white/80">
                Debloquez toutes les fonctionnalites et boostez votre carriere
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => openPricingModal()}
              className="bg-white text-violet-700 hover:bg-white/90"
            >
              Voir les offres
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
            <button
              onClick={handleDismiss}
              className="p-1 rounded hover:bg-white/20 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Default variant
  return (
    <div
      className={`flex items-center justify-between gap-4 px-4 py-3 bg-gradient-to-r from-blue-50 via-violet-50 to-purple-50 border border-violet-200 rounded-lg ${className}`}
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-full bg-gradient-to-br from-violet-500 to-purple-600">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="font-medium text-gray-900">
            Debloquez tout le potentiel de HuntZen
          </p>
          <p className="text-sm text-gray-600">
            Recherches illimitees, export PDF, simulation entretien et plus
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          onClick={() => openPricingModal()}
          className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
        >
          Voir les offres
          <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
        <button
          onClick={handleDismiss}
          className="p-1.5 rounded-full hover:bg-gray-200 transition-colors"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>
    </div>
  )
}

interface FeatureUpgradePromptProps {
  feature: string
  title: string
  description: string
  className?: string
}

export function FeatureUpgradePrompt({
  feature,
  title,
  description,
  className = '',
}: FeatureUpgradePromptProps) {
  const { openPricingModal } = useSubscription()

  return (
    <div
      className={`p-6 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 text-center ${className}`}
    >
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 mb-4">
        <Sparkles className="w-6 h-6 text-white" />
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground mb-4">{description}</p>
      <Button
        onClick={() => openPricingModal(feature)}
        className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
      >
        Debloquer cette fonctionnalite
        <ArrowRight className="w-4 h-4 ml-1" />
      </Button>
    </div>
  )
}
