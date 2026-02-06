/**
 * Auth Callback Route
 * Handles OAuth redirect from Google/Email confirmation
 */

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { logSecurityEvent } from '@/lib/security/logger'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const error = requestUrl.searchParams.get('error')
  const errorDescription = requestUrl.searchParams.get('error_description')
  const origin = requestUrl.origin

  // Handle OAuth errors from Google
  if (error) {
    await logSecurityEvent({
      eventType: 'auth.oauth_callback_error',
      severity: 'warning',
      metadata: { error, error_description: errorDescription }
    })

    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorDescription || error)}`
    )
  }

  if (code) {
    const supabase = await createClient()

    // Exchange code for session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.session) {
      // Log successful OAuth callback
      await logSecurityEvent({
        eventType: 'auth.oauth_callback_success',
        severity: 'info',
        userId: data.user.id,
        metadata: {
          email: data.user.email,
          provider: data.user.app_metadata?.provider
        }
      })

      // Successful auth, redirect to jobs dashboard
      // AuthProvider will automatically detect session from cookies and update context
      return NextResponse.redirect(`${origin}/jobs`)
    }

    // Log session exchange failure
    await logSecurityEvent({
      eventType: 'auth.session_exchange_failed',
      severity: 'critical',
      metadata: { error: error?.message }
    })

    // Auth error, redirect to login with generic error
    return NextResponse.redirect(
      `${origin}/login?error=Authentication failed. Please try again.`
    )
  }

  // No code provided, redirect to login
  return NextResponse.redirect(`${origin}/login`)
}
