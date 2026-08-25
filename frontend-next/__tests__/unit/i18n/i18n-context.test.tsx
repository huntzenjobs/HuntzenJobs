import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider, useLocale } from "@/contexts/i18n-context";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next-intl", () => ({ useLocale: () => "en" }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getUser: vi.fn() } }),
}));

function LocaleProbe() {
  const { locale } = useLocale();
  return <span data-testid="locale">{locale}</span>;
}

describe("I18nProvider", () => {
  beforeEach(() => {
    document.cookie = "NEXT_LOCALE=; Max-Age=0; path=/";
  });

  it("utilise la locale calculée côté serveur dès le premier rendu", () => {
    render(
      <I18nProvider>
        <LocaleProbe />
      </I18nProvider>,
    );

    expect(screen.getByTestId("locale")).toHaveTextContent("en");
  });
});
