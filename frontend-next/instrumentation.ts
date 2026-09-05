/**
 * Next.js Instrumentation
 * Loads Sentry configuration based on runtime environment
 * This file is automatically loaded by Next.js before the app starts
 */

import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";

export async function register() {
  // Detect runtime environment
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Server-side Node.js runtime
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    // Edge runtime (middleware, edge functions)
    await import("./sentry.edge.config");
  }
}

export const onRequestError: Instrumentation.onRequestError =
  Sentry.captureRequestError;
