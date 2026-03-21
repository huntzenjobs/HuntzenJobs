"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Search, MapPin, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AutocompleteInput,
  type AutocompleteOption,
} from "@/components/ui/autocomplete-input";
import { useSubscription } from "@/contexts/subscription-context";
import { toast } from "sonner";
import { huntzenApi } from "@/lib/api/huntzen-client";
import { cn } from "@/lib/utils";

// ─── Fuzzy helpers ────────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let j = 1; j <= a.length; j++) {
    let prev = j;
    for (let i = 1; i <= b.length; i++) {
      const tmp = dp[i];
      dp[i] =
        a[j - 1] === b[i - 1]
          ? dp[i - 1]
          : 1 + Math.min(dp[i - 1], dp[i], prev);
      prev = tmp;
    }
  }
  return dp[b.length];
}

function fuzzyFindCountry(
  query: string,
  countries: { name: string; code: string }[],
): { name: string; code: string } | null {
  const q = query.toLowerCase().trim();
  if (!q) return null;
  const exact = countries.find((c) => c.name.toLowerCase() === q);
  if (exact) return exact;
  const startsWith = countries.filter((c) =>
    c.name.toLowerCase().startsWith(q),
  );
  if (startsWith.length === 1) return startsWith[0];
  const contains = countries.filter((c) => c.name.toLowerCase().includes(q));
  if (contains.length === 1) return contains[0];
  const sorted = countries
    .map((c) => ({ c, d: levenshtein(q, c.name.toLowerCase()) }))
    .sort((a, b) => a.d - b.d);
  return sorted[0]?.d <= 2 ? sorted[0].c : null;
}

// ─── Contract type options ──────────────────────────────────────────────────

const CONTRACT_TYPE_OPTIONS = [
  { value: "cdi", key: "contractType_cdi" },
  { value: "cdd", key: "contractType_cdd" },
  { value: "cdi_partial", key: "contractType_cdi_partial" },
  { value: "cdd_partial", key: "contractType_cdd_partial" },
  { value: "alternance", key: "contractType_alternance" },
  { value: "apprentissage", key: "contractType_apprentissage" },
  { value: "freelance", key: "contractType_freelance" },
  { value: "internship", key: "contractType_internship" },
] as const;

/**
 * SearchFormInline - Horizontal search form for Jobs page
 *
 * Layout:
 * - Desktop: Horizontal (3 inputs + 2 buttons in a row)
 * - Mobile: Vertical (stacked inputs and buttons)
 *
 * Features:
 * - AutocompleteInput for country and city
 * - Contract type filter chips (search without job title)
 * - Freemium usage check before search
 * - Validation with inline feedback
 */

interface SearchFormInlineProps {
  onSearch: (params: SearchParams) => void;
  isLoading?: boolean;
  disabled?: boolean;
  initialQuery?: string;
}

export interface SearchParams {
  query: string;
  location: string;
  country: string;
  contractType?: string;
  includeRemote?: boolean;
}

