import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const subscriptionState = vi.hoisted(() => ({
  plan: "pro",
  isLoaded: true,
}));

vi.mock("@/contexts/subscription-context", () => ({
  useOptionalSubscription: () => subscriptionState,
}));

vi.mock("@/hooks/use-plans-config", () => ({
  usePlansConfig: () => ({
    plans: [
      {
        name: "pro",
        display_name: "Pro",
        features_included: [],
        features_excluded: [],
      },
    ],
    isLoading: false,
    formatPrice: (price: number) => `${price}`,
  }),
}));

vi.mock("@/hooks/use-subscription-api", () => ({
  useSubscriptionApi: () => {
    throw new Error("Le hook réseau ne doit pas être monté par le pricing");
  },
}));

describe("usePricingData", () => {
  beforeEach(() => {
    subscriptionState.plan = "pro";
    subscriptionState.isLoaded = true;
  });

  it("réutilise l'abonnement du provider sans créer un second poller", async () => {
    const { usePricingData } = await import("@/hooks/use-pricing-data");
    const { result } = renderHook(() => usePricingData());

    expect(result.current.currentPlan).toBe("pro");
    expect(result.current.plans[0]?.isCurrentPlan).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });
});
