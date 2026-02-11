'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const INACTIVITY_TIMEOUT = 30 * 60 * 1000 // 30 minutes d'inactivité
const REFRESH_BEFORE_EXPIRY = 5 * 60 * 1000 // Rafraîchir 5 min avant expiration

export function useAutoRefreshSession() {
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    let inactivityTimer: NodeJS.Timeout
    let refreshTimer: NodeJS.Timeout

    // Détection d'activité utilisateur
    const resetInactivityTimer = () => {
      clearTimeout(inactivityTimer)

      inactivityTimer = setTimeout(async () => {
        console.log('[Auth] Déconnexion automatique après inactivité')
        await supabase.auth.signOut()
        router.push('/login?reason=inactivity')
      }, INACTIVITY_TIMEOUT)
    }

    // Écouter les événements d'activité
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart']
    events.forEach(event => {
      window.addEventListener(event, resetInactivityTimer)
    })

    // Auto-refresh du token avant expiration
    const setupRefreshTimer = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (session?.expires_at) {
          const expiresAt = session.expires_at * 1000 // Convert to milliseconds
          const now = Date.now()
          const timeUntilRefresh = expiresAt - now - REFRESH_BEFORE_EXPIRY

          if (timeUntilRefresh > 0) {
            console.log(`[Auth] Token rafraîchissement programmé dans ${Math.round(timeUntilRefresh / 1000 / 60)} minutes`)

            refreshTimer = setTimeout(async () => {
              console.log('[Auth] Rafraîchissement du token...')
              const { error } = await supabase.auth.refreshSession()

              if (error) {
                console.error('[Auth] Erreur lors du rafraîchissement:', error)
                router.push('/login?reason=token_expired')
              } else {
                console.log('[Auth] Token rafraîchi avec succès')
                setupRefreshTimer() // Re-planifier le prochain refresh
              }
            }, timeUntilRefresh)
          } else {
            // Token déjà expiré ou sur le point d'expirer
            console.log('[Auth] Token expiré, rafraîchissement immédiat...')
            const { error } = await supabase.auth.refreshSession()

            if (error) {
              console.error('[Auth] Impossible de rafraîchir le token:', error)
              router.push('/login?reason=token_expired')
            } else {
              setupRefreshTimer()
            }
          }
        }
      } catch (error) {
        console.error('[Auth] Erreur lors de la configuration du refresh:', error)
      }
    }

    // Initialisation
    resetInactivityTimer()
    setupRefreshTimer()

    // Cleanup
    return () => {
      clearTimeout(inactivityTimer)
      clearTimeout(refreshTimer)
      events.forEach(event => {
        window.removeEventListener(event, resetInactivityTimer)
      })
    }
  }, [supabase, router])
}
