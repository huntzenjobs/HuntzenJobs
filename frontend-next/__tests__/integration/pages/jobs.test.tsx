import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchFormInline } from "@/components/jobs/search-form-inline";
import { parseJobSalaryAmount } from "@/lib/utils";

describe("Montants des salaires fournisseurs", () => {
  it.each([
    ["25,000 - 27,000", 25000],
    ["2,200 - 2,800", 2200],
    ["25 000 EUR/an", 25000],
    ["25\u202f000 €", 25000],
    ["12,31 EUR/heure", 12.31],
    ["12.31 EUR/hour", 12.31],
    ["Annuel de 22405.0 Euros à 27405.0 Euros", 22405],
    ["25.000,50 EUR", 25000.5],
    ["25,000.50 USD", 25000.5],
    ["45K - 55K EUR/an", 45000],
    ["45,5k €", 45500],
    ["À négocier", null],
    [undefined, null],
  ])("interprète %s sans couper les milliers", (salary, expected) => {
    expect(parseJobSalaryAmount(salary)).toBe(expected);
  });
});

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
