/**
 * FAQ Page - HuntZen Jobs
 * Questions fréquentes optimisées pour SEO et Google Featured Snippets
 * Server Component avec metadata SEO + Schema.org
 */

import { Metadata } from "next";
import Script from "next/script";
import { faqMetadata } from "@/lib/seo/metadata";
import { FAQClient } from "./faq-client";
import { faqCategories } from "./faq-data";

export const metadata: Metadata = faqMetadata;

export default function FAQPage() {
  // Créer le schema FAQPage pour Google Featured Snippets
  // Build mainEntity array manually to avoid flatMap serialization issues
  const mainEntity = [];
  for (const category of faqCategories) {
    for (const item of category.questions) {
      mainEntity.push({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.a,
        },
      });
    }
  }

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity,
  };

  return (
    <>
      {/* Schema FAQPage pour Google Featured Snippets */}
      <Script id="faq-schema" type="application/ld+json">
        {JSON.stringify(faqSchema)}
      </Script>

      {/* Client component avec interactivité */}
      <FAQClient />
    </>
  );
}
