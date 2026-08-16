import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SearchFormInline } from "@/components/jobs/search-form-inline";

const { toastError, canUse } = vi.hoisted(() => ({
  toastError: vi.fn(),
  canUse: vi.fn(() => true),
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) =>
    (key: string, values?: Record<string, number>) =>
      values?.count === undefined
        ? `${namespace}.${key}`
        : `${namespace}.${key}:${values.count}`,
}));

vi.mock("sonner", () => ({
  toast: { error: toastError },
}));

vi.mock("@/contexts/subscription-context", () => ({
  useSubscription: () => ({
    canUse,
    getRemaining: () => 0,
    isFreePlan: true,
  }),
}));

vi.mock("@/lib/api/huntzen-client", () => ({
  huntzenApi: {
    getCountries: vi.fn().mockResolvedValue([
      { name: "France", code: "fr" },
    ]),
    searchCities: vi.fn().mockResolvedValue([]),
  },
}));

describe("SearchFormInline", () => {
  beforeEach(() => {
    canUse.mockReturnValue(true);
    toastError.mockClear();
  });

  it("conserve une recherche populaire pendant la sélection du pays", async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(
      <SearchFormInline onSearch={vi.fn()} initialQuery="" />,
    );

    rerender(
      <SearchFormInline
        onSearch={vi.fn()}
        initialQuery="Data Scientist"
      />,
    );

    expect(container.querySelector("#query-inline")).toHaveValue(
      "Data Scientist",
    );
    expect(container.querySelector("#query-mobile")).toHaveValue(
      "Data Scientist",
    );

    const countryInputs = container.querySelectorAll(
      'input[placeholder="searchForm.countryPlaceholder"]',
    );
    await user.type(countryInputs[1] as HTMLInputElement, "France");

    expect(container.querySelector("#query-inline")).toHaveValue(
      "Data Scientist",
    );
    expect(container.querySelector("#query-mobile")).toHaveValue(
      "Data Scientist",
    );
  });

  it("utilise la traduction du message lorsque le quota est atteint", async () => {
    canUse.mockReturnValue(false);
    const user = userEvent.setup();
    const { container } = render(
      <SearchFormInline
        onSearch={vi.fn()}
        initialQuery="Data Scientist"
        initialCountry="fr"
      />,
    );

    const desktopButton = container.querySelector(
      ".hidden.md\\:block button.bg-huntzen-blue",
    );
    expect(desktopButton).toBeInstanceOf(HTMLButtonElement);
    await user.click(desktopButton as HTMLButtonElement);

    expect(toastError).toHaveBeenCalledWith(
      "searchForm.searchLimitReached:0",
    );
  });
});
