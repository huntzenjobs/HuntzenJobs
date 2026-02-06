/**
 * Next.js Instrumentation
 * Loads Sentry configuration based on runtime environment
 * This file is automatically loaded by Next.js before the app starts
 */

export async function register() {
  // Detect runtime environment
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Server-side Node.js runtime
    await import('./sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    // Edge runtime (middleware, edge functions)
    await import('./sentry.edge.config')
  }
}

// This is called on the client side
export function onRequestError(err: Error & { digest?: string }, request: any) {
  // This will be picked up by sentry.client.config.ts
  console.error('[Instrumentation] Request error:', err)
}
