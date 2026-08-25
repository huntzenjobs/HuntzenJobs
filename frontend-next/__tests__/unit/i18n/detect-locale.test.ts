import { describe, expect, it } from "vitest";

import { detectLocale } from "@/i18n/detect-locale";

describe("detectLocale", () => {
  it("sert l'anglais aux visiteurs des États-Unis", () => {
    expect(detectLocale("US", null)).toBe("en");
  });

  it("utilise Accept-Language si la géolocalisation est absente", () => {
    expect(detectLocale(null, "en-US,en;q=0.9,fr;q=0.7")).toBe("en");
    expect(detectLocale(undefined, "es-MX,es;q=0.9,en;q=0.5")).toBe("es");
  });

  it("préfère le pays au navigateur et normalise le code pays", () => {
    expect(detectLocale("br", "fr-FR,fr;q=0.9")).toBe("pt");
  });

  it("utilise l'anglais comme langue neutre si aucun signal n'est exploitable", () => {
    expect(detectLocale(null, "de-DE,de;q=0.9")).toBe("en");
    expect(detectLocale(null, null)).toBe("en");
  });
});
