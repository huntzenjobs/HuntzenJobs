/**
 * Feature Flags for HuntZen JobSearch
 * Enables progressive rollout and A/B testing
 */

// ============================================================================
// FEATURE FLAGS CONFIGURATION
// ============================================================================

/**
 * Feature flags for progressive deployment
 * Set via environment variables for easy control
 */
export const featureFlags = {
  // ==========================================================================
  // UI/UX REFACTOR FLAGS
  // ==========================================================================

  /**
   * Enable new Jobs page V2 with inline form and gradient cards
   * - Inline search form (horizontal layout)
   * - Gradient job cards (replaces blur)
   * - Progressive grid (1→2→3→4 cols)
   * - Improved autocomplete with loading states
   */
  useJobsV2: process.env.NEXT_PUBLIC_FF_JOBS_V2 === 'true',

  /**
   * Enable new Coach page V2 with improved UX
   * - Welcome screen for new sessions
   * - Expandable textarea
   * - Message timestamps
   * - Prominent timer with alerts
   * - Collapsible sidebar
   */
  useCoachV2: process.env.NEXT_PUBLIC_FF_COACH_V2 === 'true',

  /**
   * Enable new CV Analysis page V2
   * - Compact upload zone
   * - Faster score animation (750ms)
   * - Breakdown with value labels
   * - Actionable suggestions
   */
  useCVAnalysisV2: process.env.NEXT_PUBLIC_FF_CV_V2 === 'true',

  // ==========================================================================
  // ADVANCED FEATURES FLAGS
  // ==========================================================================

  /**
   * Enable CV comparison feature
   * - Compare multiple CV versions
   * - Visual diff highlighting
   * - Improvements tracking
   * - Export comparison report
   */
  enableCVComparison: process.env.NEXT_PUBLIC_FF_CV_COMPARISON === 'true',

  /**
   * Enable Coach conversation history
   * - Save conversation history
   * - Search past conversations
   * - Export to PDF/Markdown
   * - Resume previous sessions
   */
  enableCoachHistory: process.env.NEXT_PUBLIC_FF_COACH_HISTORY === 'true',

  /**
   * Enable advanced job filters
   * - Salary range slider
   * - Remote work filter
   * - Experience level
   * - Contract type
   * - Company size
   */
  enableAdvancedFilters: process.env.NEXT_PUBLIC_FF_ADVANCED_FILTERS === 'true',

  /**
   * Enable interview simulation mode
   * - Mock interview questions
   * - Real-time scoring
   * - Feedback and tips
   * - Replay saved interviews
   */
  enableInterviewMode: process.env.NEXT_PUBLIC_FF_INTERVIEW_MODE === 'true',

  // ==========================================================================
  // FREEMIUM OPTIMIZATION FLAGS
  // ==========================================================================

  /**
   * Enable new upgrade teasers
   * - Contextual upgrade prompts
   * - Feature preview modals
   * - Social proof elements
   * - Optimized CTAs
   */
  enableUpgradeTeasers: process.env.NEXT_PUBLIC_FF_UPGRADE_TEASERS === 'true',

  /**
   * Enable pricing modal V2
   * - Interactive feature comparison
   * - Testimonials
   * - Optimized layout
   * - A/B test variants
   */
  usePricingModalV2: process.env.NEXT_PUBLIC_FF_PRICING_MODAL_V2 === 'true',

  // ==========================================================================
  // PERFORMANCE & TESTING FLAGS
  // ==========================================================================

  /**
   * Enable performance monitoring
   * - Lighthouse metrics tracking
   * - Core Web Vitals
   * - Custom performance marks
   */
  enablePerformanceMonitoring: process.env.NEXT_PUBLIC_FF_PERF_MONITORING === 'true',

  /**
   * Enable analytics tracking
   * - Conversion events
   * - User behavior tracking
   * - A/B test metrics
   */
  enableAnalytics: process.env.NEXT_PUBLIC_FF_ANALYTICS === 'true',

  /**
   * Enable debug mode
   * - Show feature flag states
   * - Console logging
   * - Performance metrics in UI
   */
  enableDebugMode: process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_FF_DEBUG === 'true',
} as const

// ============================================================================
// FEATURE FLAG UTILITIES
// ============================================================================

/**
 * Check if a feature is enabled
 * @param feature - Feature flag key
 * @returns boolean indicating if feature is enabled
 */
export const isFeatureEnabled = (feature: keyof typeof featureFlags): boolean => {
  return featureFlags[feature]
}

