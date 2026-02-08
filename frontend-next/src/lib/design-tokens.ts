/**
 * HuntZen JobSearch Design System
 * A sophisticated, conversion-focused design token system
 * Optimized for freemium-to-premium conversion and professional aesthetics
 */

// ============================================================================
// CORE COLOR PALETTE
// ============================================================================

export const colors = {
  // Brand Identity - Professional yet approachable
  brand: {
    // Primary: Deep Ocean Blue - Trust, professionalism, stability
    ocean: {
      50: '#eff6ff',
      100: '#dbeafe',
      200: '#bfdbfe',
      300: '#93c5fd',
      400: '#60a5fa',
      500: '#2563eb', // Main brand color
      600: '#1d4ed8',
      700: '#1e40af',
      800: '#1e3a8a',
      900: '#1e293b',
      950: '#0f172a',
    },
    // Secondary: Electric Turquoise - Energy, innovation, action
    turquoise: {
      50: '#ecfeff',
      100: '#cffafe',
      200: '#a5f3fc',
      300: '#67e8f9',
      400: '#22d3ee',
      500: '#00d4aa', // Main secondary color
      600: '#00b894',
      700: '#009b7d',
      800: '#047857',
      900: '#065f46',
    },
  },

  // Freemium & Monetization - Premium feel
  premium: {
    // Purple gradient - Luxury, exclusivity, premium features
    violet: {
      50: '#faf5ff',
      100: '#f3e8ff',
      200: '#e9d5ff',
      300: '#d8b4fe',
      400: '#c084fc',
      500: '#a855f7',
      600: '#9333ea',
      700: '#7e22ce',
      800: '#6b21a8',
      900: '#581c87',
    },
    amethyst: {
      500: '#8b5cf6',
      600: '#7c3aed',
      700: '#6d28d9',
    },
    // Gold accent - Value, achievement
    gold: {
      400: '#fbbf24',
      500: '#f59e0b',
      600: '#d97706',
    },
  },

  // Semantic Colors - Feedback & Status
  feedback: {
    success: {
      light: '#d1fae5',
      DEFAULT: '#10b981',
      dark: '#059669',
      glow: 'rgba(16, 185, 129, 0.2)',
    },
    warning: {
      light: '#fef3c7',
      DEFAULT: '#f59e0b',
      dark: '#d97706',
      glow: 'rgba(245, 158, 11, 0.2)',
    },
    error: {
      light: '#fee2e2',
      DEFAULT: '#ef4444',
      dark: '#dc2626',
      glow: 'rgba(239, 68, 68, 0.2)',
    },
    info: {
      light: '#dbeafe',
      DEFAULT: '#3b82f6',
      dark: '#2563eb',
      glow: 'rgba(59, 130, 246, 0.2)',
    },
  },

  // Neutral Palette - Sophisticated grays with warmth
  neutral: {
    white: '#ffffff',
    50: '#fafafa',
    100: '#f5f5f5',
    200: '#e5e5e5',
    300: '#d4d4d4',
    400: '#a3a3a3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
    950: '#0a0a0a',
    black: '#000000',
  },

  // Surface Colors - Layering system
  surface: {
    base: '#ffffff',
    elevated: '#fafafa',
    overlay: '#f5f5f5',
    dimmed: 'rgba(0, 0, 0, 0.5)',
    glassmorphism: 'rgba(255, 255, 255, 0.8)',
  },
} as const

// ============================================================================
// GRADIENTS - Premium & Conversion-Focused
// ============================================================================

