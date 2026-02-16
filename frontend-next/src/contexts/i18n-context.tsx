"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";

// Supported locales (must match middleware.ts)
export type Locale = "fr" | "en" | "es" | "pt";

const SUPPORTED_LOCALES: Locale[] = ["fr", "en", "es", "pt"];
const DEFAULT_LOCALE: Locale = "fr";
const LOCALE_COOKIE_NAME = "NEXT_LOCALE";

// Locale labels for UI
export const LOCALE_LABELS: Record<Locale, string> = {
  fr: "Français",
  en: "English",
  es: "Español",
  pt: "Português",
};

// Locale flags for UI
export const LOCALE_FLAGS: Record<Locale, string> = {
  fr: "🇫🇷",
  en: "🇬🇧",
  es: "🇪🇸",
  pt: "🇧🇷",
};

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  supportedLocales: Locale[];
}

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  // Read locale from cookie on mount
  useEffect(() => {
    const cookieLocale = getCookie(LOCALE_COOKIE_NAME);
    if (cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale as Locale)) {
      setLocaleState(cookieLocale as Locale);
    }
  }, []);

  // Update locale and cookie
  const setLocale = useCallback((newLocale: Locale) => {
    if (!SUPPORTED_LOCALES.includes(newLocale)) {
      console.warn(`Unsupported locale: ${newLocale}, falling back to ${DEFAULT_LOCALE}`);
      newLocale = DEFAULT_LOCALE;
    }

    setLocaleState(newLocale);
    setCookie(LOCALE_COOKIE_NAME, newLocale, 365); // 1 year expiry

    // Optional: Reload page to apply changes (required for middleware to pick up new cookie)
    // This ensures server-side rendering uses the correct locale
    window.location.reload();
  }, []);

  const value = {
    locale,
    setLocale,
    supportedLocales: SUPPORTED_LOCALES,
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Hook to access current locale and change it
 *
 * @example
 * const { locale, setLocale } = useLocale();
 * console.log(locale); // 'fr'
 * setLocale('en'); // Change to English
 */
export function useLocale() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useLocale must be used within I18nProvider");
  }
  return context;
}

/**
 * Optional hook that doesn't throw if outside provider (for components that may or may not have i18n)
 */
export function useOptionalLocale() {
  const context = useContext(I18nContext);
  return context || { locale: DEFAULT_LOCALE, setLocale: () => {}, supportedLocales: SUPPORTED_LOCALES };
}

// ============================================================================
// Cookie Helpers (Client-side)
// ============================================================================

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;

  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);

  if (parts.length === 2) {
    return parts.pop()?.split(";").shift() || null;
  }

  return null;
}

function setCookie(name: string, value: string, days: number) {
  if (typeof document === "undefined") return;

  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);

  document.cookie = `${name}=${value}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
}
