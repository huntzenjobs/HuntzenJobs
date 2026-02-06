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
    // Get initial session with error handling
    supabaseClient.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to get session:', err)
        setLoading(false)
      })

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
            // Log OAuth login success
            if (session?.user) {
              const provider = session.user.app_metadata?.provider
              if (provider === 'google') {
                await logLoginSuccess(session.user.id, {
                  email: session.user.email,
                  method: 'oauth_google',
                  provider: 'google'
                })
              }
            }
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
            break

          case 'USER_UPDATED':
            // User metadata updated
            console.log('[AuthContext] User updated')
            break
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const clearError = () => setError(null)

  const signInWithGoogle = async () => {
    try {
      setError(null)
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

      // Log OAuth failure
      await logSecurityEvent({
        eventType: 'auth.oauth_failed',
        severity: 'warning',
        metadata: { provider: 'google', error: err.message }
      })

      throw err
    }
  }

  const signInWithEmail = async (email: string, password: string) => {
    try {
      setError(null)
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      // Log successful login
      if (data.user) {
        await logLoginSuccess(data.user.id, { email, method: 'email' })
      }

      // Check for redirectTo parameter in URL for deep links
      const params = new URLSearchParams(window.location.search)
      const redirectTo = params.get('redirectTo')

      if (redirectTo && redirectTo.startsWith('/')) {
        router.push(redirectTo)
        router.refresh() // Force server components to refetch with new session
      } else {
        router.push('/jobs')
        router.refresh() // Force server components to refetch with new session
      }
    } catch (err: any) {
      console.error('Email sign in error:', err)
      setError(err.message || 'Invalid email or password')

      // Log failed login
      await logLoginFailed(email, err.message)

      // Check for anomalies (multiple failed attempts)
      // Note: We don't have userId yet, so we can't check here
      // This will be checked by backend/database triggers

      throw err
    }
  }

  const signUpWithEmail = async (email: string, password: string, fullName: string) => {
    try {
      setError(null)
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

      // Log successful signup
      if (data.user) {
        await logSecurityEvent({
          eventType: 'auth.signup',
          severity: 'info',
          userId: data.user.id,
          metadata: { email, full_name: fullName, method: 'email' },
        })
      }

      // Show success message
      setError(null)

      // Redirect to login with success message
      router.push('/login?message=Check your email to confirm your account')
    } catch (err: any) {
      console.error('Sign up error:', err)
      setError(err.message || 'Failed to create account')
      throw err
    }
  }

  const signOut = async () => {
    try {
      setError(null)

      // Log logout before signing out
      if (user) {
        await logLogout(user.id)
      }

      const { error } = await supabaseClient.auth.signOut()

      if (error) throw error

      router.push('/login')
    } catch (err: any) {
      console.error('Sign out error:', err)
      setError(err.message || 'Failed to sign out')
      throw err
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
