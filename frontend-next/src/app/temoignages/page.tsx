/**
 * Page Témoignages HuntZen Jobs
 * Social Proof + Schema Review/AggregateRating pour SEO
 */

import { Metadata } from "next";
import Script from "next/script";
import { getLocale } from "next-intl/server";
import { testimonialsMetadata } from "@/lib/seo/metadata";
import { TestimonialsClient } from "./testimonials-client";
import type { Testimonial } from "./testimonials-data";

export const metadata: Metadata = testimonialsMetadata;

async function getTestimonials(locale: string): Promise<Testimonial[]> {
  switch (locale) {
    case "en": {
      const mod = await import("./testimonials-data.en");
      return mod.testimonialsEn;
    }
    case "es": {
      const mod = await import("./testimonials-data.es");
      return mod.testimonials;
    }
    case "pt": {
      const mod = await import("./testimonials-data.pt");
      return mod.testimonials;
    }
    default: {
      const mod = await import("./testimonials-data");
      return mod.testimonials;
    }
  }
}

export default async function TestimonialsPage() {
  const locale = await getLocale();
  const testimonials = await getTestimonials(locale);

  // Calculer note moyenne et nombre total de reviews
  const totalReviews = testimonials.length;
  const averageRating =
    testimonials.reduce((acc, t) => acc + t.rating, 0) / totalReviews;

  // Schema AggregateRating pour les étoiles dans Google
  const aggregateRatingSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "HuntZen Jobs",
    url: "https://huntzenjobs.com",
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: averageRating.toFixed(1),
      reviewCount: totalReviews,
      bestRating: "5",
      worstRating: "1",
    },
  };

  // Schema Review pour chaque témoignage (Google Rich Snippets)
  const reviewsSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: testimonials.slice(0, 10).map((testimonial, index) => ({
      "@type": "Review",
      position: index + 1,
      author: {
        "@type": "Person",
        name: testimonial.name,
      },
      reviewRating: {
        "@type": "Rating",
        ratingValue: testimonial.rating,
        bestRating: "5",
        worstRating: "1",
      },
      datePublished: testimonial.date,
      reviewBody: testimonial.content,
      itemReviewed: {
        "@type": "Organization",
        name: "HuntZen Jobs",
        url: "https://huntzenjobs.com",
      },
    })),
  };

  return (
    <>
      {/* Schema AggregateRating pour Google */}
      <Script id="aggregate-rating-schema" type="application/ld+json">
        {JSON.stringify(aggregateRatingSchema)}
      </Script>

      {/* Schema Review pour Google Rich Snippets */}
      <Script id="reviews-schema" type="application/ld+json">
        {JSON.stringify(reviewsSchema)}
      </Script>

      {/* Client component avec interactivité */}
      <TestimonialsClient
        testimonials={testimonials}
        averageRating={averageRating}
        totalReviews={totalReviews}
      />
    </>
  );
}
