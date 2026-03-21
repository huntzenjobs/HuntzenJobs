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
      "Plateforme d'aide à la recherche d'emploi en France - HuntZen Jobs. Des milliers d'offres, analyse CV ATS, coaching IA personnalisé.",
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

interface JobPostingData {
  title: string;
  description: string;
  datePosted: string;
  company: string;
  location: string;
  country?: string;
  employmentType?: string;
  salary?: { min?: number; max?: number; currency?: string };
  url?: string;
}

export function JobPostingSchema({ job }: { job: JobPostingData }) {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description,
    datePosted: job.datePosted,
    hiringOrganization: {
      "@type": "Organization",
      name: job.company,
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: job.location,
        addressCountry: job.country || "FR",
      },
    },
  };
  if (job.employmentType) schema.employmentType = job.employmentType;
  if (job.salary?.min || job.salary?.max) {
    schema.baseSalary = {
      "@type": "MonetaryAmount",
      currency: job.salary.currency || "EUR",
      value: {
        "@type": "QuantitativeValue",
        minValue: job.salary.min,
        maxValue: job.salary.max,
        unitText: "YEAR",
      },
    };
  }
  if (job.url) schema.url = job.url;

  return (
    <Script
      id={`job-posting-${job.title.slice(0, 20).replace(/\s/g, "-")}`}
      type="application/ld+json"
    >
      {JSON.stringify(schema)}
    </Script>
  );
}
