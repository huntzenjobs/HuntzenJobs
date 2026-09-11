import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const locales = ["fr", "en", "es", "pt"] as const;
const publicMessageScopes = [
  "hero",
  "stats",
  "pricing",
  "ctaFinal",
  "about",
  "testimonials",
] as const;

function readPublicCopy(locale: (typeof locales)[number]): string {
  const messages = JSON.parse(
    readFileSync(resolve(process.cwd(), `messages/${locale}.json`), "utf8"),
  ) as Record<string, unknown>;

  return JSON.stringify(
    Object.fromEntries(
      publicMessageScopes.map((scope) => [scope, messages[scope]]),
    ),
  );
}

describe("public marketing claims", () => {
  it.each(locales)(
    "keeps %s public copy free from unverified social-proof metrics",
    (locale) => {
      expect(readPublicCopy(locale)).not.toMatch(
        /87%|\+\s*35%|50\s?K\+|\+?10[,.]?000|100%|24\/7|24h\/24|thousands of candidates|milliers de candidats|miles de candidatos|milhares de candidatos/i,
      );
    },
  );

  it("does not render unverified review schema or testimonial data", () => {
    const testimonialsPage = readFileSync(
      resolve(process.cwd(), "src/app/temoignages/page.tsx"),
      "utf8",
    );

    expect(testimonialsPage).not.toContain("aggregateRating");
    expect(testimonialsPage).not.toContain("testimonials-data");
  });
});

describe("pricing availability", () => {
  it("hides unavailable interview simulations from plan entitlements", () => {
    const pricingPage = readFileSync(
      resolve(process.cwd(), "src/app/pricing/page.tsx"),
      "utf8",
    );

    expect(pricingPage).toContain("filterUnavailablePlanFeatures(p.features)");
    expect(pricingPage).toMatch(
      /simulation d\['’\]entretien\|interview simulation/,
    );
  });

  it("does not list an unavailable interview simulation in the account subscription card", () => {
    const subscriptionCard = readFileSync(
      resolve(process.cwd(), "src/components/profile/subscription-card.tsx"),
      "utf8",
    );

    expect(subscriptionCard).not.toContain('"has_interview_sim"');
  });
});
