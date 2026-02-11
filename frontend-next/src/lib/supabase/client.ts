/**
 * Supabase Client Configuration
 * Browser-side client for frontend operations with Anonymous Auth support
 */

import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: true,      // Explicite - enable automatic token refresh
        persistSession: true,         // Explicite - persist session in localStorage
        detectSessionInUrl: true,     // Enable OAuth callback detection
      }
    }
  )
}

// Singleton instance for convenient access
export const supabase = createClient()

/**
 * Check if Supabase connection is healthy
 */
export async function checkSupabaseConnection(): Promise<boolean> {
  try {
    // Simple ping to test connection
    const { error } = await supabase.auth.getSession()
    return !error
  } catch {
    return false
  }
}
