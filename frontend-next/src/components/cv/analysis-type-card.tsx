/**
 * AnalysisTypeCard - Large clickable card for analysis type selection
 * PHP-style: icon, title, description, 3 bullet points
 * States: unselected (gray border) vs selected (blue border + ring + check)
 */

'use client'

import { Check, LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// ============================================================================
// TYPES
// ============================================================================

interface AnalysisTypeCardProps {
  icon: LucideIcon
  title: string
  description: string
  features: string[]
  selected: boolean
  onClick: () => void
  className?: string
}

// ============================================================================
// COMPONENT
// ============================================================================

export function AnalysisTypeCard({
  icon: Icon,
  title,
  description,
  features,
  selected,
  onClick,
  className
}: AnalysisTypeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative w-full min-h-[240px] p-6 rounded-xl',
        'border-2 transition-all duration-200',
        'text-left cursor-pointer',
        'hover:shadow-lg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2',
        selected
          ? 'border-huntzen-blue bg-blue-50 shadow-lg ring-4 ring-blue-100'
          : 'border-gray-200 bg-white hover:border-blue-300',
        className
      )}
    >
      {/* Check mark - top right (when selected) */}
      {selected && (
        <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-huntzen-blue flex items-center justify-center shadow-md">
          <Check className="h-4 w-4 text-white" strokeWidth={3} />
        </div>
      )}

      {/* Icon */}
      <div
        className={cn(
          'w-14 h-14 rounded-xl flex items-center justify-center mb-4 transition-all duration-200',
          selected
            ? 'bg-gradient-to-br from-huntzen-blue to-huntzen-turquoise shadow-md'
            : 'bg-gray-100'
        )}
      >
        <Icon
          className={cn(
            'h-7 w-7 transition-colors duration-200',
            selected ? 'text-white' : 'text-gray-600'
          )}
        />
      </div>

      {/* Title */}
      <h3
        className={cn(
          'text-xl font-bold mb-2 transition-colors duration-200',
          selected ? 'text-huntzen-blue' : 'text-gray-900'
        )}
      >
        {title}
      </h3>

      {/* Description */}
      <p className="text-sm text-gray-600 mb-4">{description}</p>

      {/* Features (bullet points) */}
      <ul className="space-y-2">
        {features.map((feature, index) => (
          <li key={index} className="flex items-start gap-2 text-sm">
            <span
              className={cn(
                'inline-block w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0',
                selected ? 'bg-huntzen-blue' : 'bg-gray-400'
              )}
            />
            <span className="text-gray-700">{feature}</span>
          </li>
        ))}
      </ul>
    </button>
  )
}