/**
 * Get all enabled features
 * @returns Array of enabled feature keys
 */
export const getEnabledFeatures = (): Array<keyof typeof featureFlags> => {
  return Object.entries(featureFlags)
    .filter(([_, enabled]) => enabled)
    .map(([key]) => key as keyof typeof featureFlags)
}

/**
 * Get all feature flags as object
 * Useful for debugging and monitoring
 */
export const getAllFeatureFlags = (): typeof featureFlags => {
  return { ...featureFlags }
}

// ============================================================================
// A/B TESTING UTILITIES
// ============================================================================

/**
 * A/B test variant type
 */
export type ABTestVariant = 'A' | 'B'

/**
 * Get A/B test variant for user
 * Uses deterministic hash of user ID to ensure consistency
 * @param userId - User ID (or any unique identifier)
 * @param testName - Name of the A/B test
 * @returns 'A' or 'B' variant
 */
export const getABTestVariant = (userId: string, testName: string): ABTestVariant => {
  // Simple hash function for deterministic variant assignment
  const hash = simpleHash(`${userId}-${testName}`)
  return hash % 2 === 0 ? 'A' : 'B'
}

/**
 * Simple hash function for string
 * @param str - String to hash
 * @returns Numeric hash
 */
const simpleHash = (str: string): number => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash)
}

/**
 * Traffic percentage rollout
 * @param userId - User ID
 * @param percentage - Percentage of users to enable (0-100)
 * @returns boolean indicating if user is in rollout
 */
export const isInRollout = (userId: string, percentage: number): boolean => {
  const hash = simpleHash(userId)
  return (hash % 100) < percentage
}

// ============================================================================
// ROLLOUT CONFIGURATION
// ============================================================================

/**
 * Rollout percentages for progressive deployment
 * Adjust these values to control rollout speed
 */
export const rolloutConfig = {
  // Jobs V2 rollout
  jobsV2: {
    phase1: 10,  // 10% of users
    phase2: 50,  // 50% of users
    phase3: 100, // 100% (full rollout)
  },

  // Coach V2 rollout
  coachV2: {
    phase1: 10,
    phase2: 50,
    phase3: 100,
  },

  // CV Analysis V2 rollout
  cvAnalysisV2: {
    phase1: 10,
    phase2: 50,
    phase3: 100,
  },
} as const

/**
 * Get current rollout phase
 * Set via environment variable
 */
export const getCurrentPhase = (): 'phase1' | 'phase2' | 'phase3' => {
  const phase = process.env.NEXT_PUBLIC_ROLLOUT_PHASE
  if (phase === 'phase2') return 'phase2'
  if (phase === 'phase3') return 'phase3'
  return 'phase1'
}

/**
 * Check if user should see feature based on rollout percentage
 * @param userId - User ID
 * @param feature - Feature name from rolloutConfig
 * @returns boolean indicating if user should see feature
 */
export const shouldEnableForUser = (
  userId: string,
  feature: keyof typeof rolloutConfig
): boolean => {
  const phase = getCurrentPhase()
  const percentage = rolloutConfig[feature][phase]
  return isInRollout(userId, percentage)
}

// ============================================================================
// DEBUG UTILITIES
// ============================================================================

/**
 * Log feature flag state (debug mode only)
 */
export const logFeatureFlags = (): void => {
  if (!featureFlags.enableDebugMode) return

  console.group('🚩 Feature Flags')
  console.table(featureFlags)
  console.groupEnd()
}

/**
 * Log rollout configuration (debug mode only)
 */
export const logRolloutConfig = (userId: string): void => {
  if (!featureFlags.enableDebugMode) return

  const phase = getCurrentPhase()

  console.group(`📊 Rollout Configuration (Phase: ${phase})`)
  console.log('User ID:', userId)
  console.log('Jobs V2:', shouldEnableForUser(userId, 'jobsV2') ? '✅ Enabled' : '❌ Disabled')
  console.log('Coach V2:', shouldEnableForUser(userId, 'coachV2') ? '✅ Enabled' : '❌ Disabled')
  console.log('CV Analysis V2:', shouldEnableForUser(userId, 'cvAnalysisV2') ? '✅ Enabled' : '❌ Disabled')
  console.groupEnd()
}

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type FeatureFlags = typeof featureFlags
export type FeatureFlagKey = keyof typeof featureFlags
export type RolloutConfig = typeof rolloutConfig
export type RolloutPhase = 'phase1' | 'phase2' | 'phase3'
