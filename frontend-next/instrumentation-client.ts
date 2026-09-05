/**
 * Sentry Client Configuration
 * Browser-side error tracking and performance monitoring
 */

import * as Sentry from "@sentry/nextjs";
import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubSentryReplayEvent,
} from "./src/lib/sentry-privacy";

// Check cookie consent status for analytics/replay features
function hasAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("huntzen_cookie_consent") === "accepted";
}

// Only initialize on client side
if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_SENTRY_DSN) {
  // Get browser-specific integrations safely
  const integrations = [];

  if (Sentry.browserTracingIntegration) {
    integrations.push(
      Sentry.browserTracingIntegration({
        // Track navigation, page loads, and user interactions
        traceFetch: true,
        traceXHR: true,
      }),
    );
  }

  if (Sentry.breadcrumbsIntegration) {
    integrations.push(
      Sentry.breadcrumbsIntegration({
        // Track console, DOM, navigation events
        console: true,
        dom: true,
        fetch: true,
        history: true,
        xhr: true,
      }),
    );
  }

  // Session Replay for debugging user issues
  if (Sentry.replayIntegration) {
    integrations.push(
      Sentry.replayIntegration({
        // Les parcours HuntZen contiennent des CV et données de carrière : tout masquer.
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
        beforeAddRecordingEvent: scrubSentryReplayEvent,
      }),
    );
  }

  Sentry.init({
    // Data Source Name - unique identifier for this project
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // Environment (development, staging, production)
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
      process.env.NODE_ENV ||
      "development",

    // Performance Monitoring - respect cookie consent for tracing
    tracesSampleRate: hasAnalyticsConsent()
      ? process.env.NODE_ENV === "production"
        ? 0.5
        : 1.0
      : 0,

    // Session Replay - disabled when cookies declined
    replaysSessionSampleRate: hasAnalyticsConsent()
      ? process.env.NODE_ENV === "production"
        ? 0.1
        : 0.0
      : 0,
    replaysOnErrorSampleRate: hasAnalyticsConsent()
      ? process.env.NODE_ENV === "production"
        ? 1.0
        : 0.0
      : 0,

    // Browser-side integrations only (no server instrumentations needed)
    integrations,

    // Filter out sensitive information
    beforeSend(event) {
      // Don't send events in development
      if (process.env.NODE_ENV === "development") {
        return null;
      }
      return scrubSentryEvent(event);
    },
    beforeBreadcrumb: scrubSentryBreadcrumb,
    beforeSendTransaction: scrubSentryEvent,
    sendDefaultPii: false,

    // Ignore certain errors that are not actionable
    ignoreErrors: [
      // Browser extensions
      "top.GLOBALS",
      "chrome-extension://",
      "moz-extension://",
      // Network errors that we can't control
      "Network request failed",
      "Failed to fetch",
      // User cancelled requests
      "AbortError",
      "cancelled",
    ],

    // Set custom tags
    initialScope: {
      tags: {
        app_version: process.env.NEXT_PUBLIC_APP_VERSION || "unknown",
      },
    },
  });

  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.log("[Sentry] Client initialized with browser-only integrations");
  }
} else if (process.env.NODE_ENV === "development") {
  // eslint-disable-next-line no-console
  console.warn("[Sentry] DSN not configured - error tracking disabled");
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
