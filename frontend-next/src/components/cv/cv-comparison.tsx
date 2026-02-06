/**
 * CVComparison - Compare two CV analysis versions
 * Features: side-by-side comparison, improvements detection, delta visualization
 */

'use client'

import { useState } from 'react'
import { TrendingUp, TrendingDown, Plus, Check, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScoreRing } from '@/components/cv/score-ring'
import { ScoreBreakdownV2, type BreakdownItem } from '@/components/cv/score-breakdown-v2'
import type { CVAnalysisResult } from '@/hooks/use-cv-history'
import { cn } from '@/lib/utils'

// ============================================================================
// TYPES
// ============================================================================

interface CVComparisonProps {
  analyses: CVAnalysisResult[]
  className?: string
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getNewStrengths(v1: CVAnalysisResult, v2: CVAnalysisResult): string[] {
  return v2.strengths.filter((strength) => !v1.strengths.includes(strength))
}

function getResolvedWeaknesses(v1: CVAnalysisResult, v2: CVAnalysisResult): string[] {
  return v1.weaknesses.filter((weakness) => !v2.weaknesses.includes(weakness))
}

function calculateScoreDelta(v1: CVAnalysisResult, v2: CVAnalysisResult): number {
  return v2.score - v1.score
}

function getBreakdownDeltas(
  breakdown1: BreakdownItem[],
  breakdown2: BreakdownItem[]
): Record<string, number> {
  const deltas: Record<string, number> = {}

  breakdown2.forEach((item2) => {
    const item1 = breakdown1.find((i) => i.label === item2.label)
    if (item1) {
      deltas[item2.label] = item2.value - item1.value
    }
  })

  return deltas
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function ImprovementsList({
  label,
  items,
  icon,
}: {
  label: string
  items: string[]
  icon: React.ReactNode
}) {
  if (items.length === 0) {
    return (
      <div className="text-sm text-gray-500 text-center py-4">
        Aucune modification
      </div>
    )
  }

  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
        {icon}
        {label}
      </h4>
      <ul className="space-y-2">
        {items.map((item, idx) => (
          <li key={idx} className="text-sm text-gray-700 flex items-start gap-2">
            <span className="text-green-600 flex-shrink-0 mt-0.5">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function BreakdownComparison({
  breakdown,
  deltas,
}: {
  breakdown: BreakdownItem[]
  deltas?: Record<string, number>
}) {
  return (
    <div className="space-y-3">
      {breakdown.map((item) => {
        const delta = deltas?.[item.label] || 0
        const percentage = (item.value / item.max) * 100

        return (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-700 font-medium">{item.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-gray-900 font-bold">
                  {item.value}/{item.max}
                </span>
                {delta !== 0 && (
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs',
                      delta > 0
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-red-50 text-red-700 border-red-200'
                    )}
                  >
                    {delta > 0 ? '+' : ''}
                    {delta}
                  </Badge>
                )}
              </div>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full transition-all duration-500"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CVComparison({ analyses, className }: CVComparisonProps) {
  const [selectedIds, setSelectedIds] = useState<[string, string] | null>(null)

  // If not enough analyses or no selection yet
  if (analyses.length < 2) {
    return (
      <div className={cn('text-center py-12', className)}>
        <p className="text-sm text-gray-500 mb-4">
          Vous devez avoir au moins 2 analyses pour utiliser la comparaison
        </p>
      </div>
    )
  }

  // Selection UI
  if (!selectedIds) {
    return (
      <div className={cn('space-y-6', className)}>
        <div className="text-center mb-8">
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            Comparer deux versions
          </h3>
          <p className="text-sm text-gray-600">
            Sélectionnez 2 analyses pour voir vos améliorations
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4 max-w-2xl mx-auto">
          {analyses.slice(0, 10).map((analysis) => (
            <Button
              key={analysis.id}
              variant="outline"
              className="h-auto p-4 flex flex-col items-start gap-2 hover:border-blue-400 hover:bg-blue-50 transition-colors"
              onClick={() => {
                if (!selectedIds) {
                  // First selection
                  setSelectedIds([analysis.id, ''] as [string, string])
                } else if (selectedIds[1] === '') {
                  // Second selection
                  setSelectedIds([selectedIds[0], analysis.id])
                } else {
                  // Reset and start over
                  setSelectedIds([analysis.id, ''] as [string, string])
                }
              }}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-sm font-medium text-left truncate">
                  {analysis.fileName}
                </span>
                <Badge variant="secondary" className="ml-2 flex-shrink-0">
                  {analysis.score}%
                </Badge>
              </div>
              <span className="text-xs text-gray-500">
                {new Date(analysis.analyzedAt).toLocaleDateString('fr-FR')}
              </span>
            </Button>
          ))}
        </div>
      </div>
    )
  }

  // Get selected analyses
  const v1 = analyses.find((a) => a.id === selectedIds[0])
  const v2 = analyses.find((a) => a.id === selectedIds[1])

  if (!v1 || !v2) {
    return (
      <div className={cn('text-center py-12', className)}>
        <p className="text-sm text-gray-500">Sélections invalides</p>
        <Button
          variant="outline"
          onClick={() => setSelectedIds(null)}
          className="mt-4"
        >
          Réessayer
        </Button>
      </div>
    )
  }

  // Calculate improvements
  const scoreDelta = calculateScoreDelta(v1, v2)
  const newStrengths = getNewStrengths(v1, v2)
  const resolvedWeaknesses = getResolvedWeaknesses(v1, v2)
  const breakdownDeltas = getBreakdownDeltas(v1.breakdown, v2.breakdown)

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header with reset button */}
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-gray-900">Comparaison</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSelectedIds(null)}
        >
          Changer la sélection
        </Button>
      </div>

      {/* Score comparison header */}
      <div className="bg-gradient-to-br from-blue-50 to-violet-50 rounded-xl p-6 border border-blue-200">
        <div className="flex items-center justify-center gap-8">
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-900">{v1.score}%</div>
            <div className="text-xs text-gray-600 mt-1">Version 1</div>
          </div>

          <div className="flex flex-col items-center">
            <ArrowRight className="h-6 w-6 text-blue-600 mb-2" />
            {scoreDelta !== 0 && (
              <Badge
                variant="outline"
                className={cn(
                  'text-base font-bold',
                  scoreDelta > 0
                    ? 'bg-green-100 text-green-700 border-green-300'
                    : 'bg-red-100 text-red-700 border-red-300'
                )}
              >
                {scoreDelta > 0 ? (
                  <TrendingUp className="h-4 w-4 mr-1" />
                ) : (
                  <TrendingDown className="h-4 w-4 mr-1" />
                )}
                {scoreDelta > 0 ? '+' : ''}
                {scoreDelta}
              </Badge>
            )}
          </div>

          <div className="text-center">
            <div className="text-3xl font-bold text-gray-900">{v2.score}%</div>
            <div className="text-xs text-gray-600 mt-1">Version 2</div>
          </div>
        </div>
      </div>

      {/* Side-by-side breakdown */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="border rounded-xl p-6 bg-white">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-gray-900">Version 1</h4>
            <ScoreRing score={v1.score} size={60} animationDuration={0} />
          </div>
          <BreakdownComparison breakdown={v1.breakdown} />
        </div>

        <div className="border rounded-xl p-6 bg-white">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-gray-900">Version 2</h4>
            <ScoreRing score={v2.score} size={60} animationDuration={0} />
          </div>
          <BreakdownComparison breakdown={v2.breakdown} deltas={breakdownDeltas} />
        </div>
      </div>

      {/* Improvements summary */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border border-green-200">
        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-green-600" />
          Améliorations détectées
        </h3>

        <div className="grid md:grid-cols-2 gap-6">
          <ImprovementsList
            label="Points forts ajoutés"
            items={newStrengths}
            icon={<Plus className="h-4 w-4 text-green-600" />}
          />
          <ImprovementsList
            label="Faiblesses corrigées"
            items={resolvedWeaknesses}
            icon={<Check className="h-4 w-4 text-blue-600" />}
          />
        </div>

        {newStrengths.length === 0 && resolvedWeaknesses.length === 0 && (
          <p className="text-sm text-gray-600 text-center">
            Aucune amélioration significative détectée entre ces deux versions
          </p>
        )}
      </div>
    </div>
  )
}