export const gradients = {
  // Primary brand gradient - CTAs, buttons
  brand: {
    ocean: 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)',
    oceanToTurquoise: 'linear-gradient(135deg, #2563eb 0%, #00d4aa 100%)',
    turquoiseToOcean: 'linear-gradient(135deg, #00d4aa 0%, #2563eb 100%)',
  },

  // Premium gradients - Freemium upsells
  premium: {
    violet: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)',
    amethyst: 'linear-gradient(135deg, #7c3aed 0%, #9333ea 100%)',
    royal: 'linear-gradient(135deg, #6d28d9 0%, #8b5cf6 50%, #a855f7 100%)',
    goldAccent: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
  },

  // Subtle backgrounds - Cards, sections
  subtle: {
    gray: 'linear-gradient(180deg, #fafafa 0%, #f5f5f5 100%)',
    blueGlow: 'linear-gradient(180deg, #eff6ff 0%, #ffffff 100%)',
    turquoiseGlow: 'linear-gradient(180deg, #ecfeff 0%, #ffffff 100%)',
    violetGlow: 'linear-gradient(180deg, #faf5ff 0%, #ffffff 100%)',
  },

  // Gradient overlays - Locked content
  overlay: {
    fadeTop: 'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,1) 100%)',
    fadeBottom: 'linear-gradient(0deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,1) 100%)',
    radialBlur: 'radial-gradient(circle, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.95) 100%)',
  },

  // Mesh gradients - Hero sections, backgrounds
  mesh: {
    heroBlue: 'radial-gradient(at 0% 0%, #2563eb 0%, transparent 50%), radial-gradient(at 100% 100%, #00d4aa 0%, transparent 50%)',
    heroViolet: 'radial-gradient(at 0% 0%, #8b5cf6 0%, transparent 50%), radial-gradient(at 100% 100%, #a855f7 0%, transparent 50%)',
  },
} as const

// ============================================================================
// SPACING SCALE - 4px base unit
// ============================================================================

export const spacing = {
  px: '1px',
  0: '0',
  0.5: '0.125rem',   // 2px
  1: '0.25rem',      // 4px  - xs
  2: '0.5rem',       // 8px  - sm
  3: '0.75rem',      // 12px
  4: '1rem',         // 16px - md (base)
  5: '1.25rem',      // 20px
  6: '1.5rem',       // 24px - lg
  7: '1.75rem',      // 28px
  8: '2rem',         // 32px - xl
  9: '2.25rem',      // 36px
  10: '2.5rem',      // 40px
  11: '2.75rem',     // 44px
  12: '3rem',        // 48px - 2xl
  14: '3.5rem',      // 56px
  16: '4rem',        // 64px - 3xl
  20: '5rem',        // 80px
  24: '6rem',        // 96px
  28: '7rem',        // 112px
  32: '8rem',        // 128px
  36: '9rem',        // 144px
  40: '10rem',       // 160px
  44: '11rem',       // 176px
  48: '12rem',       // 192px
  52: '13rem',       // 208px
  56: '14rem',       // 224px
  60: '15rem',       // 240px
  64: '16rem',       // 256px
  72: '18rem',       // 288px
  80: '20rem',       // 320px
  96: '24rem',       // 384px
} as const

// ============================================================================
// TYPOGRAPHY SYSTEM - Clean, professional, highly readable
// ============================================================================

export const typography = {
  // Font families
  fontFamily: {
    // NOTE: Using Inter for now per requirements, but consider upgrading to:
    // - GT Walsheim / Plus Jakarta Sans (modern, friendly professional)
    // - Geist / Figtree (clean, contemporary)
    // - Sora / Outfit (distinctive, tech-forward)
    sans: ['Inter var', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
    mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'Monaco', 'monospace'],
  },

  // Font sizes with line heights
  fontSize: {
    xs: ['0.75rem', { lineHeight: '1rem' }],       // 12px
    sm: ['0.875rem', { lineHeight: '1.25rem' }],   // 14px
    base: ['1rem', { lineHeight: '1.5rem' }],      // 16px
    lg: ['1.125rem', { lineHeight: '1.75rem' }],   // 18px
    xl: ['1.25rem', { lineHeight: '1.75rem' }],    // 20px
    '2xl': ['1.5rem', { lineHeight: '2rem' }],     // 24px
    '3xl': ['1.875rem', { lineHeight: '2.25rem' }],// 30px
    '4xl': ['2.25rem', { lineHeight: '2.5rem' }],  // 36px
    '5xl': ['3rem', { lineHeight: '1' }],          // 48px
    '6xl': ['3.75rem', { lineHeight: '1' }],       // 60px
    '7xl': ['4.5rem', { lineHeight: '1' }],        // 72px
    '8xl': ['6rem', { lineHeight: '1' }],          // 96px
    '9xl': ['8rem', { lineHeight: '1' }],          // 128px
  },

  // Font weights
  fontWeight: {
    thin: 100,
    extralight: 200,
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
    black: 900,
  },

  // Letter spacing
  letterSpacing: {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0em',
    wide: '0.025em',
    wider: '0.05em',
    widest: '0.1em',
  },

  // Line heights
  lineHeight: {
    none: '1',
    tight: '1.25',
    snug: '1.375',
    normal: '1.5',
    relaxed: '1.625',
    loose: '2',
  },
} as const

