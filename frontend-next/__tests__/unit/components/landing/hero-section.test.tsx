import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { HeroSection } from "@/components/landing/hero-section";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <div role="img" aria-label={alt} />,
}));

const texts = {
  tag: "Votre allié carrière",
  h1: "Trouvez le poste qui vous ressemble",
  h2: "Une recherche plus simple",
  subtitle: "Des outils concrets pour avancer.",
  ctaSearch: "Commencer",
  ctaDiscover: "Découvrir",
  socialProof: "Déjà adopté par nos utilisateurs",
};

describe("HeroSection", () => {
  it("reste compact sur un mobile court sans modifier la mise en page desktop", () => {
    render(<HeroSection texts={texts} />);

    const heading = screen.getByRole("heading", { level: 1 });
    const primaryAction = screen.getByRole("link", { name: /Commencer/ });

    expect(heading).toHaveClass("text-[2rem]", "sm:text-5xl");
    expect(primaryAction).toHaveClass("py-3", "sm:py-4");
    expect(primaryAction).toBeInTheDocument();
  });
});
