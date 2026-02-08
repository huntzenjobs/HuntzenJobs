/**
 * Z-index scale for consistent layering across the application
 *
 * Usage:
 * - Import and use these constants instead of hardcoded z-index values
 * - Ensures proper stacking context and prevents conflicts
 */

export const Z_INDEX = {
  // Base layers (0-9)
  base: 0,

  // Content layers (10-39)
  dropdown: 10,
  sticky: 20,
  fixed: 30,

  // Overlay layers (40-59)
  backdrop: 40,
  sidebarBackdrop: 45,

  // Modal layers (50-69)
  dialog: 50,
  sheet: 50,
  popover: 55,

  // Top layers (70-99)
  tooltip: 70,
  notification: 80,
  toast: 90,
} as const

export type ZIndex = typeof Z_INDEX[keyof typeof Z_INDEX]
