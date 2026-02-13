/**
 * Composants Structured Data (JSON-LD) pour SEO - Schema.org
 * NOTE: Utilisation sûre de children dans Script pour JSON-LD côté serveur
 */

import Script from "next/script";

const SITE_URL = "https://huntzenjobs.com";
const SITE_NAME = "HuntZen Jobs";

export function OrganizationSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    alternateName: ["HuntZen", "HuntZenJobs", "huntzen jobs"],
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    description:
      "Plateforme N°1 de recherche d'emploi en France - HuntZen Jobs. +100 000 offres, analyse CV ATS, coaching IA personnalisé.",
    sameAs: [
      "https://www.linkedin.com/company/huntzenjobs",
      "https://twitter.com/huntzenjobs",
      "https://www.facebook.com/huntzenjobs",
    ],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer service",
      availableLanguage: ["French"],
    },
  };

  return (
    <Script id="organization-schema" type="application/ld+json">
      {JSON.stringify(schema)}
    </Script>
  );
}

export function WebSiteSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/jobs?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <Script id="website-schema" type="application/ld+json">
      {JSON.stringify(schema)}
    </Script>
  );
}

export function HomePageSchemas() {
  return (
    <>
      <OrganizationSchema />
      <WebSiteSchema />
    </>
  );
}