// ============================================================================
// BORDER RADIUS - Soft, modern, friendly
// ============================================================================

export const radius = {
  none: '0',
  sm: '0.375rem',    // 6px
  DEFAULT: '0.5rem', // 8px
  md: '0.625rem',    // 10px (matches shadcn --radius)
  lg: '0.75rem',     // 12px
  xl: '1rem',        // 16px
  '2xl': '1.25rem',  // 20px
  '3xl': '1.5rem',   // 24px
  full: '9999px',
} as const

// ============================================================================
// SHADOWS - Depth and elevation
// ============================================================================

export const shadows = {
  // Subtle depth
  xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  sm: '0 2px 8px rgba(15, 23, 42, 0.08)',

  // Standard elevation
  DEFAULT: '0 4px 12px rgba(15, 23, 42, 0.1)',
  md: '0 4px 16px rgba(15, 23, 42, 0.12)',
  lg: '0 10px 40px rgba(15, 23, 42, 0.15)',
  xl: '0 20px 50px rgba(15, 23, 42, 0.2)',

  // Dramatic depth
  '2xl': '0 25px 60px rgba(15, 23, 42, 0.25)',

  // Glow effects - for CTAs and premium features
  glow: {
    blue: '0 0 20px rgba(37, 99, 235, 0.3)',
    turquoise: '0 0 20px rgba(0, 212, 170, 0.3)',
    violet: '0 0 24px rgba(139, 92, 246, 0.4)',
    gold: '0 0 20px rgba(245, 158, 11, 0.35)',
  },

  // Inner shadows - inputs, wells
  inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',

  // No shadow
  none: 'none',
} as const

// ============================================================================
// TRANSITIONS - Smooth, purposeful animations
// ============================================================================

export const transitions = {
  // Durations
  duration: {
    instant: '75ms',
    fast: '150ms',
    normal: '250ms',
    slow: '400ms',
    slower: '600ms',
    slowest: '1000ms',
  },

  // Easing functions - Natural, organic motion
  easing: {
    // Standard easings
    linear: 'linear',
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',

    // Custom easings - More character
    smooth: 'cubic-bezier(0.16, 1, 0.3, 1)',      // Smooth deceleration
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',  // Bouncy spring
    snappy: 'cubic-bezier(0.4, 0, 0.2, 1)',       // Quick & precise
    elastic: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)', // Elastic bounce
  },

  // Common transition properties
  property: {
    all: 'all',
    colors: 'background-color, border-color, color, fill, stroke',
    opacity: 'opacity',
    shadow: 'box-shadow',
    transform: 'transform',
  },
} as const

// ============================================================================
// Z-INDEX LAYERS - Proper stacking context
// ============================================================================

export const zIndex = {
  base: 0,
  dropdown: 1000,
  sticky: 1020,
  fixed: 1030,
  modalBackdrop: 1040,
  modal: 1050,
  popover: 1060,
  tooltip: 1070,
  toast: 1080,
  max: 9999,
} as const

// ============================================================================
// BREAKPOINTS - Responsive design (matches Tailwind defaults)
// ============================================================================

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const

// ============================================================================
// COMPONENT VARIANTS - Reusable component patterns
// ============================================================================

