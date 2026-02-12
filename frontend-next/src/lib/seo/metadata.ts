import { Metadata } from "next";

/**
 * Configuration SEO centralisée pour HuntZen Jobs
 * Score SEO cible : 100/100
 */

const SITE_URL = "https://huntzenjobs.com";
const SITE_NAME = "HuntZen Jobs";
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

/**
 * Metadata par défaut (fallback)
 */
export const defaultMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "HuntZen Jobs - Votre allié carrière",
    template: "%s | HuntZen Jobs",
  },
  description:
    "Plateforme complète pour réussir votre recherche d'emploi : offres ciblées, analyse CV experte, et coaching personnalisé",
  keywords: [
    "recherche emploi",
    "offre emploi",
    "cv",
    "alternance",
    "stage",
    "salon emploi",
    "ats",
    "coaching carrière",
    "france",
  ],
  authors: [{ name: "HuntZen" }],
  creator: "HuntZen",
  publisher: "HuntZen",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "HuntZen Jobs - Votre allié carrière",
    description:
      "Plateforme complète pour réussir votre recherche d'emploi : offres ciblées, analyse CV experte, et coaching personnalisé",
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "HuntZen Jobs",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "HuntZen Jobs - Votre allié carrière",
    description:
      "Plateforme complète pour réussir votre recherche d'emploi : offres ciblées, analyse CV experte, et coaching personnalisé",
    images: [DEFAULT_OG_IMAGE],
    creator: "@huntzen",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: "GY_SUMwiyE8JIoIt58aBkI92-NMA0Q0n_FnjfFfLGBw",
    // yandex: 'YANDEX_VERIFICATION_CODE',
    // bing: 'BING_VERIFICATION_CODE',
  },
};

/**
 * Metadata pour la page d'accueil
 */
