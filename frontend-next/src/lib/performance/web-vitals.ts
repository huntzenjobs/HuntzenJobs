"use client";

/**
 * Monitoring des Core Web Vitals
 * Envoie les métriques à un service d'analytics
 */

import { onCLS, onINP, onLCP, onFCP, onTTFB, Metric } from "web-vitals";

/**
 * Seuils recommandés par Google
 */
export const WEB_VITALS_THRESHOLDS = {
  // Largest Contentful Paint (LCP)
  LCP: {
    good: 2500, // ms
    needsImprovement: 4000,
  },
  // Interaction to Next Paint (INP) - Remplace FID
  INP: {
    good: 200, // ms
    needsImprovement: 500,
  },
  // Cumulative Layout Shift (CLS)
  CLS: {
    good: 0.1,
    needsImprovement: 0.25,
  },
  // First Contentful Paint (FCP)
  FCP: {
    good: 1800, // ms
    needsImprovement: 3000,
  },
  // Time to First Byte (TTFB)
  TTFB: {
    good: 800, // ms
    needsImprovement: 1800,
  },
} as const;

/**
 * Envoie une métrique à l'endpoint d'analytics
 */
function sendToAnalytics(metric: Metric) {
  // En production, envoyer à votre service d'analytics
  // (Vercel Analytics, Google Analytics, etc.)
  if (process.env.NODE_ENV === "production") {
    // Exemple: Vercel Analytics (déjà intégré via @vercel/analytics)
    // ou custom endpoint
    // fetch('/api/analytics', {
    //   method: 'POST',
    //   body: JSON.stringify(metric),
    // });

    console.log(`[Web Vitals] ${metric.name}:`, {
      value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
    });
  } else {
    // En dev, logger dans la console
    console.log(`[Web Vitals] ${metric.name}:`, {
      value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
    });
  }
}

/**
 * Initialise le monitoring des Web Vitals
 * À appeler une seule fois côté client
 */
export function initWebVitalsMonitoring() {
  if (typeof window === "undefined") return;

  // Largest Contentful Paint (LCP)
  onLCP(sendToAnalytics);

  // Interaction to Next Paint (INP) - Remplace FID depuis web-vitals v3
  onINP(sendToAnalytics);

  // Cumulative Layout Shift (CLS)
  onCLS(sendToAnalytics);

  // First Contentful Paint (FCP)
  onFCP(sendToAnalytics);

  // Time to First Byte (TTFB)
  onTTFB(sendToAnalytics);
}

/**
 * Helper pour vérifier si une métrique est dans le seuil "good"
 */
export function isGoodWebVital(name: string, value: number): boolean {
  switch (name) {
    case "LCP":
      return value <= WEB_VITALS_THRESHOLDS.LCP.good;
    case "INP":
      return value <= WEB_VITALS_THRESHOLDS.INP.good;
    case "CLS":
      return value <= WEB_VITALS_THRESHOLDS.CLS.good;
    case "FCP":
      return value <= WEB_VITALS_THRESHOLDS.FCP.good;
    case "TTFB":
      return value <= WEB_VITALS_THRESHOLDS.TTFB.good;
    default:
      return false;
  }
}
