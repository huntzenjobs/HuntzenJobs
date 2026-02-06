/**
 * ScoreBreakdownV2 - Enhanced score breakdown with labels and tooltips
 * Features: value labels, explanatory tooltips, staggered animations
 */

'use client'

import { Info } from 'lucide-react'
import { motion } from 'framer-motion'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

// ============================================================================
// TYPES
// ============================================================================

export interface BreakdownItem {
  label: string
  value: number
  max: number
  explanation?: string
  color?: string
}

interface ScoreBreakdownV2Props {
  breakdown: BreakdownItem[]
  className?: string
  animated?: boolean
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Default color palette if not provided
const DEFAULT_COLORS = [
  'from-blue-500 to-blue-600',
  'from-violet-500 to-violet-600',
  'from-green-500 to-green-600',
  'from-amber-500 to-amber-600',
  'from-rose-500 to-rose-600',
]

// Default explanations for common categories
const DEFAULT_EXPLANATIONS: Record<string, string> = {
  'Format': 'Qualité de la mise en page, lisibilité et structure du CV',
  'Mots-clés': 'Présence des mots-clés pertinents pour le poste visé',
  'Expérience': 'Clarté et pertinence des expériences professionnelles',
  'Compétences': 'Liste et organisation des compétences techniques et soft skills',
  'Formation': 'Diplômes, certifications et formations continues',
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ScoreBreakdownV2({
  breakdown,
  className = '',
  animated = true
}: ScoreBreakdownV2Props) {
  return (
    <TooltipProvider>
      <div className={`space-y-4 ${className}`}>
        {breakdown.map((item, idx) => {
          const percentage = (item.value / item.max) * 100
          const color = item.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length]
          const explanation = item.explanation || DEFAULT_EXPLANATIONS[item.label] || `Score pour ${item.label.toLowerCase()}`

          return (
            <div key={`${item.label}-${idx}`} className="space-y-2">
              {/* Header with label and value */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">
                    {item.label}
                  </span>
                  {explanation && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          className="text-gray-400 hover:text-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
                          aria-label={`Information sur ${item.label}`}
                        >
                          <Info className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="max-w-[250px] text-xs"
                      >
                        <p>{explanation}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>

                {/* Value display */}
                <div className="flex items-baseline gap-1">
                  <span className="text-sm font-bold text-gray-900">
                    {item.value}
                  </span>
                  <span className="text-xs text-gray-500">
                    / {item.max}
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="relative h-2.5 bg-gray-200 rounded-full overflow-hidden">
                {animated ? (
                  <motion.div
                    className={`h-full bg-gradient-to-r ${color} rounded-full`}
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{
                      duration: 0.6,
                      delay: idx * 0.1, // Staggered animation
                      ease: [0.16, 1, 0.3, 1], // Custom easing for smooth effect
                    }}
                  />
                ) : (
                  <div
                    className={`h-full bg-gradient-to-r ${color} rounded-full transition-all duration-500`}
                    style={{ width: `${percentage}%` }}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </TooltipProvider>
  )
}

// ============================================================================
// HELPER COMPONENT: Compact version for smaller displays
// ============================================================================

export function ScoreBreakdownCompact({
  breakdown,
  className = ''
}: {
  breakdown: BreakdownItem[]
  className?: string
}) {
  return (
    <div className={`grid grid-cols-2 gap-3 ${className}`}>
      {breakdown.map((item, idx) => {
        const percentage = (item.value / item.max) * 100
        const color = item.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length]

        return (
          <div
            key={`${item.label}-${idx}`}
            className="bg-gray-50 rounded-lg p-3 border border-gray-200"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-600">
                {item.label}
              </span>
              <span className="text-xs font-bold text-gray-900">
                {item.value}/{item.max}
              </span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full bg-gradient-to-r ${color} rounded-full transition-all duration-500`}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
