import { getTranslations } from "next-intl/server";
import { LandingHeader } from "@/components/landing-header";
import { HeroSection } from "@/components/landing/hero-section";
import { TrustBar } from "@/components/landing/trust-bar";
import { ToolsCarousel } from "@/components/landing/tools-carousel";
import { FeaturesShowcase } from "@/components/landing/features-showcase";
import { StatsSection } from "@/components/landing/stats-section";
import { PricingLandingWrapper } from "@/components/landing/pricing-landing-wrapper";
import { CtaFinalSection } from "@/components/landing/cta-final-section";
import { ReferralTracker } from "@/components/landing/referral-tracker";
import { Footer } from "@/components/layout/footer";
import { plusJakartaSans } from "@/lib/fonts";

const CAROUSEL_KEYS = [
  "jobSearch",
  "cvAnalysis",
  "nova",
  "maria",
  "sofia",
  "lucas",
  "david",
  "salons",
  "savedJobs",
  "recruiterContact",
  "documents",
  "expat",
] as const;

export default async function HomePage() {
  const tHero = await getTranslations("hero");
  const tTrustBar = await getTranslations("trustBar");
  const tFeatures = await getTranslations("features");
  const tFeaturesGrid = await getTranslations("featuresGrid");
  const tStats = await getTranslations("stats");
  const tPricing = await getTranslations("pricing");
  const tCtaFinal = await getTranslations("ctaFinal");

  const carouselItems = CAROUSEL_KEYS.map((key) => ({
    name: tFeaturesGrid(`items.${key}.name`),
    desc: tFeaturesGrid(`items.${key}.desc`),
    badge:
      key === "lucas"
        ? tFeaturesGrid("badgeSoon")
        : key === "recruiterContact"
          ? tFeaturesGrid("recruiterBadge")
          : null,
  }));

  return (
    <main
      className={`min-h-screen bg-white ${plusJakartaSans.variable} font-[family-name:var(--font-plus-jakarta)]`}
    >
      <LandingHeader />

      <HeroSection
        texts={{
          tag: tHero("tag"),
          h1: tHero("h1"),
          h2: tHero("h2"),
          subtitle: tHero("subtitle"),
          ctaSearch: tHero("ctaSearch"),
          ctaDiscover: tHero("ctaDiscover"),
          socialProof: tHero("socialProof"),
        }}
      />

      <TrustBar
        texts={{
          title: tTrustBar("title"),
          andMore: tTrustBar("andMore"),
        }}
      />

      <ToolsCarousel
        texts={{
          title: tFeaturesGrid("title"),
          subtitle: tFeaturesGrid("subtitle"),
        }}
        items={carouselItems}
      />

      <FeaturesShowcase
        texts={{
          jobs: {
            badge: tFeatures("jobs.badge"),
            title: tFeatures("jobs.title"),
            description: tFeatures("jobs.description"),
            bullets: [
              tFeatures("jobs.bullet1"),
              tFeatures("jobs.bullet2"),
              tFeatures("jobs.bullet3"),
              tFeatures("jobs.bullet4"),
            ],
            cta: tFeatures("jobs.cta"),
          },
          cv: {
            badge: tFeatures("cv.badge"),
            title: tFeatures("cv.title"),
            description: tFeatures("cv.description"),
            bullets: [
              tFeatures("cv.bullet1"),
              tFeatures("cv.bullet2"),
              tFeatures("cv.bullet3"),
              tFeatures("cv.bullet4"),
            ],
            cta: tFeatures("cv.cta"),
          },
          coaches: {
            badge: tFeatures("coaches.badge"),
            title: tFeatures("coaches.title"),
            description: tFeatures("coaches.description"),
            cta: tFeatures("coaches.cta"),
            list: (["nova", "maria", "sofia", "lucas", "david"] as const).map(
              (key) => ({
                name: {
                  nova: "Nova",
                  maria: "Maria",
                  sofia: "Sofia",
                  lucas: "Lucas",
                  david: "David",
                }[key],
                desc: tFeatures(`coaches.list.${key}`),
              }),
            ),
          },
        }}
      />

      <StatsSection
        texts={{
          title: tStats("title"),
          subtitle: tStats("subtitle"),
          disclaimer: tStats("disclaimer"),
          stats: [
            {
              value: tStats("candidates.value"),
              label: tStats("candidates.label"),
            },
            {
              value: tStats("responseRate.value"),
              label: tStats("responseRate.label"),
            },
            { value: tStats("salary.value"), label: tStats("salary.label") },
          ],
        }}
      />

      <PricingLandingWrapper
        texts={{
          title: tPricing("title"),
          subtitle: tPricing("subtitle"),
        }}
      />

      <CtaFinalSection
        texts={{
          title: tCtaFinal("title"),
          subtitle: tCtaFinal("subtitle"),
          cta: tCtaFinal("cta"),
        }}
      />

      <Footer />
      <ReferralTracker />
    </main>
  );
}
