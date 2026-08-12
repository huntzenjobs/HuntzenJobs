export const SUPPORTED_LOCALES = ["fr", "en", "es", "pt"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

const DEFAULT_LOCALE: Locale = "en";

const COUNTRY_TO_LOCALE: Record<string, Locale> = {
  FR: "fr", BE: "fr", LU: "fr", CH: "fr", MC: "fr", SN: "fr",
  CI: "fr", ML: "fr", BF: "fr", NE: "fr", CD: "fr", CG: "fr",
  MG: "fr", CM: "fr", TG: "fr", MA: "fr", DZ: "fr", TN: "fr",
  GB: "en", US: "en", CA: "en", AU: "en", NZ: "en", IE: "en",
  IN: "en", ZA: "en", NG: "en", KE: "en",
  ES: "es", MX: "es", AR: "es", CO: "es", CL: "es", PE: "es",
  VE: "es", EC: "es", GT: "es", CU: "es", BO: "es", DO: "es",
  HN: "es", PY: "es", SV: "es",
  BR: "pt", PT: "pt", AO: "pt", MZ: "pt", GW: "pt",
};

export function isSupportedLocale(value: string | undefined): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

export function detectLocale(
  countryCode: string | null | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  const countryLocale = countryCode
    ? COUNTRY_TO_LOCALE[countryCode.toUpperCase()]
    : undefined;
  if (countryLocale) return countryLocale;

  const browserLocales = (acceptLanguage ?? "")
    .split(",")
    .map((part) => part.trim().split(";")[0]?.split("-")[0]?.toLowerCase())
    .filter((locale): locale is string => Boolean(locale));
  const supportedBrowserLocale = browserLocales.find(isSupportedLocale);

  return supportedBrowserLocale ?? DEFAULT_LOCALE;
}
