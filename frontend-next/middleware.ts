/**
 * Next.js Middleware
 * Authentication and authorization logic
 * - Redirects unauthenticated users from protected routes to /login
 * - Redirects authenticated users from /login, /signup, / to /jobs
 * - Manages Supabase session cookies
 * - Sets client ID for freemium tracking
 */

import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

// Protected routes that require authentication (premium only)
const PROTECTED_ROUTES = [
  '/profile',
  '/settings',
  '/saved-jobs',
]

// Freemium routes (accessible without auth, quotas managed client-side)
const FREEMIUM_ROUTES = [
  '/jobs',        // 3 searches/day, 10 jobs visible
  '/cv-analysis', // 1 analysis/day
  '/coach',       // 5 minutes/day
]

// Public routes (no auth required)
const PUBLIC_ROUTES = [
  '/login',
  '/signup',
  '/auth/callback',
  '/pricing',
  '/',
]

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Get user (this updates the session)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Set client ID cookie if not present (for freemium tracking)
  const clientIdCookie = request.cookies.get('huntzen_client_id')
  if (!clientIdCookie) {
    const newClientId = 'hzn_' + crypto.randomUUID().replace(/-/g, '')
    supabaseResponse.cookies.set('huntzen_client_id', newClientId, {
      path: '/',
      maxAge: 365 * 24 * 60 * 60, // 1 year
      sameSite: 'lax',
    })
  }

  const { pathname } = request.nextUrl

  // Check if route is protected
  const isProtectedRoute = PROTECTED_ROUTES.some(route =>
    pathname.startsWith(route)
  )

  // Check if route is auth page
  const authRoutes = ['/login', '/signup']
  const isAuthRoute = authRoutes.includes(pathname)

  // Redirect unauthenticated users from protected routes
  if (isProtectedRoute && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users from auth pages to /jobs
  if (isAuthRoute && user) {
    const url = request.nextUrl.clone()
    url.pathname = '/jobs'
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users from landing page to /jobs
  if (pathname === '/' && user) {
    const url = request.nextUrl.clone()
    url.pathname = '/jobs'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
