"use client";

import Script from "next/script";
import { buildFaqCategories } from "./faq-data";
import { usePlansConfig } from "@/hooks/use-plans-config";
import { PLAN_LIMITS } from "@/hooks/use-freemium-limits";

export function FAQSchema() {
  const { getPlan, formatPrice } = usePlansConfig();

  const proPlan = getPlan("pro");
  const proPrice = proPlan
    ? `${formatPrice(proPlan.price_monthly)}€/mois`
    : "...";
  const freeCvLimit = PLAN_LIMITS.free.cv_analyses_per_day;

  const faqCategories = buildFaqCategories({ proPrice, freeCvLimit });

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
    <Script id="faq-schema" type="application/ld+json">
      {JSON.stringify(faqSchema)}
    </Script>
  );
}
