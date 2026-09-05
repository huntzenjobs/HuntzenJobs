/**
 * Sentry Edge Configuration
 * Error tracking for Edge runtime (middleware, edge functions)
 */

import * as Sentry from "@sentry/nextjs";
import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
} from "./src/lib/sentry-privacy";

// Initialize Sentry only if DSN is configured
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    // Data Source Name
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // Environment
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
      process.env.NODE_ENV ||
      "development",

    release:
      process.env.NEXT_PUBLIC_SENTRY_RELEASE ||
      process.env.VERCEL_GIT_COMMIT_SHA,

    // Performance Monitoring (minimal on edge)
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.01 : 1.0, // 1% in prod

    beforeSend(event) {
      if (process.env.NODE_ENV === "development") return null;
      return scrubSentryEvent(event);
    },
    beforeBreadcrumb: scrubSentryBreadcrumb,
    beforeSendTransaction: scrubSentryEvent,
    sendDefaultPii: false,

    // Set custom tags
    initialScope: {
      tags: {
        runtime: "edge",
        app_version: process.env.NEXT_PUBLIC_APP_VERSION || "unknown",
      },
    },
  });
}
