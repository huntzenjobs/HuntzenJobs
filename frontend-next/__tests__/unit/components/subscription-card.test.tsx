import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SubscriptionCard } from "@/components/profile/subscription-card";

const openPricingModal = vi.fn();

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ session: { access_token: "test-access-token" } }),
}));

vi.mock("@/contexts/subscription-context", () => ({
  useSubscription: () => ({
    plan: "starter",
    planName: "Starter",
    isFreePlan: false,
    isPaidPlan: true,
    isLoaded: true,
    openPricingModal,
    limits: {
      ats_scores_per_day: 5,
      matching_scores_per_day: 5,
      assistant_messages_per_day: 20,
      job_searches_per_day: 20,
    },
    subscriptionStatus: "past_due",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: "2026-09-24T15:52:25+00:00",
  }),
}));

vi.mock("@/components/freemium/usage-counter", () => ({
  UsageCounter: ({ feature }: { feature: string }) => <span>{feature}</span>,
}));

vi.mock("@/components/freemium/conversion-popups", () => ({
  useConversionPopup: () => ({
    open: vi.fn(),
    PopupComponent: () => null,
  }),
}));

vi.mock("@/hooks/use-plans-config", () => ({
  usePlansConfig: () => ({
    getPlan: (plan: string) => ({
      name: plan,
      display_name: plan === "starter" ? "Starter" : "Pro",
      description: "Description du plan",
      price_monthly: plan === "starter" ? 8.9 : 13.9,
    }),
    formatPrice: (price: number) => price.toFixed(2).replace(".", ","),
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("SubscriptionCard", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("affiche l'erreur Stripe quand le portail client est indisponible", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Portail indisponible" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    render(<SubscriptionCard />);
    fireEvent.click(screen.getByRole("button", { name: "updateCard" }));

    expect(
      await screen.findByRole("alert", { name: "Portail indisponible" }),
    ).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "updateCard" })).toBeEnabled(),
    );
  });
});
