/**
 * FAQ Page - HuntZen Jobs
 * Questions fréquentes optimisées pour SEO et Google Featured Snippets
 * Server Component avec metadata SEO + Schema.org
 */

import { Metadata } from "next";
import { faqMetadata, getLocalizedMetadata } from "@/lib/seo/metadata";
import { FAQClient } from "./faq-client";
import { FAQSchema } from "./faq-schema";

export async function generateMetadata(): Promise<Metadata> {
  return getLocalizedMetadata(faqMetadata, "faq");
}

export default function FAQPage() {
  return (
    <>
      {/* Schema FAQPage — client component pour prix dynamiques */}
      <FAQSchema />

      {/* Client component avec interactivité */}
      <FAQClient />
    </>
  );
}
