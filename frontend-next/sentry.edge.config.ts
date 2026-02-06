/**
 * Sentry Edge Configuration
 * Error tracking for Edge runtime (middleware, edge functions)
 */

import * as Sentry from '@sentry/nextjs'

// Initialize Sentry only if DSN is configured
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    // Data Source Name
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // Environment
    environment: process.env.NODE_ENV || 'development',

    // Performance Monitoring (minimal on edge)
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.01 : 1.0, // 1% in prod

    // Edge runtime has very limited integrations available
    // Only basic error tracking, no heavy instrumentation
    integrations: [],

    // Disable default integrations (not available in edge runtime anyway)
    defaultIntegrations: false,

    // Set custom tags
    initialScope: {
      tags: {
        runtime: 'edge',
        app_version: process.env.NEXT_PUBLIC_APP_VERSION || 'unknown',
      },
    },
  })

  console.log('[Sentry Edge] Initialized with minimal configuration')
} else {
  console.warn('[Sentry Edge] DSN not configured - error tracking disabled')
}
