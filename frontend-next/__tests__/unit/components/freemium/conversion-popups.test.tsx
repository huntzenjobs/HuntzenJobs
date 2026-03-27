import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConversionPopup, POPUP_CONFIGS } from "@/components/freemium/conversion-popups";

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ session: { access_token: "tok" } }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/hooks/use-plans-config", () => ({
  usePlansConfig: () => ({
    getPlan: () => ({ display_name: "Starter", price_monthly: 9.99 }),
    formatPrice: (n: number) => n.toFixed(2),
  }),
}));

global.fetch = vi.fn().mockResolvedValue(
  new Response(JSON.stringify({ coupon_code: "TEST20", checkout_url: "/pricing?coupon=TEST20" }), { status: 200 })
);

describe("POPUP_CONFIGS", () => {
  it("contient les 8 pop-ups requis", () => {
    const ids = POPUP_CONFIGS.map((p) => p.id);
    expect(ids).toContain("search_limit");
    expect(ids).toContain("cv_score");
    expect(ids).toContain("session_cut");
    expect(ids).toContain("interview_score");
    expect(ids).toContain("momentum");
    expect(ids).toContain("anti_churn");
    expect(ids).toContain("inactive_7d");
    expect(ids).toContain("pricing_hover");
    expect(ids.length).toBe(8);
  });

  it("chaque popup a titleKey, bodyKey, primaryCtaKey, plan", () => {
    for (const p of POPUP_CONFIGS) {
      expect(p.titleKey).toBeTruthy();
      expect(p.bodyKey).toBeTruthy();
      expect(p.primaryCtaKey).toBeTruthy();
      expect(["starter", "pro"]).toContain(p.plan);
    }
  });
});

describe("ConversionPopup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("n'affiche rien si isOpen=false", () => {
    const { container } = render(<ConversionPopup popupId="search_limit" isOpen={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("affiche la cle de titre du popup search_limit", () => {
    render(<ConversionPopup popupId="search_limit" isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText("searchLimit.title")).toBeInTheDocument();
  });

  it("appelle onClose au click sur le bouton fermer", () => {
    const onClose = vi.fn();
    render(<ConversionPopup popupId="session_cut" isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("close"));
    expect(onClose).toHaveBeenCalled();
  });
});
