import { beforeEach, describe, expect, it, vi } from "vitest";

import { detectLocale } from "@/i18n/detect-locale";
import requestConfig from "@/i18n/request";

const requestState = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  headers: new Map<string, string>(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) => {
      const value = requestState.cookies.get(key);
      return value === undefined ? undefined : { value };
    },
  }),
  headers: async () => ({ get: (key: string) => requestState.headers.get(key) ?? null }),
}));
vi.mock("next-intl/server", () => ({ getRequestConfig: (callback: unknown) => callback }));

describe("detectLocale", () => {
  it("sert l'anglais aux visiteurs des États-Unis", () => {
    expect(detectLocale("US", null)).toBe("en");
  });

  it("utilise Accept-Language si la géolocalisation est absente", () => {
    expect(detectLocale(null, "en-US,en;q=0.9,fr;q=0.7")).toBe("en");
    expect(detectLocale(undefined, "es-MX,es;q=0.9,en;q=0.5")).toBe("en");
  });

  it("préfère le pays au navigateur et normalise le code pays", () => {
    expect(detectLocale("br", "fr-FR,fr;q=0.9")).toBe("en");
  });

  it.each(["FR", "BE", "CH", "CA", "SN", "BJ", "DZ", "RE", "HT"])(
    "sert le français dans le marché francophone %s",
    (country) => expect(detectLocale(country, "en-US")).toBe("fr"),
  );

  it.each(["US", "GB", "DE", "ES", "BR", "PT", "JP"])(
    "sert l'anglais hors des marchés francophones : %s",
    (country) => expect(detectLocale(country, "fr-FR")).toBe("en"),
  );

  it("utilise l'anglais comme langue neutre si aucun signal n'est exploitable", () => {
    expect(detectLocale(null, "de-DE,de;q=0.9")).toBe("en");
    expect(detectLocale(null, null)).toBe("en");
  });
});

describe("langue du premier rendu serveur", () => {
  beforeEach(() => {
    requestState.cookies.clear();
    requestState.headers.clear();
    requestState.headers.set("x-vercel-ip-country", "US");
  });

  it("ignore un ancien cookie français automatique aux États-Unis", async () => {
    requestState.cookies.set("NEXT_LOCALE", "fr");
    const config = await requestConfig({ requestLocale: Promise.resolve(undefined) });
    expect(config.locale).toBe("en");
  });

  it.each(["fr", "en", "es", "pt"])("préserve le choix manuel %s", async (locale) => {
    requestState.cookies.set("NEXT_LOCALE", locale);
    requestState.cookies.set("LOCALE_MANUAL", "1");
    const config = await requestConfig({ requestLocale: Promise.resolve(undefined) });
    expect(config.locale).toBe(locale);
  });

  it("ignore une préférence invalide", async () => {
    requestState.cookies.set("NEXT_LOCALE", "invalid");
    requestState.cookies.set("LOCALE_MANUAL", "1");
    const config = await requestConfig({ requestLocale: Promise.resolve(undefined) });
    expect(config.locale).toBe("en");
  });
});
