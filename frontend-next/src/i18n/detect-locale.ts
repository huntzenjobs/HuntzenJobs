export const SUPPORTED_LOCALES = ["fr", "en", "es", "pt"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

const DEFAULT_LOCALE: Locale = "en";

// Politique commerciale : français dans les marchés francophones,
// anglais ailleurs. Les quatre langues restent disponibles manuellement.
const FRENCH_COUNTRIES = new Set([
  "FR", "BE", "LU", "CH", "MC", "CA", "SN", "CI", "ML", "BF", "NE",
  "CD", "CG", "MG", "CM", "TG", "MA", "DZ", "TN", "BJ", "BI", "CF",
  "TD", "KM", "DJ", "GA", "GN", "GQ", "HT", "MU", "MR", "RW", "SC",
  "VU", "GP", "GF", "MQ", "RE", "YT", "NC", "PF", "PM", "BL", "MF", "WF",
]);

export function isSupportedLocale(value: string | undefined): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

export function detectLocale(
  countryCode: string | null | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  const country = countryCode?.trim().toUpperCase();
  if (country && /^[A-Z]{2}$/.test(country) && country !== "XX") {
    return FRENCH_COUNTRIES.has(country) ? "fr" : "en";
  }

  const browserLocales = (acceptLanguage ?? "")
    .split(",")
    .map((part) => part.trim().split(";")[0]?.split("-")[0]?.toLowerCase())
    .filter((locale): locale is string => Boolean(locale));
  const supportedBrowserLocale = browserLocales.find(
    (locale) => locale === "fr" || locale === "en",
  );

  return supportedBrowserLocale ?? DEFAULT_LOCALE;
}
