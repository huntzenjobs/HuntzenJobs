/**
 * Animation Utilities for HuntZen JobSearch
 * Performance-optimized animations and micro-interactions
 */

import { transitions } from './design-tokens'

// ============================================================================
// CSS CLASS UTILITIES
// ============================================================================

/**
 * Common animation classes for use with className
 */
export const animationClasses = {
  // Optimistic UI feedback
  optimisticPulse: 'animate-pulse',

  // Loading states
  spin: 'animate-spin',
  ping: 'animate-ping',
  bounce: 'animate-bounce',

  // Skeleton loaders
  skeleton: 'animate-pulse bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%]',

  // Micro-interactions
  scaleOnHover: 'transition-transform hover:scale-[1.02] active:scale-[0.98]',
  liftOnHover: 'transition-all hover:-translate-y-1 hover:shadow-lg',
  glowOnHover: 'transition-shadow hover:shadow-glow-blue',

  // Page transitions
  slideUpOnEnter: 'animate-slide-in-up',
  fadeInOnEnter: 'animate-fade-in',

  // Reduced motion support
  reducedMotion: 'motion-reduce:transition-none motion-reduce:animation-none',
} as const

// ============================================================================
// STAGGER ANIMATIONS
// ============================================================================

/**
 * Generate staggered animation delay for list items
 * @param index - Item index in the list
 * @param delayMs - Base delay in milliseconds (default: 60ms)
 * @param maxDelay - Maximum delay cap in milliseconds (default: 500ms)
 * @returns CSS style object with animation delay
 *
 * @example
 * <div style={getStaggerDelay(0)}>First item</div>
 * <div style={getStaggerDelay(1)}>Second item (60ms delay)</div>
 * <div style={getStaggerDelay(2)}>Third item (120ms delay)</div>
 */
export const getStaggerDelay = (
  index: number,
  delayMs: number = 60,
  maxDelay: number = 500
): React.CSSProperties => ({
  animationDelay: `${Math.min(index * delayMs, maxDelay)}ms`,
})

/**
 * Generate staggered transition delay
 * Useful for fade-in effects on lists
 */
export const getStaggerTransition = (
  index: number,
  delayMs: number = 60,
  maxDelay: number = 500
): React.CSSProperties => ({
  transitionDelay: `${Math.min(index * delayMs, maxDelay)}ms`,
})

// ============================================================================
// ANIMATION PRESETS
// ============================================================================

/**
 * Predefined animation configurations
 */
export const animationPresets = {
  // Fast micro-interactions
  quickHover: {
    transition: `all ${transitions.duration.fast} ${transitions.easing.snappy}`,
  },

  // Standard UI transitions
  standard: {
    transition: `all ${transitions.duration.normal} ${transitions.easing.smooth}`,
  },

  // Smooth, delightful transitions
  smooth: {
    transition: `all ${transitions.duration.slow} ${transitions.easing.smooth}`,
  },

  // Bouncy, playful animations
  spring: {
    transition: `all ${transitions.duration.normal} ${transitions.easing.spring}`,
  },

  // Elastic, attention-grabbing
  elastic: {
    transition: `all ${transitions.duration.slow} ${transitions.easing.elastic}`,
  },
} as const

// ============================================================================
// PERFORMANCE OPTIMIZATIONS
// ============================================================================

/**
 * Force GPU acceleration for smooth animations
 * Use sparingly - only for frequently animated elements
 */
export const gpuAcceleration: React.CSSProperties = {
  transform: 'translateZ(0)',
  willChange: 'transform',
  backfaceVisibility: 'hidden',
  perspective: 1000,
}

/**
 * Optimize for transform animations
 */
export const transformOptimized: React.CSSProperties = {
  willChange: 'transform',
}

/**
 * Optimize for opacity animations
 */
export const opacityOptimized: React.CSSProperties = {
  willChange: 'opacity',
}

// ============================================================================
// LOADING STATES
// ============================================================================

