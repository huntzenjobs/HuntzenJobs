/**
 * Configuration pour le code splitting et lazy loading
 * Améliore FID (First Input Delay) en réduisant le bundle principal
 */

import dynamic from "next/dynamic";
import React from "react";

/**
 * Composants non-critiques à charger en lazy
 * Ces composants ne sont pas visibles au-dessus de la ligne de flottaison
 *
 * NOTE: Décommentez et adaptez ces exports lorsque les composants correspondants existent
 */

// Modales et overlays (chargés uniquement quand nécessaires)
/*
export const DynamicJobDetailsModal = dynamic(
  () =>
    import("@/components/jobs/job-details-modal").then(
      (mod) => mod.JobDetailsModal
    ),
  {
    loading: () => React.createElement("div", { className: "animate-pulse" }, "Chargement..."),
    ssr: false, // Pas besoin de SSR pour les modales
  }
);

export const DynamicSubscriptionModal = dynamic(
  () =>
    import("@/components/subscription/subscription-modal").then(
      (mod) => mod.SubscriptionModal
    ),
  {
    loading: () => React.createElement("div", { className: "animate-pulse" }, "Chargement..."),
    ssr: false,
  }
);

// Composants lourds avec animations (framer-motion)
export const DynamicAnimatedFeatures = dynamic(
  () =>
    import("@/components/landing/animated-features").then(
      (mod) => mod.AnimatedFeatures
    ),
  {
    loading: () => null,
    ssr: false, // Les animations ne sont nécessaires que côté client
  }
);

// Charts et visualisations (heavy JS libraries)
export const DynamicAnalyticsChart = dynamic(
  () =>
    import("@/components/analytics/chart").then((mod) => mod.AnalyticsChart),
  {
    loading: () =>
      React.createElement("div", {
        className: "h-64 bg-gray-100 animate-pulse rounded-lg",
      }),
    ssr: false,
  }
);

// Editor et rich text (heavy dependencies)
export const DynamicRichTextEditor = dynamic(
  () =>
    import("@/components/editor/rich-text").then((mod) => mod.RichTextEditor),
  {
    loading: () =>
      React.createElement("div", {
        className: "h-48 bg-gray-50 border rounded-lg animate-pulse",
      }),
    ssr: false,
  }
);
*/

/**
 * Prefetch des routes critiques
 * Améliore la navigation perçue
 */
export const CRITICAL_ROUTES = [
  "/dashboard",
  "/jobs",
  "/cv-analysis",
  "/assistant",
] as const;

/**
 * Tailles de bundle cibles (en KB)
 * Pour monitoring et alertes
 */
export const BUNDLE_SIZE_LIMITS = {
  // First Load JS (critique)
  firstLoad: 150, // KB
  // Route chunks individuels
  routeChunk: 50, // KB
  // Shared chunks
  sharedChunk: 100, // KB
} as const;
