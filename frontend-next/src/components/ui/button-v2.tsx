/**
 * ButtonV2 - Enhanced button component for HuntZen
 * Conversion-focused design with premium feel
 */

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// ============================================================================
// BUTTON VARIANTS - Conversion-Optimized Design
// ============================================================================

const buttonV2Variants = cva(
  // Base styles - Professional foundation
  [
    'inline-flex items-center justify-center gap-2',
    'font-semibold tracking-tight',
    'rounded-xl',
    'transition-all duration-250 ease-smooth',
    'outline-none',
    'focus-visible:ring-4 focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-60',
    'relative overflow-hidden',
    // Accessibility
    'select-none',
    // Prevent text selection on double-click
    'touch-manipulation',
    // Better mobile tap target
  ],
  {
    variants: {
      variant: {
        // PRIMARY - Main CTA (Ocean-Turquoise Gradient)
        primary: [
          'bg-gradient-ocean-turquoise text-white',
          'shadow-md hover:shadow-lg',
          'hover:-translate-y-0.5 active:translate-y-0',
          'focus-visible:ring-ocean-300',
          // Subtle shine effect on hover
          'before:absolute before:inset-0',
          'before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent',
          'before:translate-x-[-200%] hover:before:translate-x-[200%]',
          'before:transition-transform before:duration-700',
        ],

        // SECONDARY - Alternative action
        secondary: [
          'bg-white text-ocean-700',
          'border-2 border-gray-200',
          'shadow-sm hover:shadow-md',
          'hover:border-ocean-300 hover:bg-ocean-50',
          'focus-visible:ring-ocean-200',
        ],

        // PREMIUM - Freemium upgrade CTAs (Violet Gradient)
        premium: [
          'bg-gradient-royal text-white',
          'shadow-glow-violet',
          'hover:shadow-[0_0_30px_rgba(139,92,246,0.5)]',
          'hover:-translate-y-0.5 active:translate-y-0',
          'focus-visible:ring-violet-300',
          // Animated gradient
          'bg-[length:200%_100%] hover:bg-[position:100%_0]',
          'transition-all duration-500',
        ],

        // GHOST - Subtle actions
        ghost: [
          'text-gray-700 hover:text-ocean-700',
          'hover:bg-gray-100',
          'focus-visible:ring-gray-200',
        ],

        // DESTRUCTIVE - Delete, cancel actions
        destructive: [
          'bg-error text-white',
          'shadow-sm hover:shadow-md',
          'hover:bg-error-dark',
          'focus-visible:ring-error-light',
        ],

        // OUTLINE - Secondary emphasis
        outline: [
          'bg-transparent text-ocean-700',
          'border-2 border-ocean-500',
          'hover:bg-ocean-500 hover:text-white',
          'focus-visible:ring-ocean-200',
        ],
      },

      size: {
        xs: 'h-8 px-3 text-xs gap-1.5',
        sm: 'h-9 px-4 text-sm gap-2',
        md: 'h-11 px-5 text-base gap-2',
        lg: 'h-12 px-7 text-base gap-2.5',
        xl: 'h-14 px-8 text-lg gap-3',
        icon: 'size-10',
        'icon-sm': 'size-9',
        'icon-lg': 'size-12',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
)

// ============================================================================
// TYPES
// ============================================================================

export interface ButtonV2Props
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonV2Variants> {
  /** Render as child component */
  asChild?: boolean
  /** Show loading spinner */
  loading?: boolean
  /** Icon to display on the left */
  leftIcon?: React.ReactNode
  /** Icon to display on the right */
  rightIcon?: React.ReactNode
  /** Accessible label for loading state */
  loadingText?: string
}

// ============================================================================
// COMPONENT
// ============================================================================

const ButtonV2 = React.forwardRef<HTMLButtonElement, ButtonV2Props>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      asChild = false,
      loading = false,
      leftIcon,
      rightIcon,
      loadingText = 'Loading...',
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button'
    const isDisabled = disabled || loading

    return (
      <Comp
        className={cn(buttonV2Variants({ variant, size, className }))}
        ref={ref}
        disabled={isDisabled}
        aria-busy={loading}
        aria-label={loading ? loadingText : undefined}
        {...props}
      >
        {/* Loading spinner or left icon */}
        {loading ? (
          <Loader2
            className={cn(
              'animate-spin',
              size === 'xs' && 'size-3',
              size === 'sm' && 'size-4',
              (size === 'md' || !size) && 'size-4',
              size === 'lg' && 'size-5',
              size === 'xl' && 'size-5'
            )}
            aria-hidden="true"
          />
        ) : (
          leftIcon && (
            <span
              className={cn(
                'inline-flex shrink-0',
                size === 'xs' && '[&>svg]:size-3',
                size === 'sm' && '[&>svg]:size-4',
                (size === 'md' || !size) && '[&>svg]:size-4',
                size === 'lg' && '[&>svg]:size-5',
                size === 'xl' && '[&>svg]:size-5'
              )}
              aria-hidden="true"
            >
              {leftIcon}
            </span>
          )
        )}

        {/* Button text */}
        {!asChild && (
          <span
            className={cn(
              'inline-flex items-center',
              loading && 'opacity-70'
            )}
          >
            {children}
          </span>
        )}

        {/* Right icon (hidden during loading) */}
        {!loading && rightIcon && (
          <span
            className={cn(
              'inline-flex shrink-0',
              size === 'xs' && '[&>svg]:size-3',
              size === 'sm' && '[&>svg]:size-4',
              (size === 'md' || !size) && '[&>svg]:size-4',
              size === 'lg' && '[&>svg]:size-5',
              size === 'xl' && '[&>svg]:size-5'
            )}
            aria-hidden="true"
          >
            {rightIcon}
          </span>
        )}
      </Comp>
    )
  }
)

ButtonV2.displayName = 'ButtonV2'

// ============================================================================
// EXPORTS
// ============================================================================

export { ButtonV2, buttonV2Variants }
