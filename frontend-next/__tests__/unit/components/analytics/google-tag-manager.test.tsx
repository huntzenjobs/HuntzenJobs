import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { GoogleTagManager } from "@/components/analytics/google-tag-manager";

describe("GoogleTagManager", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("ne charge pas GTM avant le consentement", () => {
    render(<GoogleTagManager />);

    expect(document.getElementById("google-tag-manager")).toBeNull();
  });

  it("charge GTM sur toutes les pages après un consentement déjà enregistré", async () => {
    localStorage.setItem("huntzen_cookie_consent", "accepted");

    render(<GoogleTagManager />);

    await waitFor(() => {
      expect(document.getElementById("google-tag-manager")).not.toBeNull();
    });
  });

  it("charge GTM immédiatement lorsque le bandeau accepte les cookies", async () => {
    render(<GoogleTagManager />);

    fireEvent(
      window,
      new CustomEvent("huntzen:cookie-consent", {
        detail: "accepted",
      }),
    );

    await waitFor(() => {
      expect(document.getElementById("google-tag-manager")).not.toBeNull();
    });
  });
});
