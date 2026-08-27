import { describe, expect, it } from "vitest";

import { normalizeJobDescription } from "@/lib/utils/sanitize";

describe("normalizeJobDescription", () => {
  it("reste importable depuis le module utilitaire pur côté serveur", async () => {
    const pureUtils = (await import("@/lib/utils")) as Record<string, unknown>;

    expect(pureUtils.normalizeJobDescription).toBeTypeOf("function");
  });

  it("restaure les retours à la ligne échappés par les fournisseurs", () => {
    expect(
      normalizeJobDescription("Responsabilités:\\n- Concevoir\\r\\n- Tester"),
    ).toBe("Responsabilités:\n- Concevoir\n- Tester");
  });

  it("préserve les balises HTML et normalise les fins de ligne réelles", () => {
    expect(normalizeJobDescription("<strong>Mission</strong>\r\nLivrer"))
      .toBe("<strong>Mission</strong>\nLivrer");
  });
});
