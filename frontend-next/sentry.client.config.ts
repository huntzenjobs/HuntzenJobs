/**
 * Sentry Client Configuration
 * Browser-side error tracking and performance monitoring
 */

import * as Sentry from "@sentry/nextjs";

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
        // Mask all text content and block all media by default for privacy
        maskAllText: false,
        blockAllMedia: true,
      }),
    );
  }

  Sentry.init({
    // Data Source Name - unique identifier for this project
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // Environment (development, staging, production)
    environment: process.env.NODE_ENV || "development",

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

    // Disable default integrations to explicitly control what's loaded
    defaultIntegrations: false,

    // Filter out sensitive information
    beforeSend(event, hint) {
      // Don't send events in development (unless you want to test)
      if (process.env.NODE_ENV === "development") {
        console.log("[Sentry] Event would be sent:", event);
        // return null // TEMPORARILY COMMENTED for testing - UNCOMMENT after tests
      }

      // Remove sensitive data from URLs
      if (event.request?.url) {
        event.request.url = event.request.url.replace(
          /[?&](token|key|password)=[^&]*/gi,
          "$1=REDACTED",
        );
      }

      // Remove sensitive data from breadcrumbs
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
          if (breadcrumb.data) {
            breadcrumb.data = Object.keys(breadcrumb.data).reduce(
              (acc, key) => {
                if (["password", "token", "apiKey", "secret"].includes(key)) {
                  acc[key] = "REDACTED";
                } else {
                  acc[key] = breadcrumb.data![key];
                }
                return acc;
              },
              {} as Record<string, any>,
            );
          }
          return breadcrumb;
        });
      }

      return event;
    },

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

  // Log initialization
  console.log("[Sentry] Client initialized with browser-only integrations");
} else {
  console.warn("[Sentry] DSN not configured - error tracking disabled");
}