export const componentVariants = {
  // Button variants
  button: {
    // Sizes
    size: {
      xs: {
        height: '2rem',        // 32px
        padding: '0 0.75rem',  // 12px
        fontSize: '0.875rem',  // 14px
        gap: '0.375rem',       // 6px
      },
      sm: {
        height: '2.25rem',     // 36px
        padding: '0 1rem',     // 16px
        fontSize: '0.875rem',  // 14px
        gap: '0.5rem',         // 8px
      },
      md: {
        height: '2.75rem',     // 44px
        padding: '0 1.25rem',  // 20px
        fontSize: '1rem',      // 16px
        gap: '0.5rem',         // 8px
      },
      lg: {
        height: '3rem',        // 48px
        padding: '0 1.75rem',  // 28px
        fontSize: '1rem',      // 16px
        gap: '0.625rem',       // 10px
      },
      xl: {
        height: '3.5rem',      // 56px
        padding: '0 2rem',     // 32px
        fontSize: '1.125rem',  // 18px
        gap: '0.75rem',        // 12px
      },
    },

    // Visual variants
    variant: {
      primary: {
        background: gradients.brand.oceanToTurquoise,
        color: colors.neutral.white,
        border: 'none',
        shadow: shadows.md,
        hover: {
          shadow: shadows.lg,
          transform: 'translateY(-1px)',
        },
      },
      secondary: {
        background: colors.neutral.white,
        color: colors.brand.ocean[600],
        border: `2px solid ${colors.neutral[200]}`,
        shadow: shadows.sm,
        hover: {
          border: `2px solid ${colors.brand.ocean[300]}`,
          shadow: shadows.md,
        },
      },
      premium: {
        background: gradients.premium.royal,
        color: colors.neutral.white,
        border: 'none',
        shadow: shadows.glow.violet,
        hover: {
          shadow: `${shadows.lg}, ${shadows.glow.violet}`,
          transform: 'translateY(-1px)',
        },
      },
      ghost: {
        background: 'transparent',
        color: colors.neutral[700],
        border: 'none',
        hover: {
          background: colors.neutral[100],
        },
      },
      destructive: {
        background: colors.feedback.error.DEFAULT,
        color: colors.neutral.white,
        border: 'none',
        shadow: shadows.sm,
        hover: {
          background: colors.feedback.error.dark,
          shadow: shadows.md,
        },
      },
    },
  },

  // Card variants
  card: {
    variant: {
      default: {
        background: colors.surface.base,
        border: `2px solid ${colors.neutral[200]}`,
        borderRadius: radius.xl,
        shadow: shadows.sm,
      },
      elevated: {
        background: colors.surface.base,
        border: `2px solid ${colors.neutral[200]}`,
        borderRadius: radius.xl,
        shadow: shadows.md,
      },
      interactive: {
        background: colors.surface.base,
        border: `2px solid ${colors.neutral[200]}`,
        borderRadius: radius.xl,
        shadow: shadows.sm,
        hover: {
          border: `2px solid ${colors.brand.ocean[300]}`,
          shadow: shadows.lg,
          transform: 'translateY(-2px)',
        },
      },
      premium: {
        background: gradients.subtle.violetGlow,
        border: `2px solid ${colors.premium.violet[200]}`,
        borderRadius: radius.xl,
        shadow: shadows.md,
      },
      gradient: {
        background: 'linear-gradient(135deg, #fafafa 0%, #ffffff 50%, #f5f5f5 100%)',
        border: `2px dashed ${colors.premium.violet[200]}`,
        borderRadius: radius.xl,
        shadow: 'none',
      },
    },

    padding: {
      sm: spacing[4],   // 16px
      md: spacing[6],   // 24px
      lg: spacing[8],   // 32px
      xl: spacing[12],  // 48px
    },
  },

  // Input variants
  input: {
    size: {
      sm: {
        height: '2.25rem',     // 36px
        padding: '0 0.75rem',  // 12px
        fontSize: '0.875rem',  // 14px
      },
      md: {
        height: '2.75rem',     // 44px
        padding: '0 1rem',     // 16px
        fontSize: '1rem',      // 16px
      },
      lg: {
        height: '3rem',        // 48px
        padding: '0 1.25rem',  // 20px
        fontSize: '1rem',      // 16px
      },
    },

    state: {
      default: {
        border: `2px solid ${colors.neutral[200]}`,
        background: colors.neutral.white,
        color: colors.neutral[900],
        focus: {
          border: `2px solid ${colors.brand.ocean[500]}`,
          shadow: shadows.glow.blue,
        },
      },
      error: {
        border: `2px solid ${colors.feedback.error.light}`,
        background: colors.neutral.white,
        color: colors.neutral[900],
        focus: {
          border: `2px solid ${colors.feedback.error.DEFAULT}`,
          shadow: shadows.glow.blue,
        },
      },
      success: {
        border: `2px solid ${colors.feedback.success.light}`,
        background: colors.neutral.white,
        color: colors.neutral[900],
        focus: {
          border: `2px solid ${colors.feedback.success.DEFAULT}`,
          shadow: shadows.glow.blue,
        },
      },
      disabled: {
        border: `2px solid ${colors.neutral[100]}`,
        background: colors.neutral[50],
        color: colors.neutral[400],
        cursor: 'not-allowed',
        opacity: 0.6,
      },
    },
  },

  // Badge variants
  badge: {
    variant: {
      default: {
        background: colors.neutral[100],
        color: colors.neutral[700],
        border: `1px solid ${colors.neutral[200]}`,
      },
      primary: {
        background: colors.brand.ocean[100],
        color: colors.brand.ocean[700],
        border: `1px solid ${colors.brand.ocean[200]}`,
      },
      premium: {
        background: gradients.premium.violet,
        color: colors.neutral.white,
        border: 'none',
      },
      success: {
        background: colors.feedback.success.light,
        color: colors.feedback.success.dark,
        border: `1px solid ${colors.feedback.success.DEFAULT}`,
      },
      warning: {
        background: colors.feedback.warning.light,
        color: colors.feedback.warning.dark,
        border: `1px solid ${colors.feedback.warning.DEFAULT}`,
      },
      error: {
        background: colors.feedback.error.light,
        color: colors.feedback.error.dark,
        border: `1px solid ${colors.feedback.error.DEFAULT}`,
      },
    },
  },
} as const

