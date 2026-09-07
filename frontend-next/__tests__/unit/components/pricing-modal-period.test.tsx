import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, it, vi } from "vitest";
import messages from "../../../messages/fr.json";
import { PricingModal } from "@/components/freemium/pricing-modal";

vi.unmock("next-intl");
vi.mock("@/contexts/subscription-context", () => ({
  useSubscription: () => ({ showPricingModal: true, closePricingModal: vi.fn(), pricingModalFeature: "cv" }),
}));
vi.mock("@/contexts/auth-context", () => ({ useOptionalAuth: () => null }));
vi.mock("@/lib/track", () => ({ track: { payment: { pricingViewed: vi.fn() } } }));
vi.mock("@/hooks/use-pricing-data", () => ({
  usePricingData: () => ({
    plans: [
      { name: "free", display_name: "Exploration", price_monthly: 0, price_yearly: 0, description: "Découverte", features: [], features_excluded: [], color: "zinc", icon: "Gift" },
      { name: "starter", display_name: "Recherche Active", price_monthly: 9.99, price_yearly: 99.9, description: "Recherche", features: [], features_excluded: [], color: "blue", icon: "Zap" },
    ],
    currentPlan: "free", isLoading: false,
    formatPrice: (price: number) => price.toFixed(2).replace(".", ","),
  }),
}));
afterEach(cleanup);

it("affiche la période payante, sans annoncer le tarif mensuel comme gratuit", () => {
  render(<NextIntlClientProvider locale="fr" messages={messages}><PricingModal /></NextIntlClientProvider>);
  expect(screen.getByText("9,99€").parentElement).toHaveTextContent("/mois");
  expect(screen.getAllByText("Gratuit")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Basculer la période de facturation" }));
  expect(screen.getByText("99,90€").parentElement).toHaveTextContent("/an");
  expect(screen.getAllByText("Gratuit")).toHaveLength(1);
});
