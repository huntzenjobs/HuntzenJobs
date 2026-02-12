/**
 * Configuration centralisée des fonts optimisées
 * Utilise next/font/google pour le meilleur chargement et performance
 */

import { Inter, DM_Sans } from "next/font/google";

// Inter - Police principale
export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap", // Optimisation Core Web Vitals - évite le FOIT
  preload: true, // Preload pour performance
  weight: ["300", "400", "500", "600", "700", "800"],
});

// DM Sans - Police secondaire pour le landing
export const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
  preload: true,
  weight: ["400", "500", "600", "700", "800", "900"],
});
