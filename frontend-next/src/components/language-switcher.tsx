"use client";

import {
  useLocale,
  LOCALE_FLAGS,
  LOCALE_LABELS,
  Locale,
} from "@/contexts/i18n-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Globe } from "lucide-react";

/**
 * Language Switcher Component
 *
 * Allows users to change the application language.
 * Uses IP-based detection by default, but users can override.
 *
 * @example
 * <LanguageSwitcher />
 */
export function LanguageSwitcher() {
  const { locale, setLocale, supportedLocales } = useLocale();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
          aria-label="Change language"
        >
          <Globe className="h-4 w-4" />
          <span className="hidden sm:inline">
            {LOCALE_FLAGS[locale]} {LOCALE_LABELS[locale]}
          </span>
          <span className="sm:hidden">{LOCALE_FLAGS[locale]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {supportedLocales.map((lang) => (
          <DropdownMenuItem
            key={lang}
            onClick={() => setLocale(lang)}
            className={`gap-2 cursor-pointer ${
              locale === lang ? "bg-accent" : ""
            }`}
          >
            <span className="text-lg">{LOCALE_FLAGS[lang]}</span>
            <span>{LOCALE_LABELS[lang]}</span>
            {locale === lang && (
              <span className="ml-auto text-xs text-muted-foreground">✓</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Compact Language Switcher (for mobile/small spaces)
 * Shows only flags without labels
 */
export function LanguageSwitcherCompact() {
  const { locale, setLocale, supportedLocales } = useLocale();

  return (
    <div className="flex items-center gap-1">
      {supportedLocales.map((lang) => (
        <button
          key={lang}
          onClick={() => setLocale(lang)}
          className={`
            px-2 py-1 rounded text-lg transition-all
            ${
              locale === lang
                ? "bg-primary/10 ring-2 ring-primary"
                : "hover:bg-accent opacity-60 hover:opacity-100"
            }
          `}
          aria-label={`Switch to ${LOCALE_LABELS[lang]}`}
          aria-pressed={locale === lang}
        >
          {LOCALE_FLAGS[lang]}
        </button>
      ))}
    </div>
  );
}