// ============================================================================
// ANIMATION PRESETS - Common animations
// ============================================================================

export const animations = {
  // Fade animations
  fadeIn: {
    opacity: [0, 1],
    duration: transitions.duration.normal,
    easing: transitions.easing.easeOut,
  },
  fadeOut: {
    opacity: [1, 0],
    duration: transitions.duration.normal,
    easing: transitions.easing.easeIn,
  },

  // Slide animations
  slideInUp: {
    transform: ['translateY(20px)', 'translateY(0)'],
    opacity: [0, 1],
    duration: transitions.duration.normal,
    easing: transitions.easing.smooth,
  },
  slideInDown: {
    transform: ['translateY(-20px)', 'translateY(0)'],
    opacity: [0, 1],
    duration: transitions.duration.normal,
    easing: transitions.easing.smooth,
  },

  // Scale animations
  scaleIn: {
    transform: ['scale(0.95)', 'scale(1)'],
    opacity: [0, 1],
    duration: transitions.duration.normal,
    easing: transitions.easing.spring,
  },

  // Skeleton loader
  skeleton: {
    background: `linear-gradient(90deg, ${colors.neutral[200]} 0%, ${colors.neutral[100]} 50%, ${colors.neutral[200]} 100%)`,
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s infinite',
  },

  // Pulse (for attention)
  pulse: {
    animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  },
} as const

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type Colors = typeof colors
export type Gradients = typeof gradients
export type Spacing = typeof spacing
export type Typography = typeof typography
export type Radius = typeof radius
export type Shadows = typeof shadows
export type Transitions = typeof transitions
export type ZIndex = typeof zIndex
export type Breakpoints = typeof breakpoints
export type ComponentVariants = typeof componentVariants
export type Animations = typeof animations

// ============================================================================
// UNIFIED EXPORTS (Hybrid Approach - Best of Both Worlds)
// ============================================================================

/**
 * Named export: designTokens
 * Provides a global namespace for all design tokens
 * Usage: import { designTokens } from '@/lib/design-tokens'
 */
export const designTokens = {
  colors,
  gradients,
  spacing,
  typography,
  radius,
  shadows,
  transitions,
  zIndex,
  breakpoints,
  componentVariants,
  animations,
} as const

/**
 * Alias: tokens (for convenience)
 * Usage: import { tokens } from '@/lib/design-tokens'
 */
export const tokens = designTokens

/**
 * Default export
 * Usage: import designTokens from '@/lib/design-tokens'
 */
export default designTokens

export type DesignTokens = typeof designTokens
export type Tokens = typeof tokens
