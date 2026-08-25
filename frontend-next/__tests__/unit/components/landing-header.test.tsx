import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LandingHeader } from "@/components/landing-header";

vi.mock("@/contexts/auth-context", () => ({
  useOptionalAuth: () => ({ user: null }),
}));

vi.mock("@/components/language-switcher", () => ({
  LanguageSwitcher: () => <button type="button">language-desktop</button>,
  LanguageSwitcherCompact: () => (
    <button type="button">language-mobile</button>
  ),
}));

describe("LandingHeader", () => {
  it("ferme le menu mobile avec Échap et rend le focus au déclencheur", async () => {
    render(<LandingHeader forceWhite />);

    const trigger = screen.getByRole("button", { name: "openMenu" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("landing-mobile-menu")).toBeInTheDocument();
    expect(screen.getByText("language-mobile")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("landing-mobile-menu")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