/**
 * Skeleton loader configuration
 * @param width - Width of the skeleton (default: '100%')
 * @param height - Height of the skeleton (default: '1rem')
 * @returns CSS class string and inline styles
 *
 * @example
 * <div className={skeletonConfig().className} style={skeletonConfig().style} />
 */
export const skeletonConfig = (
  width: string = '100%',
  height: string = '1rem'
) => ({
  className: 'animate-pulse bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 rounded',
  style: {
    width,
    height,
    backgroundSize: '200% 100%',
  } as React.CSSProperties,
})

/**
 * Shimmer effect for loading cards
 */
export const shimmerEffect: React.CSSProperties = {
  background: 'linear-gradient(90deg, #f0f0f0 0%, #e0e0e0 20%, #f0f0f0 40%, #f0f0f0 100%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s infinite',
}

// ============================================================================
// ENTRANCE ANIMATIONS
// ============================================================================

/**
 * Fade in animation config
 */
export const fadeIn = (duration: string = transitions.duration.normal): React.CSSProperties => ({
  animation: `fadeIn ${duration} ${transitions.easing.easeOut}`,
})

/**
 * Slide up entrance animation
 */
export const slideInUp = (duration: string = transitions.duration.normal): React.CSSProperties => ({
  animation: `slideInUp ${duration} ${transitions.easing.smooth}`,
})

/**
 * Slide down entrance animation
 */
export const slideInDown = (duration: string = transitions.duration.normal): React.CSSProperties => ({
  animation: `slideInDown ${duration} ${transitions.easing.smooth}`,
})

/**
 * Scale in entrance animation
 */
export const scaleIn = (duration: string = transitions.duration.normal): React.CSSProperties => ({
  animation: `scaleIn ${duration} ${transitions.easing.spring}`,
})

// ============================================================================
// SCROLL-TRIGGERED ANIMATIONS
// ============================================================================

/**
 * Check if an element is in viewport
 * Useful for triggering animations on scroll
 */
export const isInViewport = (element: HTMLElement): boolean => {
  const rect = element.getBoundingClientRect()
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  )
}

/**
 * Observer for scroll-triggered animations
 * @param callback - Function to call when element enters viewport
 * @param threshold - Percentage of element visible to trigger (default: 0.1)
 * @returns IntersectionObserver instance
 *
 * @example
 * const observer = createScrollObserver((entries) => {
 *   entries.forEach(entry => {
 *     if (entry.isIntersecting) {
 *       entry.target.classList.add('animate-fade-in')
 *     }
 *   })
 * })
 *
 * observer.observe(elementRef.current)
 */
export const createScrollObserver = (
  callback: IntersectionObserverCallback,
  threshold: number = 0.1
): IntersectionObserver => {
  return new IntersectionObserver(callback, {
    threshold,
    rootMargin: '50px',
  })
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Debounce function for performance optimization
 * Useful for scroll and resize handlers
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

/**
 * Throttle function for performance optimization
 * Ensures function is called at most once per specified time
 */
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean = false

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

/**
 * Request animation frame wrapper for smooth animations
 */
export const raf = (callback: FrameRequestCallback): number => {
  return window.requestAnimationFrame(callback)
}

/**
 * Cancel animation frame
 */
export const cancelRaf = (id: number): void => {
  window.cancelAnimationFrame(id)
}

// ============================================================================
// ACCESSIBILITY
// ============================================================================

/**
 * Check if user prefers reduced motion
 * @returns boolean indicating if reduced motion is preferred
 */
export const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Conditional animation class
 * Returns animation class only if user doesn't prefer reduced motion
 */
export const animateIf = (animationClass: string): string => {
  return prefersReducedMotion() ? '' : animationClass
}

/**
 * Animation duration respecting user preferences
 * Returns 0ms if reduced motion is preferred
 */
export const respectMotionPreference = (duration: string): string => {
  return prefersReducedMotion() ? '0ms' : duration
}

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type AnimationClasses = typeof animationClasses
export type AnimationPresets = typeof animationPresets
