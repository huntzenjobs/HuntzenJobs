'use client'

/**
 * useAnnounce Hook
 * Announces messages to screen readers using ARIA live regions
 * Perfect for dynamic content changes (form submissions, updates, etc.)
 */

import { useCallback } from 'react'

type AnnouncePriority = 'polite' | 'assertive'

/**
 * Creates an announcement function that uses ARIA live regions
 * to communicate dynamic changes to screen reader users
 *
 * @example
 * const announce = useAnnounce()
 *
 * const handleSave = async () => {
 *   await saveProfile()
 *   announce('Profil enregistré avec succès')
 * }
 */
export function useAnnounce() {
  const announce = useCallback(
    (message: string, priority: AnnouncePriority = 'polite') => {
      // Create live region element
      const el = document.createElement('div')
      el.setAttribute('role', 'status')
      el.setAttribute('aria-live', priority)
      el.setAttribute('aria-atomic', 'true')
      el.className = 'sr-only' // Visually hidden but accessible
      el.textContent = message

      // Add to DOM
      document.body.appendChild(el)

      // Remove after announcement (1 second should be enough)
      setTimeout(() => {
        if (document.body.contains(el)) {
          document.body.removeChild(el)
        }
      }, 1000)
    },
    []
  )

  return announce
}

/**
 * Helper function for success announcements
 */
export function useAnnounceSuccess() {
  const announce = useAnnounce()
  return useCallback(
    (message: string) => announce(`✓ ${message}`, 'polite'),
    [announce]
  )
}

/**
 * Helper function for error announcements (more urgent)
 */
export function useAnnounceError() {
  const announce = useAnnounce()
  return useCallback(
    (message: string) => announce(`⚠ Erreur : ${message}`, 'assertive'),
    [announce]
  )
}
