import { describe, expect, it } from "vitest";

import { localizeMetadata } from "@/lib/seo/metadata";

describe("localizeMetadata", () => {
  it("traduit les titres et descriptions SEO et sociaux sans perdre la configuration de page", () => {
    const metadata = localizeMetadata(
      {
        title: "Titre français",
        description: "Description française",
        keywords: ["emploi"],
        openGraph: {
          title: "Titre Open Graph français",
          description: "Description Open Graph française",
          url: "https://huntzenjobs.com/jobs",
        },
        twitter: {
          title: "Titre Twitter français",
          description: "Description Twitter française",
        },
        alternates: { canonical: "https://huntzenjobs.com/jobs" },
      },
      {
        title: "Jobs in France | HuntZen",
        description: "Find jobs that match your profile.",
      },
      "en",
    );

    expect(metadata).toMatchObject({
      title: "Jobs in France | HuntZen",
      description: "Find jobs that match your profile.",
      keywords: ["emploi"],
      openGraph: {
        title: "Jobs in France | HuntZen",
        description: "Find jobs that match your profile.",
        locale: "en_US",
        url: "https://huntzenjobs.com/jobs",
      },
      twitter: {
        title: "Jobs in France | HuntZen",
        description: "Find jobs that match your profile.",
      },
      alternates: { canonical: "https://huntzenjobs.com/jobs" },
    });
  });

  it("préserve l'héritage Next.js lorsque les métadonnées sociales sont absentes", () => {
    const metadata = localizeMetadata(
      { title: "Titre français", description: "Description française" },
      { title: "English title", description: "English description" },
      "en",
    );

    expect(metadata).not.toHaveProperty("openGraph");
    expect(metadata).not.toHaveProperty("twitter");
  });
});