export const homeMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Recherche d'Emploi, CV, Salons | HuntZen Jobs - Votre Allié Carrière",
  description:
    "Trouvez votre emploi idéal parmi +100 000 offres. Analyse CV ATS, coaching carrière, salons emploi, alternance. Plateforme gratuite de recherche d'emploi en France.",
  keywords: [
    "recherche emploi",
    "offre emploi",
    "trouver un emploi",
    "cv",
    "analyse cv",
    "alternance",
    "stage",
    "salon emploi",
    "forum emploi",
    "ats",
    "coaching carrière",
    "entretien embauche",
    "négociation salariale",
    "france",
    "paris",
    "lyon",
    "marseille",
  ],
  openGraph: {
    type: "website",
    locale: "fr_FR",
    siteName: SITE_NAME,
    title:
      "Recherche d'Emploi, CV, Salons | HuntZen Jobs - Votre Allié Carrière",
    description:
      "Trouvez votre emploi idéal parmi +100 000 offres. Analyse CV ATS, coaching carrière, salons emploi, alternance. Plateforme gratuite de recherche d'emploi en France.",
    url: SITE_URL,
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title:
      "Recherche d'Emploi, CV, Salons | HuntZen Jobs - Votre Allié Carrière",
    description:
      "Trouvez votre emploi idéal parmi +100 000 offres. Analyse CV ATS, coaching carrière, salons emploi, alternance.",
    images: [DEFAULT_OG_IMAGE],
    creator: "@huntzen",
  },
  alternates: {
    canonical: SITE_URL,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

/**
 * Metadata pour la page Jobs
 */
export const jobsMetadata: Metadata = {
  title: "Offres d'Emploi en France - CDI, CDD, Alternance, Stage | HuntZen",
  description:
    "Découvrez +100 000 offres d'emploi en CDI, CDD, alternance et stage. Filtres avancés (salaire, télétravail, ville). Agrégateur d'offres de +20 sites emploi.",
  keywords: [
    "offre emploi",
    "offres d'emploi",
    "cdi",
    "cdd",
    "alternance",
    "stage",
    "télétravail",
    "remote",
    "emploi paris",
    "emploi lyon",
    "emploi marseille",
    "indeed",
    "pole emploi",
    "apec",
    "linkedin jobs",
    "agrégateur emploi",
    "moteur recherche emploi",
    "plateforme emploi",
  ],
  openGraph: {
    title: "Offres d'Emploi en France - CDI, CDD, Alternance, Stage",
    description:
      "Découvrez +100 000 offres d'emploi en France. Filtres avancés, matching intelligent, alertes personnalisées.",
    url: `${SITE_URL}/jobs`,
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: {
    title: "Offres d'Emploi en France - CDI, CDD, Alternance, Stage",
    description:
      "Découvrez +100 000 offres d'emploi. Filtres avancés, matching intelligent.",
    images: [DEFAULT_OG_IMAGE],
  },
  alternates: {
    canonical: `${SITE_URL}/jobs`,
  },
};

/**
 * Metadata pour la page Analyse CV
 */
export const cvAnalysisMetadata: Metadata = {
  title: "Analyse CV Gratuite - Score ATS & Optimisation CV | HuntZen",
  description:
    "Analysez votre CV gratuitement : score ATS, compatibilité offres, recommandations personnalisées. Optimisez votre CV pour passer les filtres de recrutement. Générateur CV inclus.",
  keywords: [
    "analyse cv",
    "ats",
    "score cv",
    "optimiser cv",
    "cv ats",
    "générateur cv",
    "créer cv",
    "modèle cv",
    "cv gratuit",
    "cv professionnel",
    "améliorer cv",
    "conseils cv",
    "cv efficace",
    "cv gagnant",
    "système ats",
    "filtres recrutement",
    "cv compatible ats",
    "évaluation cv",
    "notation cv",
    "audit cv",
  ],
  openGraph: {
    title: "Analyse CV Gratuite - Score ATS & Optimisation CV",
    description:
      "Analysez votre CV gratuitement. Score ATS, recommandations personnalisées pour optimiser votre candidature.",
    url: `${SITE_URL}/cv-analysis`,
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: {
    title: "Analyse CV Gratuite - Score ATS & Optimisation",
    description:
      "Score ATS, recommandations personnalisées pour optimiser votre CV.",
    images: [DEFAULT_OG_IMAGE],
  },
  alternates: {
    canonical: `${SITE_URL}/cv-analysis`,
  },
};

/**
 * Metadata pour la page Salons & Forums
 */
export const salonsMetadata: Metadata = {
  title: "Salons & Forums Emploi 2026 - Calendrier Complet France | HuntZen",
  description:
    "Calendrier des salons de l'emploi 2026 en France : Paris, Lyon, Marseille, Toulouse. Job dating, forums recrutement, salons alternance. Événements emploi gratuits partout en France.",
  keywords: [
    "salon emploi",
    "salon de l'emploi",
    "forum emploi",
    "forum recrutement",
    "job dating",
    "salon alternance",
    "salon étudiant",
    "événement emploi",
    "salon recrutement",
    "salon job",
    "salon carrière",
    "calendrier salon emploi",
    "prochains salons emploi",
    "salon emploi paris",
    "salon emploi lyon",
    "salon emploi marseille",
    "salon emploi 2026",
    "forum job",
    "speed recruiting",
    "rencontrer recruteurs",
  ],
  openGraph: {
    title: "Salons & Forums Emploi 2026 - Calendrier Complet France",
    description:
      "Calendrier complet des salons de l'emploi en France. Job dating, forums recrutement, salons alternance.",
    url: `${SITE_URL}/salons`,
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: {
    title: "Salons & Forums Emploi 2026 - Calendrier France",
    description:
      "Calendrier complet des salons emploi en France. Job dating, forums, événements.",
    images: [DEFAULT_OG_IMAGE],
  },
  alternates: {
    canonical: `${SITE_URL}/salons`,
  },
};

/**
 * Metadata pour la page Assistant Carrière
 */
export const assistantMetadata: Metadata = {
  title:
    "Coach Carrière Personnel - Entretien, Négociation Salariale | HuntZen",
  description:
    "Coach carrière personnel 24/7 : préparation entretien, simulation questions, négociation salariale, conseil emploi. Accompagnement personnalisé gratuit pour réussir votre carrière.",
  keywords: [
    "coach carrière",
    "coaching carrière",
    "entretien embauche",
    "entretien d'embauche",
    "préparation entretien",
    "simulation entretien",
    "questions entretien",
    "négociation salariale",
    "négocier salaire",
    "conseil emploi",
    "conseil carrière",
    "orientation professionnelle",
    "reconversion professionnelle",
    "évolution professionnelle",
    "assistant carrière",
    "mentor carrière",
    "accompagnement emploi",
  ],
  openGraph: {
    title: "Coach Carrière Personnel - Entretien, Négociation",
    description:
      "Coach carrière 24/7 : préparation entretien, simulation, négociation salariale. Accompagnement personnalisé.",
    url: `${SITE_URL}/assistant`,
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: {
    title: "Coach Carrière Personnel 24/7",
    description:
      "Préparation entretien, négociation salariale, conseil carrière personnalisé.",
    images: [DEFAULT_OG_IMAGE],
  },
  alternates: {
    canonical: `${SITE_URL}/assistant`,
  },
};

/**
 * Metadata pour la page Pricing
 */
export const pricingMetadata: Metadata = {
  title: "Tarifs & Abonnements - Plans Gratuit, Essentiel, Pro | HuntZen",
  description:
    "Plans tarifaires HuntZen : Gratuit (3 recherches/jour), Essentiel 8.90€/mois, Pro 13.90€/mois, Premium 19.90€/mois. Analyse CV illimitée, coaching 24/7, sans engagement.",
  keywords: [
    "tarifs huntzen",
    "prix",
    "abonnement",
    "gratuit",
    "essai gratuit",
    "plan gratuit",
    "freemium",
    "premium",
    "pro",
    "prix emploi",
    "tarif recherche emploi",
  ],
  openGraph: {
    title: "Tarifs & Abonnements HuntZen Jobs",
    description:
      "Plans de 0€ à 19.90€/mois. Analyse CV illimitée, coaching 24/7, sans engagement.",
    url: `${SITE_URL}/pricing`,
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: {
    title: "Tarifs HuntZen Jobs",
    description: "Plans de 0€ à 19.90€/mois. Sans engagement.",
    images: [DEFAULT_OG_IMAGE],
  },
  alternates: {
    canonical: `${SITE_URL}/pricing`,
  },
};

/**
 * Metadata pour la page Terms
 */
export const termsMetadata: Metadata = {
  title: "Conditions Générales d'Utilisation | HuntZen Jobs",
  description:
    "Conditions générales d'utilisation de la plateforme HuntZen Jobs. Règles d'utilisation, services, obligations, responsabilités.",
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: `${SITE_URL}/terms`,
  },
};

/**
 * Metadata pour la page Privacy
 */
export const privacyMetadata: Metadata = {
  title: "Politique de Confidentialité & RGPD | HuntZen Jobs",
  description:
    "Politique de confidentialité HuntZen Jobs. Protection des données personnelles, RGPD, cookies, sécurité.",
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: `${SITE_URL}/privacy`,
  },
};

/**
 * Helper pour générer metadata dynamiques (pages ville, secteur, etc.)
 */
export function generateLocationMetadata(
  city: string,
  citySlug: string,
): Metadata {
  return {
    title: `Offres d'Emploi à ${city} - CDI, CDD, Alternance | HuntZen`,
    description: `Trouvez votre emploi à ${city}. +1000 offres en CDI, CDD, alternance, stage. Filtres avancés, alertes emploi. Tous les secteurs à ${city}.`,
    keywords: [
      `emploi ${city.toLowerCase()}`,
      `offre emploi ${city.toLowerCase()}`,
      `job ${city.toLowerCase()}`,
      `travail ${city.toLowerCase()}`,
      `recrutement ${city.toLowerCase()}`,
      `cdi ${city.toLowerCase()}`,
      `alternance ${city.toLowerCase()}`,
    ],
    openGraph: {
      title: `Offres d'Emploi à ${city} - CDI, CDD, Alternance`,
      description: `Trouvez votre emploi à ${city}. +1000 offres en CDI, CDD, alternance.`,
      url: `${SITE_URL}/emploi-${citySlug}`,
    },
    alternates: {
      canonical: `${SITE_URL}/emploi-${citySlug}`,
    },
  };
}

export function generateSectorMetadata(
  sector: string,
  sectorSlug: string,
): Metadata {
  return {
    title: `Offres d'Emploi en ${sector} - France | HuntZen`,
    description: `Découvrez les offres d'emploi en ${sector}. Postes en CDI, CDD, alternance. Guide métiers, salaires, compétences recherchées en ${sector}.`,
    keywords: [
      `emploi ${sector.toLowerCase()}`,
      `offre ${sector.toLowerCase()}`,
      `job ${sector.toLowerCase()}`,
      `recrutement ${sector.toLowerCase()}`,
      `carrière ${sector.toLowerCase()}`,
    ],
    openGraph: {
      title: `Offres d'Emploi en ${sector}`,
      description: `Découvrez les offres d'emploi en ${sector}. CDI, CDD, alternance.`,
      url: `${SITE_URL}/emploi-${sectorSlug}`,
    },
    alternates: {
      canonical: `${SITE_URL}/emploi-${sectorSlug}`,
    },
  };
}
