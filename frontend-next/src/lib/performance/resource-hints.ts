/**
 * Configuration des resource hints pour optimiser le chargement
 * Améliore TTFB et LCP
 */

/**
 * Origines externes à préconnecter
 * Réduit la latence DNS + TCP + TLS
 */
export const preconnectOrigins = [
  "https://ngiakfikbuyugqfqtfwp.supabase.co",
  "https://huntzenjobs-production.up.railway.app",
] as const;

/**
 * Origines externes pour DNS prefetch
 * Plus léger que preconnect, utilisé pour les resources non-critiques
 */
export const dnsPrefetchOrigins = [
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
  "https://images.unsplash.com",
] as const;

/**
 * Routes critiques à prefetch
 * Améliore la navigation perçue
 */
export const prefetchRoutes = [
  "/dashboard",
  "/jobs",
  "/cv-analysis",
  "/assistant",
  "/salons",
] as const;

/**
 * Resources critiques à preload
 * Charge en priorité les assets above-the-fold
 */
export const preloadResources = [
  {
    href: "/fonts/inter-var.woff2",
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  },
  {
    href: "/fonts/dm-sans-var.woff2",
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  },
] as const;

/**
 * Génère les tags de resource hints pour <head>
 */
export function generateResourceHints() {
  return {
    preconnect: preconnectOrigins.map((origin) => ({
      rel: "preconnect",
      href: origin,
      crossOrigin: "anonymous",
    })),
    dnsPrefetch: dnsPrefetchOrigins.map((origin) => ({
      rel: "dns-prefetch",
      href: origin,
    })),
    preload: preloadResources.map((resource) => ({
      rel: "preload",
      ...resource,
    })),
  };
}

/**
 * Prefetch programmatique d'une route
 * À utiliser au hover ou focus d'un lien critique
 */
export function prefetchRoute(href: string) {
  if (typeof window === "undefined") return;

  const link = document.createElement("link");
  link.rel = "prefetch";
  link.href = href;
  document.head.appendChild(link);
}

/**
 * Preload programmatique d'une image critique
 * À utiliser pour les images above-the-fold
 */
export function preloadImage(src: string, priority: "high" | "low" = "high") {
  if (typeof window === "undefined") return;

  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "image";
  link.href = src;
  link.fetchPriority = priority;
  document.head.appendChild(link);
}
