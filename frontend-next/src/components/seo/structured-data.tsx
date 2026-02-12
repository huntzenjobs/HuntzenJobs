/**
 * Composants Structured Data (JSON-LD) pour SEO - Schema.org
 * NOTE: Utilisation sûre de children dans Script pour JSON-LD côté serveur
 */

import Script from "next/script";

const SITE_URL = "https://huntzenjobs.fr";
const SITE_NAME = "HuntZen Jobs";

export function OrganizationSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    description:
      "Plateforme complète pour réussir votre recherche d'emploi en France",
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
