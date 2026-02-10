'use client'

/**
 * Auth Context Provider
 * Manages authentication state using Supabase Auth
 */

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User, Session, AuthError } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import {
  logLoginSuccess,
  logLoginFailed,
  logLogout,
  logSecurityEvent,
} from '@/lib/security/logger'
import { detectFailedLoginAnomaly } from '@/lib/security/anomaly-detection'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string, fullName: string) => Promise<void>
  signOut: () => Promise<void>
  error: string | null
  clearError: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Create Supabase client ONCE outside component to avoid re-initialization
const supabaseClient = createClient()

export function AuthProvider({
  children,
  initialUser = null
}: {
  children: React.ReactNode
  initialUser?: User | null
}) {
  const [user, setUser] = useState<User | null>(initialUser)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(!initialUser)
  const [error, setError] = useState<string | null>(null)

  const router = useRouter()

  useEffect(() => {
    const initializeAuth = async () => {
      if (initialUser) {
        // User fourni par SSR, fetch seulement session
        try {
          const { data: { session } } = await supabaseClient.auth.getSession()
          setSession(session)
          // Ne pas toucher user (déjà set par initialUser)
        } catch (err) {
          console.error('Failed to get session:', err)
        }
        // Pas de setLoading(false) - déjà false
      } else {
        // Pas d'initialUser, fetch complet
        try {
          const { data: { session } } = await supabaseClient.auth.getSession()
          setSession(session)
          setUser(session?.user ?? null)
        } catch (err) {
          console.error('Failed to get session:', err)
        } finally {
          setLoading(false)
        }
      }
    }

    initializeAuth()

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[AuthContext] Auth state changed:', event, session ? 'session active' : 'no session')

        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)

        // Handle different auth events
        switch (event) {
          case 'SIGNED_IN':
            // Log OAuth login success (non-blocking)
            if (session?.user) {
              const provider = session.user.app_metadata?.provider
              if (provider === 'google') {
                logLoginSuccess(session.user.id, {
                  email: session.user.email,
                  method: 'oauth_google',
                  provider: 'google'
                }).catch(err => {
                  console.error('Failed to log OAuth login (non-critical):', err)
                })
              }
            }

            // Clear old subscription cache and trigger refresh
            localStorage.removeItem('huntzen_subscription_cache')
            localStorage.removeItem('huntzen_subscription_cache_expiry')
            window.dispatchEvent(new Event('subscription-changed'))
            break

          case 'TOKEN_REFRESHED':
            // Token was automatically refreshed by Supabase
            console.log('[AuthContext] Token refreshed successfully')
            break

          case 'SIGNED_OUT':
            // User signed out or token expired permanently
            console.log('[AuthContext] User signed out')
            setSession(null)
            setUser(null)

            // Clear subscription cache to prevent data leakage
            localStorage.removeItem('huntzen_subscription_cache')
            localStorage.removeItem('huntzen_subscription_cache_expiry')
            break

          case 'USER_UPDATED':
            // User metadata updated
            console.log('[AuthContext] User updated')
            break
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [initialUser])

  const clearError = () => setError(null)

  const signInWithGoogle = async () => {
    try {
      setError(null)

      // Capturer redirectTo et stocker dans cookie avant OAuth
      const params = new URLSearchParams(window.location.search)
      const redirectTo = params.get('redirectTo')

      if (redirectTo) {
        document.cookie = `huntzen_redirect_after_auth=${encodeURIComponent(redirectTo)}; path=/; max-age=600; SameSite=Lax`
      }

      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) throw error
    } catch (err: any) {
      console.error('Google sign in error:', err)
      setError(err.message || 'Failed to sign in with Google')
      setLoading(false)

      // Log OAuth failure (non-blocking)
      logSecurityEvent({
        eventType: 'auth.oauth_failed',
        severity: 'warning',
        metadata: { provider: 'google', error: err.message }
      }).catch(logErr => {
        console.error('Failed to log OAuth failure (non-critical):', logErr)
      })

      throw err
    }
  }

  const signInWithEmail = async (email: string, password: string) => {
    try {
      setError(null)
      setLoading(true)

      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      // Log successful login (non-blocking)
      if (data.user) {
        logLoginSuccess(data.user.id, { email, method: 'email' }).catch(err => {
          console.error('Failed to log login success (non-critical):', err)
        })
      }

      // Check for redirectTo parameter in URL for deep links
      const params = new URLSearchParams(window.location.search)
      const redirectTo = params.get('redirectTo')

      if (redirectTo && redirectTo.startsWith('/')) {
        router.push(redirectTo)
      } else {
        router.push('/jobs')
      }

      // Reset loading après navigation initiale
      setTimeout(() => setLoading(false), 100)

    } catch (err: any) {
      console.error('Email sign in error:', err)
      setError(err.message || 'Invalid email or password')
      setLoading(false)

      // Log failed login (non-blocking)
      logLoginFailed(email, err.message).catch(logErr => {
        console.error('Failed to log login failure (non-critical):', logErr)
      })

      // Check for anomalies (multiple failed attempts)
      // Note: We don't have userId yet, so we can't check here
      // This will be checked by backend/database triggers

      throw err
    }
  }

  const signUpWithEmail = async (email: string, password: string, fullName: string) => {
    try {
      setError(null)
      setLoading(true)

      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) throw error

      // Log successful signup (non-blocking)
      if (data.user) {
        logSecurityEvent({
          eventType: 'auth.signup',
          severity: 'info',
          userId: data.user.id,
          metadata: { email, full_name: fullName, method: 'email' },
        }).catch(err => {
          console.error('Failed to log signup (non-critical):', err)
        })
      }

      // Show success message
      setError(null)

      // Redirect to login with success message
      router.push('/login?message=Check your email to confirm your account')

      // Reset loading
      setTimeout(() => setLoading(false), 100)

    } catch (err: any) {
      console.error('Sign up error:', err)
      setError(err.message || 'Failed to create account')
      setLoading(false)
      throw err
    }
  }

  const signOut = async () => {
    try {
      setError(null)

      // Log logout in background (non-blocking)
      // Don't await to prevent logout delays if logging fails
      if (user) {
        logLogout(user.id).catch(err => {
          console.error('Failed to log logout (non-critical):', err)
        })
      }

      // Attempt to sign out from Supabase
      // If session is already expired, this will fail - that's OK
      const { error } = await supabaseClient.auth.signOut()

      if (error) {
        // Log the error but don't block logout
        // Session might already be expired (AbortError)
        console.warn('Sign out warning (continuing anyway):', error)
      }
    } catch (err: any) {
      // Catch any exception (AbortError, network issues, etc.)
      console.warn('Sign out exception (continuing anyway):', err)
    } finally {
      // ALWAYS clean up local state and redirect, even if signOut failed
      // If session was already expired, we still need to clear local data
      setSession(null)
      setUser(null)

      // Clear subscription cache to prevent data leakage between users
      localStorage.removeItem('huntzen_subscription_cache')
      localStorage.removeItem('huntzen_subscription_cache_expiry')

      // Redirect to login page
      router.push('/login')
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        signOut,
        error,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

/**
 * Hook optionnel pour utiliser le contexte d'authentification
 * Retourne null si le contexte n'est pas disponible (au lieu de throw)
 *
 * Utilisé par des composants qui peuvent fonctionner avec ou sans authentification
 * (par exemple le Sidebar qui peut recevoir user via props OU via contexte)
 */
export function useOptionalAuth() {
  const context = useContext(AuthContext)
  return context ?? null
}
