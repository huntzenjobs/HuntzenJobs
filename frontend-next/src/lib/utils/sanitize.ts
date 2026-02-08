/**
 * Input Sanitization & XSS Prevention
 * Uses DOMPurify to strip HTML and prevent XSS attacks
 */

import DOMPurify from 'isomorphic-dompurify'

/**
 * Sanitize user input by stripping all HTML tags
 * @param input - Raw user input
 * @returns Sanitized string safe for display
 */
export function sanitizeInput(input: string): string {
  if (!input) return ''

  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],  // Strip all HTML tags
    KEEP_CONTENT: true,  // Keep text content
  })
}

/**
 * Sanitize HTML content while allowing safe tags
 * @param html - HTML string
 * @returns Sanitized HTML safe for rendering
 */
export function sanitizeHTML(html: string): string {
  if (!html) return ''

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOW_DATA_ATTR: false,
  })
}

/**
 * Validate and sanitize email address
 * @param email - Email string
 * @returns Sanitized email or null if invalid
 */
export function sanitizeEmail(email: string): string | null {
  const sanitized = sanitizeInput(email).toLowerCase().trim()
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  return emailRegex.test(sanitized) ? sanitized : null
}

/**
 * Sanitize URL and validate protocol
 * @param url - URL string
 * @returns Sanitized URL or null if invalid
 */
export function sanitizeURL(url: string): string | null {
  try {
    const sanitized = sanitizeInput(url).trim()
    const parsed = new URL(sanitized)

    // Only allow safe protocols
    if (['http:', 'https:'].includes(parsed.protocol)) {
      return parsed.toString()
    }

    return null
  } catch {
    return null
  }
}
