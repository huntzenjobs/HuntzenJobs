import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/auth-context", () => ({
  useOptionalAuth: () => ({ user: null }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const translate = (key: string) => key;
    translate.rich = (key: string) => key;
    return translate;
  },
}));

vi.mock("@/components/landing-header", () => ({ LandingHeader: () => null }));
vi.mock("@/components/layout/footer", () => ({ Footer: () => null }));
vi.mock("@/components/seo/internal-links", () => ({
  InternalLinksFooter: () => null,
}));

vi.mock("@/hooks/use-plans-config", () => ({
  usePlansConfig: () => ({ getPlan: () => null, formatPrice: vi.fn() }),
}));

vi.mock("@/app/faq/faq-data", () => ({
  buildFaqCategories: () => [
    {
      category: "Catégorie",
      questions: [{ q: "Question test", a: "Réponse test" }],
    },
  ],
}));

import { FAQClient } from "@/app/faq/faq-client";

describe("FAQ", () => {
  it("nomme la recherche et expose l’état de l’accordéon", () => {
    render(<FAQClient />);

    expect(
      screen.getByRole("searchbox", { name: "searchLabel" }),
    ).toBeInTheDocument();
    const question = screen.getByRole("button", { name: "Question test" });
    expect(question).toHaveAttribute("aria-expanded", "false");
    expect(question).toHaveAttribute("aria-controls", "faq-answer-0-0");

    fireEvent.click(question);

    expect(question).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("region", { name: "Question test" }),
    ).toHaveAttribute("id", "faq-answer-0-0");
  });
});
