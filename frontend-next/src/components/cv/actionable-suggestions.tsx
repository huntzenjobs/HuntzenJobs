/**
 * ActionableSuggestions - Interactive suggestions with checkboxes and progress tracking
 * Features: checkbox tracking, impact points, category badges, potential score calculation
 */

'use client'

import { useState, useMemo } from 'react'
import { ExternalLink, TrendingUp } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ============================================================================
// TYPES
// ============================================================================

export type SuggestionCategory = 'skills' | 'experience' | 'education' | 'formatting' | 'other'

export interface Suggestion {
  text: string
  impact: number // Points gagnables (0-10)
  category: SuggestionCategory
  actionable: boolean
  link?: string // Optional link to resource
}

interface ActionableSuggestionsProps {
  suggestions: Suggestion[]
  currentScore: number
  className?: string
  onSuggestionCheck?: (index: number, checked: boolean) => void
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CATEGORY_LABELS: Record<SuggestionCategory, string> = {
  skills: 'Compétences',
  experience: 'Expérience',
  education: 'Formation',
  formatting: 'Mise en forme',
  other: 'Autre',
}

const CATEGORY_COLORS: Record<SuggestionCategory, string> = {
  skills: 'bg-blue-100 text-blue-700 border-blue-200',
  experience: 'bg-green-100 text-green-700 border-green-200',
  education: 'bg-violet-100 text-violet-700 border-violet-200',
  formatting: 'bg-amber-100 text-amber-700 border-amber-200',
  other: 'bg-gray-100 text-gray-700 border-gray-200',
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getCategoryLabel(category: SuggestionCategory): string {
  return CATEGORY_LABELS[category] || category
}

function getCategoryColor(category: SuggestionCategory): string {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.other
}

function calculatePotentialScore(
  suggestions: Suggestion[],
  checkedItems: Set<number>,
  currentScore: number
): number {
  const totalImpact = Array.from(checkedItems).reduce((sum, idx) => {
    return sum + (suggestions[idx]?.impact || 0)
  }, 0)

  return Math.min(100, currentScore + totalImpact)
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ActionableSuggestions({
  suggestions,
  currentScore,
  className = '',
  onSuggestionCheck
}: ActionableSuggestionsProps) {
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set())

  // Calculate stats
  const stats = useMemo(() => {
    const totalSuggestions = suggestions.length
    const completedCount = checkedItems.size
    const completionRate = totalSuggestions > 0 ? (completedCount / totalSuggestions) * 100 : 0
    const potentialScore = calculatePotentialScore(suggestions, checkedItems, currentScore)
    const scoreGain = potentialScore - currentScore

    return {
      totalSuggestions,
      completedCount,
      completionRate,
      potentialScore,
      scoreGain
    }
  }, [suggestions, checkedItems, currentScore])

  // Handle checkbox change
  const handleCheckChange = (index: number, checked: boolean) => {
    const newSet = new Set(checkedItems)
    if (checked) {
      newSet.add(index)
    } else {
      newSet.delete(index)
    }
    setCheckedItems(newSet)
    onSuggestionCheck?.(index, checked)
  }

  if (suggestions.length === 0) {
    return (
      <div className={cn('text-center py-8 text-gray-500', className)}>
        <p className="text-sm">Aucune suggestion disponible</p>
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Progress Card */}
      <div className="bg-gradient-to-br from-blue-50 to-violet-50 rounded-xl p-5 border border-blue-200">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              Progression
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              {stats.completedCount}/{stats.totalSuggestions} améliorations complétées
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-blue-600">
              {stats.potentialScore}
            </div>
            <div className="text-xs text-gray-600">Score potentiel</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="relative h-3 bg-white/50 rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-violet-500 rounded-full transition-all duration-500"
            style={{ width: `${stats.completionRate}%` }}
          />
        </div>

        {/* Stats */}
        {stats.scoreGain > 0 && (
          <p className="text-sm text-blue-700 font-medium mt-3">
            +{stats.scoreGain} points possibles
          </p>
        )}
      </div>

      {/* Suggestions List */}
      <div className="space-y-3">
        {suggestions.map((suggestion, idx) => {
          const isChecked = checkedItems.has(idx)

          return (
            <div
              key={idx}
              className={cn(
                'flex items-start gap-3 p-4 rounded-xl border-2 transition-all duration-300',
                isChecked
                  ? 'bg-green-50 border-green-300 shadow-sm'
                  : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-sm'
              )}
            >
              {/* Checkbox */}
              <div className="pt-0.5">
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={(checked) =>
                    handleCheckChange(idx, checked as boolean)
                  }
                  id={`suggestion-${idx}`}
                  className="h-5 w-5"
                />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <label
                  htmlFor={`suggestion-${idx}`}
                  className={cn(
                    'text-sm text-gray-900 cursor-pointer block mb-2',
                    isChecked && 'line-through text-gray-500'
                  )}
                >
                  {suggestion.text}
                </label>

                {/* Badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Category badge */}
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs border',
                      getCategoryColor(suggestion.category)
                    )}
                  >
                    {getCategoryLabel(suggestion.category)}
                  </Badge>
                </div>
              </div>

              {/* Action button */}
              {suggestion.actionable && suggestion.link && (
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="flex-shrink-0"
                >
                  <a
                    href={suggestion.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Voir plus d'informations"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
