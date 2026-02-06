/**
 * Step2AnalysisType - Second step: choose analysis type
 * Features: 2 large cards (Global vs Match), conditional job offer textarea
 */

'use client'

import { Target, GitCompare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { AnalysisTypeCard } from '@/components/cv/analysis-type-card'
import { cn } from '@/lib/utils'

// ============================================================================
// TYPES
// ============================================================================

interface Step2AnalysisTypeProps {
  analysisType: 'global' | 'match' | null
  jobOffer: string
  onAnalysisTypeChange: (type: 'global' | 'match') => void
  onJobOfferChange: (text: string) => void
  onBack: () => void
  onNext: () => void
  className?: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ANALYSIS_TYPES = [
  {
    type: 'global' as const,
    icon: Target,
    title: 'Score Global',
    description: 'Analyse complète de votre CV pour maximiser vos chances',
    features: [
      'Score ATS détaillé sur 100 points',
      'Points forts et axes d\'amélioration',
      'Recommandations personnalisées'
    ]
  },
  {
    type: 'match' as const,
    icon: GitCompare,
    title: 'Match avec Offre',
    description: 'Comparez votre CV avec une offre d\'emploi spécifique',
    features: [
      'Taux de compatibilité avec le poste',
      'Compétences manquantes identifiées',
      'Conseils pour adapter votre CV'
    ]
  }
]

// ============================================================================
// COMPONENT
// ============================================================================

export function Step2AnalysisType({
  analysisType,
  jobOffer,
  onAnalysisTypeChange,
  onJobOfferChange,
  onBack,
  onNext,
  className
}: Step2AnalysisTypeProps) {
  const canProceed =
    analysisType !== null &&
    (analysisType === 'global' || jobOffer.trim().length > 0)

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Type d'analyse</h2>
        <p className="text-sm text-gray-600 mt-1">
          Choisissez le type d'analyse qui correspond à vos besoins
        </p>
      </div>

      {/* Analysis Type Cards */}
      <div className="grid md:grid-cols-2 gap-6">
        {ANALYSIS_TYPES.map((item) => (
          <AnalysisTypeCard
            key={item.type}
            icon={item.icon}
            title={item.title}
            description={item.description}
            features={item.features}
            selected={analysisType === item.type}
            onClick={() => onAnalysisTypeChange(item.type)}
          />
        ))}
      </div>

      {/* Conditional: Job Offer Textarea (slideDown animation) */}
      {analysisType === 'match' && (
        <div
          className={cn(
            'space-y-3 overflow-hidden transition-all duration-300 ease-in-out',
            'animate-in slide-in-from-top-2 fade-in'
          )}
        >
          <div className="pt-2">
            <label htmlFor="job-offer" className="block text-sm font-medium text-gray-900 mb-2">
              Description de l'offre d'emploi
              <span className="text-red-500 ml-1">*</span>
            </label>
            <Textarea
              id="job-offer"
              placeholder="Collez ici la description complète de l'offre d'emploi (missions, compétences requises, profil recherché...)..."
              value={jobOffer}
              onChange={(e) => onJobOfferChange(e.target.value)}
              className="min-h-[150px] resize-y"
            />
            <p className="text-xs text-gray-500 mt-2">
              Plus la description est détaillée, plus l'analyse sera précise
            </p>
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-4">
        <Button
          variant="outline"
          size="lg"
          onClick={onBack}
          className="px-8"
        >
          <svg
            className="mr-2 h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Retour
        </Button>

        <Button
          size="lg"
          onClick={onNext}
          disabled={!canProceed}
          className="px-8"
        >
          Lancer l'analyse
          <svg
            className="ml-2 h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
        </Button>
      </div>
    </div>
  )
}
