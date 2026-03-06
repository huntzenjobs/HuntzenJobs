"use client";

import { useLocale, LOCALE_LABELS, Locale } from "@/contexts/i18n-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import * as Flags from "country-flag-icons/react/3x2";

// Locale → ISO 3166-1 alpha-2 country code for flag rendering
const LOCALE_FLAG_CODE: Record<Locale, keyof typeof Flags> = {
  fr: "FR",
  en: "GB",
  es: "ES",
  pt: "PT",
};

function LocaleFlag({
  locale,
  className,
}: {
  locale: Locale;
  className?: string;
}) {
  const code = LOCALE_FLAG_CODE[locale];
  const FlagComponent = Flags[code];
  if (!FlagComponent) return null;
  return <FlagComponent className={cn("w-5 h-4 rounded-sm", className)} />;
}

/**
 * Language Switcher Component
 *
 * Allows users to change the application language.
 * Uses IP-based detection by default, but users can override.
 *
 * @example
 * <LanguageSwitcher />
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, supportedLocales } = useLocale();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("gap-2", className)}
          aria-label="Change language"
        >
          <Globe className="h-4 w-4" />
          <span className="hidden sm:inline">
            <LocaleFlag locale={locale} /> {LOCALE_LABELS[locale]}
          </span>
          <span className="sm:hidden">
            <LocaleFlag locale={locale} />
          </span>
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
            <LocaleFlag locale={lang} />
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
          className={cn(
            "px-2 py-1 rounded text-lg transition-all text-white",
            locale === lang
              ? "bg-white/20 ring-1 ring-white/40"
              : "opacity-50 hover:opacity-100 hover:bg-white/10",
          )}
          aria-label={`Switch to ${LOCALE_LABELS[lang]}`}
          aria-pressed={locale === lang}
        >
          <LocaleFlag locale={lang} />
        </button>
      ))}
    </div>
  );
}
