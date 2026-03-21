/**
 * Configuration pour le code splitting et lazy loading
 * Améliore FID (First Input Delay) en réduisant le bundle principal
 */

import dynamic from "next/dynamic";
import React from "react";

/**
 * Composants non-critiques à charger en lazy
 * Ces composants ne sont pas visibles au-dessus de la ligne de flottaison
 */

// Modale détails d'offre (chargée au clic sur une offre)
export const DynamicJobDetailsModal = dynamic(
  () =>
    import("@/components/jobs/job-details-modal").then(
      (mod) => mod.JobDetailsModal,
    ),
  {
    loading: () =>
      React.createElement("div", { className: "animate-pulse h-96" }),
    ssr: false,
  },
);

// Modale pricing Stripe (chargée au clic upgrade)
export const DynamicPricingModal = dynamic(
  () =>
    import("@/components/freemium/pricing-modal").then(
      (mod) => mod.PricingModal,
    ),
  {
    loading: () => null,
    ssr: false,
  },
);

// Page admin stress test (recharts ~120KB, chargée uniquement pour les admins)
export const DynamicAdminStressPage = dynamic(
  () => import("@/app/admin/stress/page"),
  {
    loading: () =>
      React.createElement("div", { className: "animate-pulse h-96" }),
    ssr: false,
  },
);

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
  firstLoad: 150,
  routeChunk: 50,
  sharedChunk: 100,
} as const;