export function SearchFormInline({
  onSearch,
  isLoading = false,
  disabled = false,
  initialQuery,
}: SearchFormInlineProps) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [location, setLocation] = useState("");
  const [country, setCountry] = useState("");
  const [selectedCountryName, setSelectedCountryName] = useState("");
  const [isCountryValid, setIsCountryValid] = useState(false);
  const [contractType, setContractType] = useState("");
  const [includeRemote, setIncludeRemote] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const t = useTranslations("searchForm");
  const tJobs = useTranslations("jobs");
  const { canUse, getRemaining, isFreePlan } = useSubscription();

  // Fetch countries for autocomplete
  const fetchCountries = async (
    query: string,
  ): Promise<AutocompleteOption[]> => {
    if (!query) return [];
    try {
      const countries = await huntzenApi.getCountries();
      return countries
        .filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 8)
        .map((c) => ({ label: c.name, value: c.code }));
    } catch {
      return [];
    }
  };

  // Fetch cities/regions/departments for autocomplete
  const fetchCities = async (query: string): Promise<AutocompleteOption[]> => {
    if (!query || query.length < 1 || !country) {
      return [];
    }
    try {
      const locations = await huntzenApi.searchCities(query, country);
      return locations.map((loc) => {
        const suffix =
          loc.type === "region"
            ? " · Région"
            : loc.type === "department"
              ? ` · Dép. ${loc.code ?? ""}`
              : "";
        return { label: loc.name + suffix, value: loc.name };
      });
    } catch {
      return [];
    }
  };

  // Fuzzy-resolve a typed country name on blur (called by AutocompleteInput)
  const handleCountryBlurResolve = async (
    text: string,
  ): Promise<AutocompleteOption | null> => {
    try {
      const countries = await huntzenApi.getCountries();
      const match = fuzzyFindCountry(text, countries);
      if (match) return { label: match.name, value: match.code };
    } catch {}
    return null;
  };

  // Handle country selection
  const handleCountryChange = (value: string) => {
    setCountry(value);

    if (!value) {
      setSelectedCountryName("");
      setIsCountryValid(false);
      return;
    }

    if (value.length >= 2 && value.length <= 3) {
      huntzenApi.getCountries().then((countries) => {
        const found = countries.find(
          (c) => c.code.toLowerCase() === value.toLowerCase(),
        );
        if (found) {
          setSelectedCountryName(found.name);
          setIsCountryValid(true);
        } else {
          setIsCountryValid(false);
        }
      });
    } else {
      setIsCountryValid(false);
    }
  };

  // Toggle contract type (single select, click again to deselect)
  const handleContractTypeToggle = (value: string) => {
    setContractType((prev) => (prev === value ? "" : value));
  };

  // Validation: query OR contractType required, country always required
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!query.trim() && !contractType) {
      newErrors.query = t("jobTitleRequired");
    }

    if (!country.trim()) {
      newErrors.country = t("countryRequired");
    } else if (!isCountryValid) {
      newErrors.country = t("selectCountryInList");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle search
  const handleSearch = () => {
    if (!validate()) {
      toast.error(tJobs("toasts.fillAllFields"));
      return;
    }

    if (!canUse("job_search")) {
      const remaining = getRemaining("job_search");
      toast.error(`Limite de recherches atteinte. Rechargez à ${remaining}`);
      return;
    }

    onSearch({
      query: query.trim(),
      location: location.trim(),
      country: country.trim(),
      contractType,
      includeRemote,
    });

    setErrors({});
  };

  // Sync initialQuery prop
  useEffect(() => {
    if (initialQuery !== undefined && initialQuery !== "") {
      setQuery(initialQuery);
    }
  }, [initialQuery]);

  // Clear errors when user types or selects filters
  useEffect(() => {
    if (query.trim() || contractType) {
      setErrors((prev) => ({ ...prev, query: "" }));
    }
  }, [query, contractType]);

  useEffect(() => {
    if (country.trim()) {
      setErrors((prev) => ({ ...prev, country: "" }));
    }
  }, [country]);

  // ─── Contract type chips (shared between desktop and mobile) ──────────────

  const contractTypeChips = (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-500">
        {t("contractTypeLabel")}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {CONTRACT_TYPE_OPTIONS.map(({ value, key }) => (
          <button
            key={value}
            type="button"
            onClick={() => handleContractTypeToggle(value)}
            disabled={disabled || isLoading}
            className={cn(
              "text-xs px-3 py-1.5 rounded-full border transition-colors font-medium",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              contractType === value
                ? "bg-huntzen-blue text-white border-huntzen-blue"
                : "bg-white text-gray-600 border-gray-200 hover:border-huntzen-blue hover:text-huntzen-blue",
            )}
          >
            {t(key)}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="w-full">
      {/* Desktop: Horizontal Layout */}
      <div className="hidden md:block p-6 bg-white rounded-xl shadow-sm border border-gray-200">
        {/* Main Search Inputs Row */}
        <div className="flex items-start gap-3 mb-4">
          {/* Query Input */}
          <div className="flex-1 min-w-0">
            <label htmlFor="query-inline" className="sr-only">
              {t("jobTitlePlaceholder")}
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
              <input
                id="query-inline"
                type="text"
                placeholder={contractType ? t("jobTitleOptional") : t("jobTitlePlaceholder")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={disabled || isLoading}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
                className={cn(
                  "w-full pl-10 pr-4 py-3 bg-white text-gray-900 border rounded-lg text-sm font-medium",
                  "placeholder:text-gray-400 placeholder:font-normal",
                  "focus:outline-none focus:ring-2 focus:ring-offset-0 transition-all duration-200",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  errors.query
                    ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                    : "border-gray-300 focus:ring-blue-500 focus:border-blue-500",
                )}
                aria-invalid={!!errors.query}
                aria-describedby={errors.query ? "query-error" : undefined}
              />
            </div>
            {errors.query && (
              <p id="query-error" className="mt-1 text-xs text-red-600">
                {errors.query}
              </p>
            )}
          </div>

          {/* Country Autocomplete */}
          <div className="flex-1 min-w-0">
            <AutocompleteInput
              placeholder={t("countryPlaceholder")}
              value={country}
              onChange={handleCountryChange}
              onSearch={fetchCountries}
              onBlurResolve={handleCountryBlurResolve}
              disabled={disabled || isLoading}
              icon={<Globe className="h-5 w-5" />}
              error={!!errors.country}
              helperText={errors.country}
              typingPromptMessage={t("typeYourCountry")}
              emptyMessage={t("noCountryFound")}
              required
            />
          </div>

          {/* Location Autocomplete */}
          <div className="flex-1 min-w-0">
            <AutocompleteInput
              placeholder={t("locationPlaceholder")}
              value={location}
              onChange={setLocation}
              onSearch={fetchCities}
              disabled={disabled || isLoading || !isCountryValid}
              icon={<MapPin className="h-5 w-5" />}
              typingPromptMessage={
                !isCountryValid ? undefined : t("typeYourCity")
              }
              emptyMessage={
                !isCountryValid ? t("selectCountryFirst") : t("noCityFound")
              }
            />
          </div>

          {/* Action Button */}
          <div className="flex-shrink-0">
            <Button
              onClick={() => handleSearch()}
              disabled={disabled || isLoading}
              size="lg"
              className="px-6 whitespace-nowrap bg-huntzen-blue hover:bg-huntzen-blue-dark text-white"
            >
              {isLoading ? t("searchingLabel") : t("searchButton")}
            </Button>
          </div>
        </div>

        {/* Contract Type Filter Chips */}
        {contractTypeChips}

        {/* Options Row: Remote Checkbox */}
        <div className="flex items-center gap-4 pt-3 mt-3 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="include-remote-desktop"
              checked={includeRemote}
              onChange={(e) => setIncludeRemote(e.target.checked)}
              disabled={disabled || isLoading}
              className="w-4 h-4 text-huntzen-blue bg-gray-100 border-gray-300 rounded focus:ring-huntzen-blue focus:ring-2 disabled:opacity-50"
            />
            <label
              htmlFor="include-remote-desktop"
              className="text-sm font-medium text-gray-700 cursor-pointer select-none whitespace-nowrap"
            >
              {t("includeRemote")}
            </label>
          </div>
        </div>
      </div>

      {/* Mobile: Vertical Layout */}
      <div className="md:hidden space-y-4 p-4 bg-white rounded-xl shadow-sm border border-gray-200">
        {/* Query Input */}
        <div>
          <label htmlFor="query-mobile" className="sr-only">
            {t("jobTitlePlaceholder")}
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
            <input
              id="query-mobile"
              type="text"
              placeholder={contractType ? t("jobTitleOptional") : t("jobTitlePlaceholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={disabled || isLoading}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSearch();
                }
              }}
              className={cn(
                "w-full pl-10 pr-4 py-3 bg-white text-gray-900 border rounded-lg text-sm font-medium",
                "placeholder:text-gray-400 placeholder:font-normal",
                "focus:outline-none focus:ring-2 focus:ring-offset-0 transition-all duration-200",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                errors.query
                  ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                  : "border-gray-300 focus:ring-blue-500 focus:border-blue-500",
              )}
              aria-invalid={!!errors.query}
              aria-describedby={errors.query ? "query-error-mobile" : undefined}
            />
          </div>
          {errors.query && (
            <p id="query-error-mobile" className="mt-1 text-xs text-red-600">
              {errors.query}
            </p>
          )}
        </div>

        {/* Country Autocomplete */}
        <AutocompleteInput
          placeholder={t("countryPlaceholder")}
          value={country}
          onChange={handleCountryChange}
          onSearch={fetchCountries}
          onBlurResolve={handleCountryBlurResolve}
          disabled={disabled || isLoading}
          icon={<Globe className="h-5 w-5" />}
          error={!!errors.country}
          helperText={errors.country}
          typingPromptMessage={t("typeYourCountry")}
          emptyMessage={t("noCountryFound")}
          required
        />

        {/* Location Autocomplete */}
        <AutocompleteInput
          placeholder={t("locationPlaceholder")}
          value={location}
          onChange={setLocation}
          onSearch={fetchCities}
          disabled={disabled || isLoading || !isCountryValid}
          icon={<MapPin className="h-5 w-5" />}
          typingPromptMessage={!isCountryValid ? undefined : t("typeYourCity")}
          emptyMessage={
            !isCountryValid ? t("selectCountryFirst") : t("noCityFound")
          }
        />

        {/* Contract Type Filter Chips */}
        {contractTypeChips}

        {/* Include Remote Jobs Checkbox */}
        <div className="flex items-center gap-3 px-4 py-3">
          <input
            type="checkbox"
            id="include-remote-mobile"
            checked={includeRemote}
            onChange={(e) => setIncludeRemote(e.target.checked)}
            disabled={disabled || isLoading}
            className="w-4 h-4 text-huntzen-blue bg-gray-100 border-gray-300 rounded focus:ring-huntzen-blue focus:ring-2 disabled:opacity-50"
          />
          <label
            htmlFor="include-remote-mobile"
            className="text-sm font-medium text-gray-700 cursor-pointer select-none"
          >
            {t("includeRemote")}
          </label>
        </div>

        {/* Action Button */}
        <div className="w-full">
          <Button
            onClick={() => handleSearch()}
            disabled={disabled || isLoading}
            size="lg"
            className="w-full bg-huntzen-blue hover:bg-huntzen-blue-dark text-white"
          >
            {isLoading ? t("searchingLabel") : t("searchButton")}
          </Button>
        </div>
      </div>

      {/* Remaining usage indicator (freemium) */}
      {isFreePlan && (
        <div className="mt-3 text-center">
          <p className="text-xs text-gray-500">
            {t("searchesRemaining", { count: getRemaining("job_search") })}
          </p>
        </div>
      )}
    </div>
  );
}
