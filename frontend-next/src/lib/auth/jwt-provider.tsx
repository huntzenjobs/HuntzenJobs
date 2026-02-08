/**
 * JWT Authentication Provider
 * Manages Anonymous Auth with Supabase and JWT token generation
 */

'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { getClientId } from '@/lib/utils/client-id'

interface AuthContextType {
  token: string | null
  isLoading: boolean
  userId: string | null
  signInAnonymously: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  token: null,
  isLoading: true,
  userId: null,
  signInAnonymously: async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const signInAnonymously = async () => {
    try {
      // Check if already have a session
      const { data: { session } } = await supabase.auth.getSession()

      if (session) {
        setToken(session.access_token)
        setUserId(session.user.id)
        setIsLoading(false)
        return
      }

      // Sign in anonymously
      const { data, error } = await supabase.auth.signInAnonymously({
        options: {
          data: {
            client_id: getClientId(), // Link to existing client_id for continuity
          }
        }
      })

      if (error) {
        console.error('Anonymous sign-in error:', error)
        // Fallback to client_id only
        setUserId(getClientId())
        setIsLoading(false)
        return
      }

      if (data.session && data.user) {
        setToken(data.session.access_token)
        setUserId(data.user.id)
      }
    } catch (error) {
      console.error('Auth error:', error)
      // Fallback to client_id
      setUserId(getClientId())
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    signInAnonymously()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setToken(session.access_token)
        setUserId(session.user.id)
      } else {
        setToken(null)
        setUserId(getClientId()) // Fallback
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ token, isLoading, userId, signInAnonymously }}>
      {children}
    </AuthContext.Provider>
  )
}

/**
 * Get current auth token for API requests
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || null
  } catch (error) {
    console.error('Failed to get auth token:', error)
    return null
  }
}
