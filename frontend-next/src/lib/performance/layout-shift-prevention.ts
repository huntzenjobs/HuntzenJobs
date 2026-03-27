/**
 * Utilitaires pour prévenir le Cumulative Layout Shift (CLS)
 * CLS cible: < 0.1
 */

/**
 * Calcule le ratio d'aspect pour les images/iframes
 * Utilisé pour réserver l'espace avant le chargement
 */
export function calculateAspectRatio(width: number, height: number): string {
  return `${(height / width) * 100}%`;
}

/**
 * Classes CSS pour conteneurs avec aspect ratio
 * Prévient le layout shift pendant le chargement des images
 */
export const aspectRatioClasses = {
  square: "aspect-square", // 1:1
  video: "aspect-video", // 16:9
  portrait: "aspect-[3/4]", // 3:4
  landscape: "aspect-[4/3]", // 4:3
  wide: "aspect-[21/9]", // 21:9
} as const;

/**
 * Dimensions standards pour les images communes
 * À utiliser avec next/image width/height
 */
export const standardImageDimensions = {
  // Hero images
  hero: { width: 1920, height: 1080 },
  // Cards et vignettes
  thumbnail: { width: 400, height: 300 },
  // Avatars
  avatar: { width: 128, height: 128 },
  // Logos
  logo: { width: 200, height: 60 },
  // Open Graph
  ogImage: { width: 1200, height: 630 },
} as const;

/**
 * Placeholder SVG pour lazy loading d'images
 * Base64 encodé pour performance maximale
 */
export function generateBlurDataURL(width: number, height: number): string {
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="#f3f4f6"/>
    </svg>
  `;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/**
 * Skeleton loader pour contenu dynamique
 * Prévient le layout shift pendant le fetch de données
 */
export const skeletonClasses = {
  text: "animate-pulse bg-gray-200 rounded h-4 w-full",
  title: "animate-pulse bg-gray-200 rounded h-8 w-3/4",
  avatar: "animate-pulse bg-gray-200 rounded-full",
  card: "animate-pulse bg-gray-100 rounded-lg border border-gray-200",
  image: "animate-pulse bg-gray-200 rounded",
} as const;

/**
 * Reserve space pour les éléments avec height dynamique
 * Utilise min-height pour éviter le shift
 */
export function getMinHeightClass(estimatedHeight: number): string {
  // Arrondi à la dizaine supérieure
  const rounded = Math.ceil(estimatedHeight / 10) * 10;
  return `min-h-[${rounded}px]`;
}

/**
 * Configuration pour IntersectionObserver (lazy loading optimisé)
 */
export const lazyLoadConfig = {
  rootMargin: "50px", // Commence à charger 50px avant que l'élément soit visible
  threshold: 0.01, // Trigger dès que 1% de l'élément est visible
} as const;
