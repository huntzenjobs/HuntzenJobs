import { describe, expect, it } from "vitest";

import { isPromoClaimApplied } from "@/app/(dashboard)/profile/profile-client";

describe("isPromoClaimApplied", () => {
  it.each(["queued", "pending"] as const)(
    "conserve le code tant que la livraison de la promo est %s",
    (status) => {
      expect(
        isPromoClaimApplied({
          ok: true,
          status,
          applied: false,
          promo_link_id: "link-123",
          message: "Code promo pris en compte.",
        }),
      ).toBe(false);
    },
  );

  it("autorise la finalisation uniquement après application effective", () => {
    expect(
      isPromoClaimApplied({
        ok: true,
        status: "applied",
        applied: true,
        promo_link_id: "link-123",
        message: "Code promo appliqué.",
      }),
    ).toBe(true);
  });
});
