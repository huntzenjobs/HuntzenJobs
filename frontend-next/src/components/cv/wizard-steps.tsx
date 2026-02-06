/**
 * WizardSteps - 3-step progress indicator for CV analysis wizard
 * Shows: pending (gray), current (blue ring), completed (green check)
 */

'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

// ============================================================================
// TYPES
// ============================================================================

interface WizardStepsProps {
  currentStep: 1 | 2 | 3
  className?: string
}

interface StepItem {
  number: 1 | 2 | 3
  label: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STEPS: StepItem[] = [
  { number: 1, label: 'Upload' },
  { number: 2, label: 'Type d\'analyse' },
  { number: 3, label: 'Résultats' }
]

// ============================================================================
// COMPONENT
// ============================================================================

export function WizardSteps({ currentStep, className }: WizardStepsProps) {
  const getStepStatus = (step: number): 'pending' | 'current' | 'completed' => {
    if (step < currentStep) return 'completed'
    if (step === currentStep) return 'current'
    return 'pending'
  }

  return (
    <div className={cn('flex items-center justify-center gap-2', className)}>
      {STEPS.map((step, index) => {
        const status = getStepStatus(step.number)
        const isLast = index === STEPS.length - 1

        return (
          <div key={step.number} className="flex items-center gap-2">
            {/* Step Circle */}
            <div className="flex flex-col items-center gap-2">
              {/* Circle */}
              <div
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300',
                  {
                    // Pending state
                    'bg-gray-200 text-gray-400': status === 'pending',
                    // Current state
                    'bg-huntzen-blue text-white ring-4 ring-blue-100 shadow-md': status === 'current',
                    // Completed state
                    'bg-green-500 text-white shadow-sm': status === 'completed'
                  }
                )}
              >
                {status === 'completed' ? (
                  <Check className="h-5 w-5" strokeWidth={3} />
                ) : (
                  <span className="text-sm font-bold">{step.number}</span>
                )}
              </div>

              {/* Label */}
              <span
                className={cn(
                  'text-xs font-medium transition-colors duration-300',
                  {
                    'text-gray-400': status === 'pending',
                    'text-huntzen-blue font-semibold': status === 'current',
                    'text-green-600': status === 'completed'
                  }
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connector */}
            {!isLast && (
              <div
                className={cn(
                  'w-12 h-1 rounded-full transition-all duration-300 mb-6',
                  {
                    'bg-gray-200': status === 'pending',
                    'bg-huntzen-blue': status === 'current',
                    'bg-green-500': status === 'completed'
                  }
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
