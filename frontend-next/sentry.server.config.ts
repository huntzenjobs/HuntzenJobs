/**
 * Sentry Server Configuration
 * Server-side error tracking for Next.js API routes and SSR
 */

import * as Sentry from '@sentry/nextjs'

// Initialize Sentry only if DSN is configured
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    // Data Source Name
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // Environment
    environment: process.env.NODE_ENV || 'development',

    // Performance Monitoring (lower sample rate on server)
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0, // 5% in prod

    // Disable auto-instrumentation for unused integrations
    // This app uses Supabase (not direct DB access), so disable DB instrumentations
    integrations: [
      Sentry.httpIntegration(),
      // Explicitly disable these integrations by not including them:
      // - prismaIntegration (not using Prisma)
      // - mysqlIntegration (not using MySQL)
      // - postgresIntegration (not using direct Postgres)
      // - mongoIntegration (not using MongoDB)
      // - redisIntegration (not using Redis)
      // - graphqlIntegration (not running GraphQL server)
      // - fsIntegration (not needed for server-side error tracking)
    ],

    // Disable default integrations to avoid auto-loading unused ones
    defaultIntegrations: false,

    // Filter sensitive information before sending
    beforeSend(event, hint) {
      // Don't send events in development
      if (process.env.NODE_ENV === 'development') {
        console.log('[Sentry Server] Event would be sent:', event)
        return null
      }

      // Remove sensitive environment variables
      if (event.contexts?.runtime?.env) {
        const sanitized: Record<string, any> = { ...event.contexts.runtime.env }
        Object.keys(sanitized).forEach(key => {
          if (key.includes('SECRET') || key.includes('KEY') || key.includes('PASSWORD')) {
            sanitized[key] = 'REDACTED'
          }
        })
        event.contexts.runtime.env = sanitized
      }

      return event
    },

    // Set custom tags
    initialScope: {
      tags: {
        runtime: 'server',
        app_version: process.env.NEXT_PUBLIC_APP_VERSION || 'unknown',
      },
    },
  })

  console.log('[Sentry Server] Initialized with minimal integrations for Supabase architecture')
} else {
  console.warn('[Sentry Server] DSN not configured - error tracking disabled')
}
