import { MetadataRoute } from "next";

/**
 * Sitemap dynamique pour SEO 100/100
 * Next.js génère automatiquement /sitemap.xml
 */

const SITE_URL = "https://huntzenjobs.com";

export default function sitemap(): MetadataRoute.Sitemap {
  // Pages principales statiques
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/jobs`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/cv-analysis`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/salons`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/assistant`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/pricing`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/faq`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/temoignages`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/signup`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.5,
    },
  ];

  // TODO: Pages dynamiques (villes, secteurs, etc.)
  // Ces pages seront ajoutées dans la Phase 3 du plan SEO
  const dynamicPages: MetadataRoute.Sitemap = [];

  // Grandes villes françaises (Top 20 pour commencer)
  const topCities = [
    { name: "Paris", slug: "paris" },
    { name: "Lyon", slug: "lyon" },
    { name: "Marseille", slug: "marseille" },
    { name: "Toulouse", slug: "toulouse" },
    { name: "Bordeaux", slug: "bordeaux" },
    { name: "Lille", slug: "lille" },
    { name: "Nantes", slug: "nantes" },
    { name: "Strasbourg", slug: "strasbourg" },
    { name: "Rennes", slug: "rennes" },
    { name: "Montpellier", slug: "montpellier" },
    { name: "Nice", slug: "nice" },
    { name: "Grenoble", slug: "grenoble" },
    { name: "Dijon", slug: "dijon" },
    { name: "Angers", slug: "angers" },
    { name: "Clermont-Ferrand", slug: "clermont-ferrand" },
    { name: "Le Havre", slug: "le-havre" },
    { name: "Reims", slug: "reims" },
    { name: "Tours", slug: "tours" },
    { name: "Amiens", slug: "amiens" },
    { name: "Metz", slug: "metz" },
  ];

  // Générer URLs pour les villes (à activer quand les pages seront créées)
  // const cityPages = topCities.map(city => ({
  //   url: `${SITE_URL}/emploi-${city.slug}`,
  //   lastModified: new Date(),
  //   changeFrequency: 'daily' as const,
  //   priority: 0.8,
  // }));

  // Secteurs principaux (Top 15)
  const topSectors = [
    { name: "Informatique", slug: "informatique" },
    { name: "Commerce", slug: "commerce" },
    { name: "Marketing", slug: "marketing" },
    { name: "RH", slug: "rh" },
    { name: "Finance", slug: "finance" },
    { name: "Comptabilité", slug: "comptabilite" },
    { name: "Ingénierie", slug: "ingenierie" },
    { name: "Santé", slug: "sante" },
    { name: "Restauration", slug: "restauration" },
    { name: "Logistique", slug: "logistique" },
    { name: "BTP", slug: "btp" },
    { name: "Immobilier", slug: "immobilier" },
    { name: "Communication", slug: "communication" },
    { name: "Juridique", slug: "juridique" },
    { name: "Enseignement", slug: "enseignement" },
  ];

  // Générer URLs pour les secteurs (à activer quand les pages seront créées)
  // const sectorPages = topSectors.map(sector => ({
  //   url: `${SITE_URL}/emploi-${sector.slug}`,
  //   lastModified: new Date(),
  //   changeFrequency: 'daily' as const,
  //   priority: 0.7,
  // }));

  // Combiner toutes les URLs
  return [...staticPages, ...dynamicPages];
}
