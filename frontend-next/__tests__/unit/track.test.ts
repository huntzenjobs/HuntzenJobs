import { afterEach, describe, expect, it, vi } from "vitest";
import { track } from "@/lib/track";

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

describe("track", () => {
  afterEach(() => {
    localStorage.clear();
    delete window.dataLayer;
    vi.restoreAllMocks();
  });

  it("publie begin_checkout dans GTM uniquement après le consentement", async () => {
    localStorage.setItem("huntzen_cookie_consent", "accepted");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response()));

    await track.payment.beginCheckout("pro", "monthly");

    expect(window.dataLayer).toEqual([
      { event: "begin_checkout", plan: "pro", billing_period: "monthly" },
    ]);
  });

  it("ne publie pas l'inscription dans GTM sans consentement", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response()));

    await track.auth.signUp("free");

    expect(window.dataLayer).toBeUndefined();
  });
});
