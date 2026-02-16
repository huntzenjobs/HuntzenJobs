/**
 * Step3Results - Third step: loading animation + results display
 * Features: animated loading, score ring, CV info panel, accordion results, actions
 */

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, GitCompare, Sparkles, RotateCcw, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ScoreRing } from '@/components/cv/score-ring'
import { CVInfoPanel } from '@/components/cv/cv-info-panel'
import { ResultsAccordion } from '@/components/cv/results-accordion'
import { CVComparison } from '@/components/cv/cv-comparison'
import type { CVAnalysisResult } from '@/hooks/use-cv-history'
import { cn } from '@/lib/utils'

// ============================================================================
// TYPES
// ============================================================================

interface Step3ResultsProps {
  loading: boolean
  result: CVAnalysisResult | null
  error: string | null
  history: CVAnalysisResult[]
  hasFeatures: {
    hasCVHistory: boolean
    hasPDFExport: boolean
  }
  onReset: () => void
  onExportPDF: () => void
  onOpenPricingModal: (feature: string) => void
  className?: string
}

// ============================================================================
// LOADING MESSAGES
// ============================================================================

const LOADING_MESSAGES = [
  'Analyse en cours...',
  'Extraction des informations...',
  'Calcul du score ATS...',
  'Génération des recommandations...'
]

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function LoadingAnimation() {
  const [messageIndex, setMessageIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length)
    }, 1500)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex flex-col items-center justify-center py-16">
      {/* Animated Dots */}
      <div className="flex items-center gap-2 mb-6">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="w-4 h-4 rounded-full bg-huntzen-blue animate-pulse"
            style={{
              animationDelay: `${index * 0.2}s`,
              animationDuration: '1s'
            }}
          />
        ))}
      </div>

      {/* Loading Message */}
      <p className="text-lg font-medium text-gray-900 transition-opacity duration-300">
        {LOADING_MESSAGES[messageIndex]}
      </p>
      <p className="text-sm text-gray-500 mt-2">
        Cela peut prendre quelques secondes
      </p>
    </div>
  )
}

function ErrorState({ error, onReset }: { error: string; onReset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
        <AlertCircle className="h-8 w-8 text-red-600" />
      </div>
      <h3 className="text-xl font-bold text-gray-900 mb-2">Erreur d'analyse</h3>
      <p className="text-sm text-gray-600 max-w-md mb-6">{error}</p>
      <Button onClick={onReset} variant="outline" className="gap-2">
        <RotateCcw className="h-4 w-4" />
        Réessayer
      </Button>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function Step3Results({
  loading,
  result,
  error,
  history,
  hasFeatures,
  onReset,
  onExportPDF,
  onOpenPricingModal,
  className
}: Step3ResultsProps) {
  const router = useRouter()
  const [showComparison, setShowComparison] = useState(false)

  // Loading state
  if (loading) {
    return <LoadingAnimation />
  }

  // Error state
  if (error) {
    return <ErrorState error={error} onReset={onReset} />
  }

  // No result yet
  if (!result) {
    return null
  }

  const canCompare = history.length >= 2 && hasFeatures.hasCVHistory

  return (
    <div className={cn('space-y-8', className)}>
      {/* Header with Score Ring + CV Info */}
      <div className="grid md:grid-cols-[1fr_300px] gap-6">
        {/* Score Ring */}
        <div className="flex flex-col items-center justify-center p-6 bg-gradient-to-br from-blue-50 to-violet-50 rounded-xl border-2 border-blue-200">
          <ScoreRing score={result.score} size={140} animationDuration={750} />
          <p className="text-sm text-gray-600 mt-4">
            Votre CV obtient un score de <span className="font-bold text-huntzen-blue">{result.score}%</span>
          </p>
        </div>

        {/* CV Info Panel */}
        {result.cv_info && <CVInfoPanel cvInfo={result.cv_info} />}
      </div>

      {/* Actions Header */}
      <div className="flex items-center justify-end gap-3">
        {/* Export PDF */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (!hasFeatures.hasPDFExport) {
              onOpenPricingModal('has_pdf_export')
            } else {
              onExportPDF()
            }
          }}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Exporter PDF
          {!hasFeatures.hasPDFExport && (
            <span className="ml-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded">
              PRO
            </span>
          )}
        </Button>

        {/* Comparison */}
        {canCompare && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowComparison(true)}
            className="gap-2"
          >
            <GitCompare className="h-4 w-4" />
            Comparer
          </Button>
        )}
      </div>

      {/* Results Accordion */}
      <ResultsAccordion
        breakdown={result.breakdown}
        strengths={result.strengths || []}
        weaknesses={result.weaknesses || []}
        suggestions={result.suggestions || []}
        rawAnalysis={result.rawAnalysis}
        currentScore={result.score}
      />

      {/* Bottom Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t-2 border-gray-200">
        <Button
          variant="outline"
          size="lg"
          onClick={onReset}
          className="gap-2 w-full sm:w-auto"
        >
          <RotateCcw className="h-4 w-4" />
          Nouvelle analyse
        </Button>

        <Button
          size="lg"
          onClick={() => router.push('/coach')}
          className="gap-2 w-full sm:w-auto bg-gradient-to-r from-huntzen-blue to-huntzen-turquoise hover:shadow-lg transition-all"
        >
          <Sparkles className="h-4 w-4" />
          Améliorer avec Coach IA
        </Button>
      </div>

      {/* Comparison Dialog */}
      {canCompare && (
        <Dialog open={showComparison} onOpenChange={setShowComparison}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <CVComparison analyses={history} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
