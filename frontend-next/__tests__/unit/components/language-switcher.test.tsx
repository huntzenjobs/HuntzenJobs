import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  LanguageSwitcher,
  LanguageSwitcherCompact,
} from "@/components/language-switcher";

vi.mock("@/contexts/i18n-context", () => ({
  LOCALE_LABELS: {
    fr: "Français",
    en: "English",
    es: "Español",
    pt: "Português",
  },
  useLocale: () => ({
    locale: "fr",
    setLocale: vi.fn(),
    supportedLocales: ["fr", "en", "es", "pt"],
  }),
}));

describe("LanguageSwitcher", () => {
  it("utilise des noms traduits et des cibles tactiles de 44 px", () => {
    render(
      <>
        <LanguageSwitcher />
        <LanguageSwitcherCompact />
      </>,
    );

    expect(screen.getByRole("button", { name: "changeLanguage" })).toHaveClass(
      "min-h-11",
    );

    const compactButtons = screen.getAllByRole("button", { name: "switchTo" });
    expect(compactButtons).toHaveLength(4);
    compactButtons.forEach((button) => expect(button).toHaveClass("size-11"));
  });
});
