/**
 * VisuallyHidden Component
 * Hides content visually but keeps it accessible to screen readers
 * Use for icon-only buttons, decorative elements with semantic meaning, etc.
 */

import { cn } from '@/lib/utils'

interface VisuallyHiddenProps {
  children: React.ReactNode
  className?: string
  as?: React.ElementType
}

export function VisuallyHidden({
  children,
  className,
  as: Component = 'span',
}: VisuallyHiddenProps) {
  return (
    <Component className={cn('sr-only', className)}>
      {children}
    </Component>
  )
}
