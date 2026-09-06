import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchFormInline } from "@/components/jobs/search-form-inline";

vi.mock("@/contexts/subscription-context", () => ({
  useSubscription: () => ({ canUse: () => true, getRemaining: () => 0, isFreePlan: false }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/api/huntzen-client", () => ({
  huntzenApi: {
    getCountries: vi.fn().mockResolvedValue([{ name: "France", code: "fr" }]),
    searchCities: vi.fn().mockResolvedValue([]),
  },
}));

describe("Formulaire réel de recherche, variantes desktop et mobile", () => {
  it.each([0, 1])("transmet métier, pays, ville et télétravail, variante %s", async (index) => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<SearchFormInline onSearch={onSearch} initialQuery="  Infirmier  " initialCountry="fr" initialLocation="Paris" initialIncludeRemote={false} />);
    await user.click(screen.getAllByRole("button", { name: "searchButton" })[index]);
    expect(onSearch).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      query: "Infirmier", country: "fr", location: "Paris", includeRemote: false,
    }));
  });

  it("ne soumet pas une recherche sans métier ni contrat", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<SearchFormInline onSearch={onSearch} initialCountry="fr" />);
    await user.click(screen.getAllByRole("button", { name: "searchButton" })[0]);
    expect(onSearch).not.toHaveBeenCalled();
    expect(screen.getAllByText("jobTitleRequired").length).toBeGreaterThan(0);
  });

  it("désactive la soumission pendant une recherche", () => {
    render(<SearchFormInline onSearch={vi.fn()} isLoading initialQuery="Infirmier" initialCountry="fr" />);
    const buttons = screen.getAllByRole("button", { name: "searchingLabel" });
    expect(buttons).toHaveLength(2);
    for (const button of buttons) expect(button).toBeDisabled();
  });
});
