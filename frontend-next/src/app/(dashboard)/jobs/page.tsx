"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useJobTranslation } from "@/hooks/use-job-translation";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  MapPin,
  Building,
  ExternalLink,
  Loader2,
  Lock,
  Heart,
  Sparkles,
  Filter,
  AlertCircle,
  CheckCircle,
  CheckCircle2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Clock,
  SlidersHorizontal,
  ArrowUpDown,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { huntzenApi, type Job } from "@/lib/api/huntzen-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@/contexts/subscription-context";
import { useOptionalAuth } from "@/contexts/auth-context";
import { toast } from "sonner";
import { UsageCounter } from "@/components/freemium/usage-counter";
import {
  GradientJobCard,
  JobsLimitReached,
} from "@/components/jobs/gradient-job-card";
import { JobDetailsModal } from "@/components/jobs/job-details-modal";
import { SearchLoadingModal } from "@/components/jobs/search-loading-modal";
import {
  formatJobSource,
  getSourceColor,
} from "@/lib/utils/job-source-formatter";
import {
  SearchFormInline,
  type SearchParams,
} from "@/components/jobs/search-form-inline";
import { featureFlags } from "@/lib/feature-flags";
import { JobsPlaceholder } from "@/components/jobs/jobs-placeholder";
import { ErrorBoundary } from "@/components/error-boundary";
import {
  AdvancedFiltersModal,
  type AdvancedFilters,
} from "@/components/jobs/advanced-filters-modal";
import { useConversionPopup } from "@/components/freemium/conversion-popups";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { RecruiterEmailFinder } from "@/components/recruiter/recruiter-email-finder";
import { UserSearch } from "lucide-react";

// ─── Fuzzy location helpers ───────────────────────────────────────────────────

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

function fuzzyFindCity(query: string, cities: string[]): string | null {
  const q = query.toLowerCase().trim();
  if (!q) return null;
  const exact = cities.find((c) => c.toLowerCase() === q);
  if (exact) return exact;
  const startsWith = cities.filter((c) => c.toLowerCase().startsWith(q));
  if (startsWith.length === 1) return startsWith[0];
  const sorted = cities
    .map((c) => ({ c, d: levenshtein(q, c.toLowerCase()) }))
    .sort((a, b) => a.d - b.d);
  return sorted[0]?.d <= 2 ? sorted[0].c : null;
}

// Inline — évite d'importer sanitize.ts qui tire isomorphic-dompurify dans le bundle SSR
const stripHtmlForPreview = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

function formatRelativeDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Aujourd'hui";
    if (diffDays === 1) return "Hier";
    if (diffDays < 7) return `Il y a ${diffDays} jours`;
    if (diffDays < 30)
      return `Il y a ${Math.floor(diffDays / 7)} semaine${Math.floor(diffDays / 7) > 1 ? "s" : ""}`;
    if (diffDays < 365) return `Il y a ${Math.floor(diffDays / 30)} mois`;
    return date.toLocaleDateString("fr-FR");
  } catch {
    return dateStr;
  }
}

interface QuickFilters {
  sources: string[];
  contractTypes: string[];
  maxDays: number | null; // null = all dates
  salaryMin: number | null;
  directOnly: boolean;
}

export default function JobsPage() {
  const t = useTranslations("dashboard.jobs");
  const [jobTitle, setJobTitle] = useState("");
  const [popularQuery, setPopularQuery] = useState<string | undefined>(
    undefined,
  );
  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [contractType, setContractType] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const { translatedJobs, isTranslating } = useJobTranslation(jobs);
  const [visibleJobsCount, setVisibleJobsCount] = useState(0);
  const [correctedQuery, setCorrectedQuery] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set());

  type SortKey =
    | "relevance"
    | "date_desc"
    | "date_asc"
    | "salary_desc"
    | "salary_asc"
    | "company_asc";
  const [sortKey, setSortKey] = useState<SortKey>("relevance");

  const [viewedJobIds, setViewedJobIds] = useState<Set<string>>(() => {
    try {
      return new Set(
        JSON.parse(localStorage.getItem("huntzen_viewed_jobs") || "[]"),
      );
    } catch {
      return new Set();
    }
  });
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(() => {
    try {
      return new Set(
        JSON.parse(localStorage.getItem("huntzen_applied_jobs") || "[]"),
      );
    } catch {
      return new Set();
    }
  });

  // Advanced filters state
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Quick filters state (client-side filtering on loaded results)
  const [quickFiltersOpen, setQuickFiltersOpen] = useState(false);
  const [quickFilters, setQuickFilters] = useState<QuickFilters>({
    sources: [],
    contractTypes: [],
    maxDays: null,
    salaryMin: null,
    directOnly: false,
  });

  // Auth & Query Client
  const auth = useOptionalAuth();
  const queryClient = useQueryClient();

  // Navigation
  const router = useRouter();
  const searchParams = useSearchParams();

  // Country autocomplete state
  const [countrySearch, setCountrySearch] = useState("");
  const [showCountrySuggestions, setShowCountrySuggestions] = useState(false);
  const [selectedCountryIndex, setSelectedCountryIndex] = useState(-1);
  const [countryError, setCountryError] = useState("");
  const countryInputRef = useRef<HTMLInputElement>(null);
  const countrySuggestionsRef = useRef<HTMLDivElement>(null);

  // City autocomplete state
  const [citySearch, setCitySearch] = useState("");
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const [selectedCityIndex, setSelectedCityIndex] = useState(-1);
  const cityInputRef = useRef<HTMLInputElement>(null);
  const citySuggestionsRef = useRef<HTMLDivElement>(null);

  // Freemium state
  const {
    canUse,
    incrementUsage,
    getRemaining,
    hasFeature,
    openPricingModal,
    limits,
    isFreePlan,
    plan,
  } = useSubscription();

  const searchLimitPopup = useConversionPopup("search_limit");

  // Simple direct calls - no useMemo needed since functions are stable
  const searchesRemaining = getRemaining("job_search");
  const jobsVisibleLimit = limits.jobs_visible;

  // Fetch countries
  const { data: countries = [], isLoading: loadingCountries } = useQuery({
    queryKey: ["countries"],
    queryFn: () => huntzenApi.getCountries(),
    staleTime: 1000 * 60 * 60, // 1 hour
  });

  // Get selected country name for cities query
  const selectedCountryName = useMemo(
    () => countries.find((c) => c.code === selectedCountry)?.name,
    [countries, selectedCountry],
  );

  // Fetch cities for autocomplete (only loads when country is selected)
  const citiesQuery = useQuery({
    queryKey: ["cities", selectedCountryName],
    queryFn: () =>
      selectedCountryName
        ? huntzenApi.getCities(selectedCountryName)
        : Promise.resolve([]),
    enabled: !!selectedCountryName,
    staleTime: 1000 * 60 * 30, // 30 minutes
    placeholderData: [],
  });

  // Get all cities for autocomplete filtering
  const allCities = citiesQuery.data ?? [];
  const loadingCities = citiesQuery.isLoading;

  // Fetch contract types
  const { data: contractTypes = [] } = useQuery({
    queryKey: ["contractTypes"],
    queryFn: () => huntzenApi.getContractTypes(),
    staleTime: 1000 * 60 * 60, // 1 hour
  });

  // Filter countries based on search
  const filteredCountries = countries
    .filter((country) =>
      country.name.toLowerCase().includes(countrySearch.toLowerCase()),
    )
    .slice(0, 8); // Limit to 8 suggestions

  // Filter cities based on search
  const filteredCities = useMemo(() => {
    if (!citySearch) return [];
    return allCities
      .filter((city) => city.toLowerCase().includes(citySearch.toLowerCase()))
      .slice(0, 8); // Limit to 8 suggestions
  }, [allCities, citySearch]);

  // Reset city when country changes
  useEffect(() => {
    setSelectedCity("");
    setCitySearch("");
    setSelectedCityIndex(-1);
  }, [selectedCountry]);

  // Reset selected index when filtered results change
  useEffect(() => {
    setSelectedCountryIndex(-1);
  }, [countrySearch]);

  useEffect(() => {
    setSelectedCityIndex(-1);
  }, [citySearch]);

  // Keyboard navigation handlers
  const handleCountryKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showCountrySuggestions || filteredCountries.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedCountryIndex((prev) =>
          prev < filteredCountries.length - 1 ? prev + 1 : prev,
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedCountryIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedCountryIndex >= 0) {
          const country = filteredCountries[selectedCountryIndex];
          setSelectedCountry(country.code);
          setCountrySearch(country.name);
          setShowCountrySuggestions(false);
          setSelectedCountryIndex(-1);
        }
        break;
      case "Escape":
        e.preventDefault();
        setShowCountrySuggestions(false);
        setSelectedCountryIndex(-1);
        break;
    }
  };

  const handleCityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showCitySuggestions || filteredCities.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedCityIndex((prev) =>
          prev < filteredCities.length - 1 ? prev + 1 : prev,
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedCityIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedCityIndex >= 0) {
          const city = filteredCities[selectedCityIndex];
          setSelectedCity(city);
          setCitySearch(city);
          setShowCitySuggestions(false);
          setSelectedCityIndex(-1);
        }
        break;
      case "Escape":
        e.preventDefault();
        setShowCitySuggestions(false);
        setSelectedCityIndex(-1);
        break;
    }
  };

  // Load advanced filters from URL on mount
  useEffect(() => {
    const filters: AdvancedFilters = {};

    const industries = searchParams.get("industries");
    if (industries) filters.industries = industries.split(",");

    const keywords = searchParams.get("keywords");
    if (keywords) filters.keywords = keywords.split(",");

    const experienceLevel = searchParams.get("experienceLevel");
    if (experienceLevel) filters.experienceLevel = experienceLevel;

    const salaryMin = searchParams.get("salaryMin");
    if (salaryMin) filters.salaryMin = Number(salaryMin);

    const salaryMax = searchParams.get("salaryMax");
    if (salaryMax) filters.salaryMax = Number(salaryMax);

    const companySize = searchParams.get("companySize");
    if (companySize) filters.companySize = companySize;

    if (Object.keys(filters).length > 0) {
      setAdvancedFilters(filters);
    }
  }, [searchParams]);

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        countryInputRef.current &&
        !countryInputRef.current.contains(event.target as Node) &&
        countrySuggestionsRef.current &&
        !countrySuggestionsRef.current.contains(event.target as Node)
      ) {
        setShowCountrySuggestions(false);
      }
      if (
        cityInputRef.current &&
        !cityInputRef.current.contains(event.target as Node) &&
        citySuggestionsRef.current &&
        !citySuggestionsRef.current.contains(event.target as Node)
      ) {
        setShowCitySuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Load saved jobs to populate savedJobIds
  useEffect(() => {
    const loadSavedJobs = async () => {
      // Only load if user is authenticated AND has a valid access token
      if (auth?.user && auth?.session?.access_token) {
        try {
          const saved = await huntzenApi.getSavedJobs(
            auth.session.access_token,
          );
          const ids = new Set(saved.map((job) => job.external_job_id || ""));
          setSavedJobIds(ids);
        } catch (error) {
          // Silently fail for 401 errors (expired token, etc.)
          const err = error as Error;
          if (!err.message?.includes("401")) {
            console.error("Failed to load saved jobs:", error);
          }
        }
      } else {
        // Clear saved job IDs if user is not authenticated
        setSavedJobIds(new Set());
      }
    };
    loadSavedJobs();
  }, [auth?.user, auth?.session?.access_token]);

  // Progressive reveal: 1 job every 120ms for a "streaming" feel
  useEffect(() => {
    if (jobs.length === 0) {
      setVisibleJobsCount(0);
      return;
    }

    if (visibleJobsCount < jobs.length) {
      // First job appears after 200ms, then 1 per 120ms
      const delay = visibleJobsCount === 0 ? 200 : 120;
      const timer = setTimeout(() => {
        setVisibleJobsCount((prev) => Math.min(prev + 1, jobs.length));
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [jobs.length, visibleJobsCount]);

  // Handle country selection
  const handleCountrySelect = (country: { code: string; name: string }) => {
    setShowCountrySuggestions(false);
    setSelectedCountry(country.code);
    setCountrySearch(country.name);
    setSelectedCity(""); // Reset city after country change
    setCitySearch("");
  };

  // Handle city selection
  const handleCitySelect = (city: string) => {
    setShowCitySuggestions(false);
    setSelectedCity(city);
    setCitySearch(city);
  };

  // Auto-resolve country on blur (handles "frnace" → "France", "franc" → "France", etc.)
  const handleCountryBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // If focus moved to a suggestion button, skip — the click will handle it
    if (
      e.relatedTarget instanceof Node &&
      countrySuggestionsRef.current?.contains(e.relatedTarget)
    ) {
      return;
    }
    setShowCountrySuggestions(false);
    if (!countrySearch.trim()) {
      setCountryError("");
      setSelectedCountry("");
      return;
    }
    if (selectedCountry) {
      setCountryError("");
      return; // Already selected via click/keyboard
    }
    const match = fuzzyFindCountry(countrySearch, countries);
    if (match) {
      setSelectedCountry(match.code);
      setCountrySearch(match.name);
      setCountryError("");
    } else {
      setCountryError("Pays introuvable — essayez depuis la liste");
    }
  };

  // Auto-resolve city on blur (city is optional — no error shown if no match)
  const handleCityBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (
      e.relatedTarget instanceof Node &&
      citySuggestionsRef.current?.contains(e.relatedTarget)
    ) {
      return;
    }
    setShowCitySuggestions(false);
    if (!citySearch.trim() || selectedCity || allCities.length === 0) return;
    const match = fuzzyFindCity(citySearch, allCities);
    if (match) {
      setSelectedCity(match);
      setCitySearch(match);
    }
  };

  // Search state for caching with React Query
  const [jobSearchParams, setJobSearchParams] = useState<SearchParams | null>(
    null,
  );

  /**
   * Tracks whether quota has been incremented for current search params.
   * Reset when search parameters change to allow quota counting for new searches.
   *
   * @internal
   * @see https://tanstack.com/query/latest/docs/react/guides/caching
   */
  const hasIncrementedQuotaRef = useRef(false);

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [jobSearchParams]);

  // Restore search state from URL params + sessionStorage on mount
  useEffect(() => {
    const q = searchParams.get("q");
    const country = searchParams.get("country");
    const city = searchParams.get("city");
    if (!q) return;

    // Restore form fields
    setJobTitle(q);
    if (country) setSelectedCountry(country);
    if (city) {
      setSelectedCity(city);
      setCitySearch(city);
    }

    // Restore jobs from sessionStorage if query matches and cache < 15 min
    try {
      const raw = sessionStorage.getItem("huntzen_jobs_cache");
      if (!raw) return;
      const { jobs: cachedJobs, query, timestamp } = JSON.parse(raw);
      const isRecent = Date.now() - timestamp < 15 * 60 * 1000;
      if (isRecent && query.jobTitle === q) {
        setJobs(cachedJobs);
        setJobSearchParams({
          query: q,
          country: country || "",
          location: city || "",
        });
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search query with intelligent caching
  const searchQuery = useQuery({
    queryKey: [
      "job-search",
      jobSearchParams?.query,
      jobSearchParams?.country,
      jobSearchParams?.location,
      // jobSearchParams?.radiusKm, // Désactivé
      jobSearchParams?.includeRemote,
      contractType,
      advancedFilters,
    ],
    queryFn: async () => {
      if (!jobSearchParams?.query.trim() || !jobSearchParams?.country) {
        throw new Error("Veuillez remplir le titre du poste et le pays");
      }

      const data = await huntzenApi.searchJobs({
        job_title: jobSearchParams.query,
        country_code: jobSearchParams.country,
        city: jobSearchParams.location,
        contract_type: contractType,
        // radiusKm: jobSearchParams.radiusKm, // Désactivé
        includeRemote: jobSearchParams.includeRemote,
        // Advanced filters (Premium feature)
        industries: advancedFilters.industries?.join(","),
        keywords: advancedFilters.keywords?.join(","),
        experienceLevel: advancedFilters.experienceLevel,
        salaryMin: advancedFilters.salaryMin,
        salaryMax: advancedFilters.salaryMax,
        companySize: advancedFilters.companySize,
      });

      return data;
    },
    enabled: !!jobSearchParams, // Simplified: no need for shouldSearch flag
    staleTime: 1000 * 60 * 5, // 5 minutes - results stay fresh
    gcTime: 1000 * 60 * 15, // 15 minutes - keep in cache for reuse
    retry: 1,
  });

  /**
   * Reset quota increment flag when search parameters change.
   * This allows a new search with different params to increment quota again.
   */
  useEffect(() => {
    hasIncrementedQuotaRef.current = false;
  }, [jobSearchParams]);

  /**
   * Increments user's job_search quota when a NEW fetch completes successfully.
   *
   * Rules:
   * - ✅ Count on first successful fetch
   * - ❌ Don't count on cache hits (isFetched && !isFetching check)
   * - ✅ Count on refetch after staleTime expiration
   * - ❌ Don't count on API errors (isSuccess check)
   *
   * @example
   * // First search: "dev" → Quota++
   * // Repeat search: "dev" → Quota unchanged (cache hit)
   * // New search: "designer" → Quota++
   */
  useEffect(() => {
    if (
      searchQuery.isSuccess && // Fetch succeeded
      searchQuery.data && // Data available
      searchQuery.isFetched && // At least 1 fetch completed
      !searchQuery.isFetching && // Not currently fetching
      !hasIncrementedQuotaRef.current // Not already counted
    ) {
      incrementUsage("job_search");
      hasIncrementedQuotaRef.current = true;
    }
  }, [
    searchQuery.isSuccess,
    searchQuery.data,
    searchQuery.isFetched,
    searchQuery.isFetching,
    incrementUsage,
  ]);

  // Handle search query results + persist to sessionStorage
  useEffect(() => {
    if (searchQuery.data) {
      setJobs(searchQuery.data.jobs);
      setVisibleJobsCount(0); // Reset counter for progressive reveal
      setCorrectedQuery(searchQuery.data.corrected_query || null);
      try {
        sessionStorage.setItem(
          "huntzen_jobs_cache",
          JSON.stringify({
            jobs: searchQuery.data.jobs,
            query: {
              jobTitle: jobSearchParams?.query || "",
              selectedCountry: jobSearchParams?.country || "",
              selectedCity: jobSearchParams?.location || "",
            },
            timestamp: Date.now(),
          }),
        );
      } catch {}
    }
  }, [searchQuery.data, jobSearchParams]);

  const handleSearch = (params: SearchParams) => {
    // Check if user can search (quota check)
    if (!canUse("job_search")) {
      searchLimitPopup.open();
      return;
    }

    // Update form state for backward compatibility
    setJobTitle(params.query);
    setSelectedCountry(params.country);
    setSelectedCity(params.location);

    // Sync search params to URL so state persists on navigation
    const urlParams = new URLSearchParams();
    if (params.query) urlParams.set("q", params.query);
    if (params.country) urlParams.set("country", params.country);
    if (params.location) urlParams.set("city", params.location);
    router.replace(`/jobs?${urlParams.toString()}`, { scroll: false });

    // Trigger search with caching
    // Setting params will enable the query and trigger fetch
    setJobSearchParams(params);
  };

  const handleSearchLegacy = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch({
      query: jobTitle,
      location: selectedCity,
      country: selectedCountry,
    });
  };

  // Save job mutation — uses Supabase directly (same schema as saved-jobs page)
  const saveJobMutation = useMutation({
    retry: false, // Don't retry on failure — avoids 409 retry loop on duplicate saves
    mutationFn: async (job: Job) => {
      if (!auth?.user?.id) {
        throw new Error("Vous devez être connecté pour sauvegarder des offres");
      }
      const supabase = createClient();
      const { error } = await supabase.from("saved_jobs").insert({
        user_id: auth.user.id,
        job_title: job.title,
        company: job.company,
        location: job.location || null,
        salary: job.salary || null,
        job_url: job.url,
        description: job.description || null,
        external_job_id: job.id,
      });
      if (error) {
        // 23505 = PostgreSQL unique constraint violation → job already saved
        // Treat as success: onSuccess will sync UI state without showing error
        if (error.code === "23505") return;
        throw new Error(error.message);
      }
    },
    onSuccess: (_, job) => {
      setSavedJobIds((prev) => new Set(prev).add(job.id));
      toast.success(t("toast.saved"));
      // Invalidate saved jobs query
      queryClient.invalidateQueries({ queryKey: ["saved-jobs"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || t("toast.saveError"));
    },
  });

  const handleSaveJob = (job: Job) => {
    if (!hasFeature("has_favorites")) {
      openPricingModal("has_favorites");
      return;
    }
    if (!auth?.user) {
      toast.error(t("toast.mustLogin"));
      return;
    }

    // Check if already saved
    if (savedJobIds.has(job.id)) {
      toast.info(t("toast.alreadySaved"));
      return;
    }

    saveJobMutation.mutate(job);
  };

  const handleAdvancedFilters = () => {
    if (!hasFeature("has_advanced_filters")) {
      openPricingModal("has_advanced_filters");
      return;
    }
    setAdvancedFiltersOpen(true);
  };

  const handleApplyAdvancedFilters = (filters: AdvancedFilters) => {
    setAdvancedFilters(filters);
    setAdvancedFiltersOpen(false);

    // Persist in URL search params
    const params = new URLSearchParams(searchParams.toString());

    // Remove old advanced filter params
    params.delete("industries");
    params.delete("keywords");
    params.delete("experienceLevel");
    params.delete("salaryMin");
    params.delete("salaryMax");
    params.delete("companySize");

    // Add new filter params
    if (filters.industries && filters.industries.length > 0) {
      params.set("industries", filters.industries.join(","));
    }
    if (filters.keywords && filters.keywords.length > 0) {
      params.set("keywords", filters.keywords.join(","));
    }
    if (filters.experienceLevel) {
      params.set("experienceLevel", filters.experienceLevel);
    }
    if (filters.salaryMin !== undefined && filters.salaryMin > 0) {
      params.set("salaryMin", filters.salaryMin.toString());
    }
    if (filters.salaryMax !== undefined && filters.salaryMax > 0) {
      params.set("salaryMax", filters.salaryMax.toString());
    }
    if (filters.companySize) {
      params.set("companySize", filters.companySize);
    }

    // Update URL without page reload
    router.push(`/jobs?${params.toString()}`, { scroll: false });

    // Re-run search with new filters if a search has already been performed
    if (jobTitle && selectedCountry && jobs.length > 0) {
      handleSearch({
        query: jobTitle,
        country: selectedCountry,
        location: selectedCity,
      });
    }

    // Show confirmation toast
    const filtersCount = Object.keys(filters).length;
    if (filtersCount > 0) {
      toast.success(t("toast.filtersApplied", { count: filtersCount }), {
        description:
          filtersCount > 0 && jobs.length > 0
            ? t("toast.filtersAppliedDesc")
            : t("toast.filtersAppliedNext"),
      });
    } else {
      toast.info(t("toast.filtersReset"));
      // Re-run search to remove filters
      if (jobs.length > 0) {
        handleSearch({
          query: jobTitle,
          country: selectedCountry,
          location: selectedCity,
        });
      }
    }
  };

  const handleViewDetails = (job: Job) => {
    setSelectedJob(job);
    setModalOpen(true);
    setViewedJobIds((prev) => {
      const next = new Set(prev).add(job.id);
      try {
        localStorage.setItem("huntzen_viewed_jobs", JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  // Derive available filter options from loaded results
  const availableSources = useMemo(
    () =>
      [...new Set(translatedJobs.map((j) => j.source).filter(Boolean))].sort(),
    [translatedJobs],
  );
  const availableContractTypes = useMemo(
    () =>
      [
        ...new Set(
          translatedJobs
            .map((j) => j.contract_type)
            .filter(Boolean) as string[],
        ),
      ].sort(),
    [translatedJobs],
  );

  // Count active quick filters
  const activeQuickFiltersCount =
    quickFilters.sources.length +
    quickFilters.contractTypes.length +
    (quickFilters.maxDays !== null ? 1 : 0) +
    (quickFilters.salaryMin !== null ? 1 : 0) +
    (quickFilters.directOnly ? 1 : 0);

  // Split jobs into visible and blurred
  // Progressive reveal: only show jobs up to visibleJobsCount
  // Use translatedJobs for display (auto-translated when locale ≠ fr)
  const progressiveJobs = translatedJobs.slice(0, visibleJobsCount);
  const filteredProgressiveJobs = progressiveJobs.filter(
    (j) => j.url_is_direct !== false,
  );
  // Apply quick filters client-side
  const quickFilteredJobs = useMemo(() => {
    let result = filteredProgressiveJobs;
    if (quickFilters.sources.length > 0) {
      result = result.filter((j) => quickFilters.sources.includes(j.source));
    }
    if (quickFilters.contractTypes.length > 0) {
      result = result.filter(
        (j) =>
          j.contract_type &&
          quickFilters.contractTypes.includes(j.contract_type),
      );
    }
    if (quickFilters.maxDays !== null) {
      const cutoff = Date.now() - quickFilters.maxDays * 24 * 60 * 60 * 1000;
      result = result.filter((j) => {
        if (!j.posted_date) return true; // keep if no date
        try {
          return new Date(j.posted_date).getTime() >= cutoff;
        } catch {
          return true;
        }
      });
    }
    if (quickFilters.salaryMin !== null) {
      result = result.filter((j) => {
        if (!j.salary) return false;
        const match = j.salary.replace(/\s/g, "").match(/\d+/);
        if (!match) return false;
        return parseInt(match[0]) >= (quickFilters.salaryMin ?? 0);
      });
    }
    if (quickFilters.directOnly) {
      result = result.filter((j) => j.url_is_direct === true);
    }
    return result;
  }, [filteredProgressiveJobs, quickFilters]);

  const sortedJobs = useMemo(() => {
    if (sortKey === "relevance") return quickFilteredJobs;
    return [...quickFilteredJobs].sort((a, b) => {
      switch (sortKey) {
        case "date_desc": {
          const da = a.posted_date ? new Date(a.posted_date).getTime() : 0;
          const db = b.posted_date ? new Date(b.posted_date).getTime() : 0;
          return db - da;
        }
        case "date_asc": {
          const da = a.posted_date
            ? new Date(a.posted_date).getTime()
            : Infinity;
          const db = b.posted_date
            ? new Date(b.posted_date).getTime()
            : Infinity;
          return da - db;
        }
        case "salary_desc":
        case "salary_asc": {
          const extract = (s?: string) => {
            const m = (s || "").replace(/\s/g, "").match(/\d+/);
            return m ? parseInt(m[0]) : -1;
          };
          const diff = extract(b.salary) - extract(a.salary);
          return sortKey === "salary_desc" ? diff : -diff;
        }
        case "company_asc":
          return (a.company || "").localeCompare(b.company || "");
        default:
          return 0;
      }
    });
  }, [quickFilteredJobs, sortKey]);

  const visibleJobs = sortedJobs.slice(0, jobsVisibleLimit);
  const totalPages = Math.max(1, Math.ceil(visibleJobs.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedJobs = visibleJobs.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );
  const blurredJobsCount = Math.max(0, jobs.length - jobsVisibleLimit);
  const showBlurredCards = isFreePlan && blurredJobsCount > 0;
  const isLoadingMore = visibleJobsCount < jobs.length;
  const isLastPage = safePage >= totalPages;

  return (
    <div className="space-y-6">
      {/* Search Loading Modal */}
      <SearchLoadingModal
        isOpen={searchQuery.isFetching}
        searchQuery={jobSearchParams?.query}
      />

      {/* Hero Header - HuntZen Style */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col md:flex-row items-start justify-between gap-4 bg-gradient-to-br from-white to-slate-50 p-4 md:p-8 rounded-2xl border border-slate-200 shadow-sm"
      >
        <div className="flex-1">
          <motion.div
            className="flex items-center gap-3 md:gap-4 mb-3"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="w-10 h-10 md:w-14 md:h-14 rounded-2xl bg-gradient-to-br from-[#00D9FF] to-[#00C4EA] flex items-center justify-center shadow-lg shadow-[#00D9FF]/30 flex-shrink-0"
            >
              <Search className="w-7 h-7 text-white" />
            </motion.div>
            <h1 className="text-4xl font-black text-slate-900">{t("title")}</h1>
          </motion.div>
          <p className="text-slate-700 text-base max-w-3xl leading-relaxed">
            {t("subtitle")}
          </p>
        </div>

        {/* Usage counter for free users */}
        {isFreePlan && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="shrink-0 self-start md:self-auto"
          >
            <UsageCounter feature="job_search" compact />
          </motion.div>
        )}
      </motion.div>

      {/* Search Form - V2 (Inline) or V1 (Vertical) - Wrapped with ErrorBoundary */}
      <ErrorBoundary
        fallback={
          <Card className="p-6 bg-red-50 border-red-200">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
            <p className="text-red-700 text-center">{t("error.formLoad")}</p>
          </Card>
        }
      >
        {featureFlags.useJobsV2 ? (
          <SearchFormInline
            onSearch={handleSearch}
            isLoading={searchQuery.isFetching}
            disabled={false}
            initialQuery={popularQuery}
          />
        ) : (
          <Card className="shadow-sm border-2 border-slate-200 bg-white">
            <CardHeader className="pb-6 bg-white border-b-2 border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl font-bold flex items-center gap-2.5 text-slate-900">
                    <Filter className="w-6 h-6 text-huntzen-blue" />
                    {t("form.title")}
                  </CardTitle>
                  <p className="text-sm text-slate-600 mt-2">
                    {t("form.subtitle")}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="contractType"
                    className="text-sm font-semibold"
                  >
                    {t("form.contractType")}{" "}
                    <span className="text-muted-foreground text-xs font-normal">
                      {t("form.optional")}
                    </span>
                  </Label>
                  <Select
                    name="contractType"
                    value={contractType || "all"}
                    onValueChange={(value) =>
                      setContractType(value === "all" ? "" : value)
                    }
                  >
                    <SelectTrigger
                      id="contractType"
                      className="h-11 border-2 focus:border-primary"
                    >
                      <SelectValue placeholder={t("form.allContracts")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("form.allTypes")}</SelectItem>
                      {contractTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-4 pt-2">
                <Button
                  type="submit"
                  size="lg"
                  className="w-full md:w-auto bg-gradient-to-r from-[#00D9FF] to-[#00C4EA] hover:from-[#00C4EA] hover:to-[#00B3D9] text-white font-bold shadow-lg hover:shadow-xl hover:shadow-[#00D9FF]/40 transition-all h-12 px-8"
                  disabled={
                    searchQuery.isFetching ||
                    !jobTitle.trim() ||
                    !selectedCountry ||
                    (!canUse("job_search") && isFreePlan)
                  }
                >
                  {searchQuery.isFetching ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      {t("form.searching")}
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-5 w-5" />
                      {t("form.search")}
                      {isFreePlan &&
                        searchesRemaining <= 3 &&
                        searchesRemaining > 0 && (
                          <span className="ml-2 px-2 py-0.5 bg-white/20 rounded-full text-xs font-semibold">
                            {t(
                              searchesRemaining !== 1
                                ? "form.remaining_other"
                                : "form.remaining_one",
                              { count: searchesRemaining },
                            )}
                          </span>
                        )}
                    </>
                  )}
                </Button>

                {/* Advanced filters button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAdvancedFilters}
                  className="gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  {t("form.advancedFilters")}
                  {!hasFeature("has_advanced_filters") && (
                    <Lock className="w-3.5 h-3.5" />
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSearchLegacy} className="space-y-4">
                <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="jobTitle"
                      className="text-sm font-semibold flex items-center gap-1"
                    >
                      {t("form.jobTitle")}{" "}
                      <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="jobTitle"
                      name="jobTitle"
                      placeholder={t("form.jobTitlePlaceholder")}
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      required
                      className="h-11 border-2 focus:border-primary"
                    />
                  </div>

                  <div className="space-y-2 relative">
                    <Label
                      htmlFor="country"
                      className="text-sm font-semibold flex items-center gap-1"
                    >
                      {t("form.country")}{" "}
                      <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      ref={countryInputRef}
                      id="country"
                      name="country"
                      placeholder={
                        loadingCountries
                          ? t("form.loadingPlaceholder")
                          : t("form.countryPlaceholder")
                      }
                      value={countrySearch}
                      className={cn(
                        "h-11 border-2 focus:border-primary",
                        countryError && "border-red-400 focus:border-red-500",
                      )}
                      onChange={(e) => {
                        setCountrySearch(e.target.value);
                        setShowCountrySuggestions(true);
                        setCountryError("");
                        if (!e.target.value) {
                          setSelectedCountry("");
                        }
                      }}
                      onFocus={() => {
                        setShowCountrySuggestions(true);
                        setCountryError("");
                      }}
                      onBlur={handleCountryBlur}
                      onKeyDown={handleCountryKeyDown}
                      autoComplete="off"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={
                        showCountrySuggestions && filteredCountries.length > 0
                      }
                      aria-controls="country-suggestions"
                      aria-activedescendant={
                        selectedCountryIndex >= 0
                          ? `country-${filteredCountries[selectedCountryIndex]?.code}`
                          : undefined
                      }
                      required
                    />
                    {showCountrySuggestions &&
                      countrySearch &&
                      filteredCountries.length > 0 && (
                        <div
                          ref={countrySuggestionsRef}
                          id="country-suggestions"
                          role="listbox"
                          className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-[200px] overflow-y-auto pointer-events-auto"
                        >
                          {filteredCountries.map((country, index) => (
                            <button
                              key={country.code}
                              id={`country-${country.code}`}
                              type="button"
                              role="option"
                              aria-selected={
                                selectedCountry === country.code ||
                                selectedCountryIndex === index
                              }
                              className={cn(
                                "w-full px-3 py-2 text-left text-sm text-slate-900 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none transition-colors",
                                selectedCountry === country.code &&
                                  "bg-blue-50 font-medium",
                                selectedCountryIndex === index &&
                                  "bg-[#00D9FF]/10",
                              )}
                              onClick={() => handleCountrySelect(country)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  handleCountrySelect(country);
                                }
                              }}
                            >
                              {country.name}
                            </button>
                          ))}
                        </div>
                      )}
                    {showCountrySuggestions &&
                      countrySearch &&
                      filteredCountries.length === 0 && (
                        <div
                          ref={countrySuggestionsRef}
                          className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl p-3 text-sm text-slate-600 pointer-events-auto"
                        >
                          {t("form.noCountryFound")}
                        </div>
                      )}
                    {countryError && (
                      <p className="mt-1 text-xs text-red-500" role="alert">
                        {countryError}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2 relative">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="city" className="text-sm font-semibold">
                        {t("form.city")}{" "}
                        <span className="text-muted-foreground text-xs font-normal">
                          {t("form.optional")}
                        </span>
                      </Label>
                      {selectedCountry && !citySearch && (
                        <span className="text-xs text-huntzen-blue font-medium">
                          {t("form.cityHint")}
                        </span>
                      )}
                    </div>
                    <Input
                      ref={cityInputRef}
                      id="city"
                      name="city"
                      placeholder={
                        !selectedCountry
                          ? t("form.selectCountryFirst")
                          : loadingCities
                            ? t("form.loadingPlaceholder")
                            : t("form.cityPlaceholder")
                      }
                      value={citySearch}
                      className="h-11 border-2 focus:border-primary"
                      onChange={(e) => {
                        setCitySearch(e.target.value);
                        setShowCitySuggestions(true);
                        if (!e.target.value) {
                          setSelectedCity("");
                        }
                      }}
                      onFocus={() => setShowCitySuggestions(true)}
                      onBlur={handleCityBlur}
                      onKeyDown={handleCityKeyDown}
                      disabled={!selectedCountry}
                      autoComplete="off"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={
                        showCitySuggestions && filteredCities.length > 0
                      }
                      aria-controls="city-suggestions"
                      aria-activedescendant={
                        selectedCityIndex >= 0
                          ? `city-${filteredCities[selectedCityIndex]}`
                          : undefined
                      }
                    />
                    {showCitySuggestions &&
                      citySearch &&
                      filteredCities.length > 0 && (
                        <div
                          ref={citySuggestionsRef}
                          id="city-suggestions"
                          role="listbox"
                          className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-[200px] overflow-y-auto pointer-events-auto"
                        >
                          {filteredCities.map((city, index) => (
                            <button
                              key={city}
                              id={`city-${city}`}
                              type="button"
                              role="option"
                              aria-selected={
                                selectedCity === city ||
                                selectedCityIndex === index
                              }
                              className={cn(
                                "w-full px-3 py-2 text-left text-sm text-slate-900 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none transition-colors",
                                selectedCity === city &&
                                  "bg-blue-50 font-medium",
                                selectedCityIndex === index &&
                                  "bg-[#00D9FF]/10",
                              )}
                              onClick={() => handleCitySelect(city)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  handleCitySelect(city);
                                }
                              }}
                            >
                              {city}
                            </button>
                          ))}
                        </div>
                      )}
                    {showCitySuggestions &&
                      citySearch &&
                      filteredCities.length === 0 &&
                      !loadingCities &&
                      allCities.length > 0 && (
                        <div
                          ref={citySuggestionsRef}
                          className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl p-3 text-sm text-slate-600 pointer-events-auto"
                        >
                          {t("form.noCityFound")}
                        </div>
                      )}
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="contractType"
                      className="text-sm font-semibold"
                    >
                      {t("form.contractType")}{" "}
                      <span className="text-muted-foreground text-xs font-normal">
                        {t("form.optional")}
                      </span>
                    </Label>
                    <Select
                      name="contractType"
                      value={contractType || "all"}
                      onValueChange={(value) =>
                        setContractType(value === "all" ? "" : value)
                      }
                    >
                      <SelectTrigger
                        id="contractType"
                        className="h-11 border-2 focus:border-primary"
                      >
                        <SelectValue placeholder={t("form.allContracts")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          {t("form.allTypes")}
                        </SelectItem>
                        {contractTypes.map((type) => (
                          <SelectItem key={type.id} value={type.id}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center gap-4 pt-2">
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full md:w-auto bg-gradient-to-r from-[#00D9FF] to-[#00C4EA] hover:from-[#00C4EA] hover:to-[#00B3D9] text-white font-bold shadow-lg hover:shadow-xl hover:shadow-[#00D9FF]/40 transition-all h-12 px-8"
                    disabled={
                      searchQuery.isFetching ||
                      !jobTitle.trim() ||
                      !selectedCountry ||
                      (!canUse("job_search") && isFreePlan)
                    }
                  >
                    {searchQuery.isFetching ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        {t("form.searching")}
                      </>
                    ) : (
                      <>
                        <Search className="mr-2 h-5 w-5" />
                        {t("form.search")}
                        {isFreePlan &&
                          searchesRemaining <= 3 &&
                          searchesRemaining > 0 && (
                            <span className="ml-2 px-2 py-0.5 bg-white/20 rounded-full text-xs font-semibold">
                              {t(
                                searchesRemaining !== 1
                                  ? "form.remaining_other"
                                  : "form.remaining_one",
                                { count: searchesRemaining },
                              )}
                            </span>
                          )}
                      </>
                    )}
                  </Button>

                  {!canUse("job_search") && isFreePlan && (
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={() => searchLimitPopup.open()}
                      className="gap-2 border-2 border-[#00D9FF] text-[#00D9FF] hover:bg-[#00D9FF]/10 h-12 font-semibold"
                    >
                      <Sparkles className="w-4 h-4" />
                      {t("form.unlock")}
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </ErrorBoundary>

      {/* Error */}
      {searchQuery.isError &&
        searchQuery.error?.message !== "Limite de recherches atteinte" && (
          <div className="rounded-lg bg-red-50 p-5 border-l-4 border-red-500">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-red-700 mb-1">
                  {t("error.title")}
                </h3>
                <p className="text-sm text-red-600">
                  {searchQuery.error instanceof Error
                    ? searchQuery.error.message
                    : t("error.generic")}
                </p>
              </div>
            </div>
          </div>
        )}

      {/* Query correction */}
      <AnimatePresence>
        {correctedQuery && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-xl bg-[#00D9FF]/10 p-5 border-l-4 border-[#00D9FF]"
          >
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-[#00D9FF] flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-slate-900 mb-1">
                  {t("corrected.title")}
                </h3>
                <p className="text-sm text-slate-700">
                  {t("corrected.subtitle")}{" "}
                  <strong className="font-bold text-[#00D9FF]">
                    {correctedQuery}
                  </strong>
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Skeleton grid — shown while fetching (before results arrive) */}
      {searchQuery.isFetching && (
        <div
          className={`grid gap-6 auto-rows-fr ${
            featureFlags.useJobsV2
              ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
              : "grid-cols-1 md:grid-cols-2"
          }`}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <motion.div
              key={`skeleton-${i}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
            >
              <Card className="flex flex-col border border-slate-200 overflow-hidden h-full bg-white">
                <CardHeader className="pb-4 bg-gradient-to-br from-slate-50 to-white border-b border-slate-100">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-3">
                      <Skeleton className="h-6 w-3/4" />
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-9 w-9 rounded-xl" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                    </div>
                    <Skeleton className="h-6 w-16 rounded-full" />
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col pt-4 space-y-3">
                  <Skeleton className="h-8 w-full rounded-lg" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-4/6" />
                  <Skeleton className="h-11 w-full rounded-md mt-auto" />
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Results */}

      {!searchQuery.isFetching && jobs.length > 0 && (
        <ErrorBoundary
          fallback={
            <Card className="p-8 text-center bg-white border-slate-200">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-slate-900 mb-2">
                {t("error.title")}
              </h3>
              <p className="text-slate-600">{t("error.generic")}</p>
            </Card>
          }
        >
          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-gradient-to-r from-emerald-50 to-green-50 p-4 md:p-6 rounded-2xl border border-emerald-200/50 shadow-sm"
            >
              <div className="flex items-center gap-4">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
                  className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-green-500 flex items-center justify-center shadow-lg"
                >
                  <CheckCircle className="w-6 h-6 text-white" />
                </motion.div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-black text-emerald-700">
                      {jobs.length === 1
                        ? t("results.count_one", { count: jobs.length })
                        : t("results.count_other", { count: jobs.length })}
                    </h2>
                  </div>
                  <p className="text-sm text-emerald-600 font-medium">
                    {searchQuery.isFetching
                      ? t("results.refreshing")
                      : searchQuery.dataUpdatedAt
                        ? (() => {
                            const now = Date.now();
                            const updatedAt = searchQuery.dataUpdatedAt;
                            const diffMs = now - updatedAt;
                            const diffMinutes = Math.floor(diffMs / 60000);

                            // Determine staleness level
                            const isStale = diffMinutes >= 5;
                            const isVeryStale = diffMinutes >= 10;

                            let timeText = "";
                            if (diffMinutes < 1) {
                              timeText = t("results.timeJustNow");
                            } else if (diffMinutes === 1) {
                              timeText = t("results.time1Minute");
                            } else {
                              timeText = t("results.timeMinutes", {
                                count: diffMinutes,
                              });
                            }

                            return (
                              <span
                                className={
                                  isVeryStale
                                    ? "text-orange-600"
                                    : isStale
                                      ? "text-yellow-600"
                                      : ""
                                }
                              >
                                {isVeryStale ? "⚠️ " : isStale ? "⏰ " : "✓ "}
                                {t("results.refreshedAt", { time: timeText })}
                                {isStale &&
                                  ` - ${t("results.refreshRecommended")}`}
                              </span>
                            );
                          })()
                        : t("results.recent")}
                  </p>
                </div>
                {/* Refresh button - Force new fetch even from cache */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    searchQuery.refetch();
                  }}
                  disabled={searchQuery.isFetching}
                  className="ml-4 gap-2 bg-white border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-400"
                  title="Actualiser les résultats depuis le serveur"
                >
                  <RefreshCw
                    className={cn(
                      "w-4 h-4",
                      searchQuery.isFetching && "animate-spin",
                    )}
                  />
                  <span className="hidden sm:inline">
                    {t("results.refresh")}
                  </span>
                </Button>
                {/* Quick filter toggle button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setQuickFiltersOpen(!quickFiltersOpen)}
                  className={cn(
                    "gap-2 bg-white",
                    quickFiltersOpen && "border-[#00D9FF] text-[#00D9FF]",
                    activeQuickFiltersCount > 0 && "border-[#00D9FF]",
                  )}
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  <span className="hidden sm:inline">Filtrer</span>
                  {activeQuickFiltersCount > 0 && (
                    <span className="ml-1 bg-[#00D9FF] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                      {activeQuickFiltersCount}
                    </span>
                  )}
                </Button>
                {/* Sort selector */}
                <Select
                  value={sortKey}
                  onValueChange={(v) => setSortKey(v as SortKey)}
                >
                  <SelectTrigger
                    className={cn(
                      "h-9 gap-2 bg-white text-sm border",
                      sortKey !== "relevance" &&
                        "border-[#00D9FF] text-[#00D9FF]",
                    )}
                  >
                    <ArrowUpDown className="w-4 h-4" />
                    <SelectValue placeholder="Trier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="relevance">Pertinence</SelectItem>
                    <SelectItem value="date_desc">Plus récent</SelectItem>
                    <SelectItem value="date_asc">Plus ancien</SelectItem>
                    <SelectItem value="salary_desc">Salaire (↓)</SelectItem>
                    <SelectItem value="salary_asc">Salaire (↑)</SelectItem>
                    <SelectItem value="company_asc">Entreprise A→Z</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col items-end gap-3">
                {/* Page size selector */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-600">
                    Offres par page
                  </span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(val) => {
                      setPageSize(Number(val));
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="h-8 w-20 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="30">30</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {isFreePlan && (
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-700">
                      {t("results.visibleCount", {
                        visible: Math.min(jobs.length, jobsVisibleLimit),
                        total: jobs.length,
                      })}
                    </p>
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => openPricingModal("jobs_visible")}
                      className="text-xs text-[#00D9FF] hover:text-[#00C4EA] p-0 h-auto font-semibold"
                    >
                      {t("results.unlockAll")}
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Quick filter panel */}
            {quickFiltersOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 overflow-hidden"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">
                    Filtrer les résultats
                  </h3>
                  {activeQuickFiltersCount > 0 && (
                    <button
                      onClick={() =>
                        setQuickFilters({
                          sources: [],
                          contractTypes: [],
                          maxDays: null,
                          salaryMin: null,
                          directOnly: false,
                        })
                      }
                      className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                    >
                      <X className="h-3 w-3" />
                      Réinitialiser ({activeQuickFiltersCount})
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Source filter */}
                  {availableSources.length > 1 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-600 mb-2">
                        Source
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {availableSources.map((source) => (
                          <button
                            key={source}
                            onClick={() =>
                              setQuickFilters((prev) => ({
                                ...prev,
                                sources: prev.sources.includes(source)
                                  ? prev.sources.filter((s) => s !== source)
                                  : [...prev.sources, source],
                              }))
                            }
                            className={cn(
                              "text-xs px-2 py-1 rounded-full border transition-colors",
                              quickFilters.sources.includes(source)
                                ? "bg-[#00D9FF] text-white border-[#00D9FF]"
                                : "bg-white text-slate-600 border-slate-200 hover:border-[#00D9FF]",
                            )}
                          >
                            {formatJobSource(source)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Contract type filter */}
                  {availableContractTypes.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-600 mb-2">
                        Type de contrat
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {availableContractTypes.map((ct) => (
                          <button
                            key={ct}
                            onClick={() =>
                              setQuickFilters((prev) => ({
                                ...prev,
                                contractTypes: prev.contractTypes.includes(ct)
                                  ? prev.contractTypes.filter((c) => c !== ct)
                                  : [...prev.contractTypes, ct],
                              }))
                            }
                            className={cn(
                              "text-xs px-2 py-1 rounded-full border transition-colors",
                              quickFilters.contractTypes.includes(ct)
                                ? "bg-[#00D9FF] text-white border-[#00D9FF]"
                                : "bg-white text-slate-600 border-slate-200 hover:border-[#00D9FF]",
                            )}
                          >
                            {ct}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Date filter */}
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-2">
                      Date de publication
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: "Aujourd'hui", days: 1 },
                        { label: "3 jours", days: 3 },
                        { label: "7 jours", days: 7 },
                        { label: "30 jours", days: 30 },
                      ].map(({ label, days }) => (
                        <button
                          key={days}
                          onClick={() =>
                            setQuickFilters((prev) => ({
                              ...prev,
                              maxDays: prev.maxDays === days ? null : days,
                            }))
                          }
                          className={cn(
                            "text-xs px-2 py-1 rounded-full border transition-colors",
                            quickFilters.maxDays === days
                              ? "bg-[#00D9FF] text-white border-[#00D9FF]"
                              : "bg-white text-slate-600 border-slate-200 hover:border-[#00D9FF]",
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Salary + direct-only */}
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-600 mb-2">
                        Salaire min (€/an)
                      </p>
                      <input
                        type="number"
                        placeholder="ex: 35000"
                        value={quickFilters.salaryMin ?? ""}
                        onChange={(e) =>
                          setQuickFilters((prev) => ({
                            ...prev,
                            salaryMin: e.target.value
                              ? parseInt(e.target.value)
                              : null,
                          }))
                        }
                        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#00D9FF]"
                      />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={quickFilters.directOnly}
                        onChange={(e) =>
                          setQuickFilters((prev) => ({
                            ...prev,
                            directOnly: e.target.checked,
                          }))
                        }
                        className="rounded border-slate-300 text-[#00D9FF] focus:ring-[#00D9FF]"
                      />
                      <span className="text-xs text-slate-600">
                        Liens directs uniquement
                      </span>
                    </label>
                  </div>
                </div>

                {/* Results count */}
                <p className="text-xs text-slate-500 border-t border-slate-100 pt-2">
                  {quickFilteredJobs.length} offre
                  {quickFilteredJobs.length !== 1 ? "s" : ""} affichée
                  {quickFilteredJobs.length !== 1 ? "s" : ""}
                  {activeQuickFiltersCount > 0 &&
                    ` sur ${filteredProgressiveJobs.length} total`}
                </p>
              </motion.div>
            )}

            <div
              className={`grid gap-6 auto-rows-fr ${
                featureFlags.useJobsV2
                  ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
                  : "grid-cols-1 md:grid-cols-2"
              }`}
            >
              {/* Visible jobs (current page) */}
              {paginatedJobs.map((job, index) => (
                <motion.div
                  key={job.id || index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card
                    className={cn(
                      "hover:shadow-2xl hover:border-[#00D9FF]/30 transition-all duration-300 group flex flex-col border border-slate-200 overflow-hidden h-full",
                      viewedJobIds.has(job.id) ? "bg-slate-50/80" : "bg-white",
                    )}
                  >
                    <CardHeader className="pb-4 bg-gradient-to-br from-slate-50 to-white border-b border-slate-100">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <CardTitle className="text-xl line-clamp-2 font-black group-hover:text-[#00D9FF] transition-colors text-slate-900">
                              {job.title}
                            </CardTitle>
                            {appliedJobIds.has(job.id) && (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                                <CheckCircle2 className="h-3 w-3" />
                                Postulé
                              </span>
                            )}
                            {viewedJobIds.has(job.id) &&
                              !appliedJobIds.has(job.id) && (
                                <span className="text-xs text-slate-400 font-medium">
                                  Déjà ouvert
                                </span>
                              )}
                          </div>
                          <CardDescription className="flex items-center gap-2 mt-3 text-base">
                            <div
                              className={cn(
                                "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md text-white font-bold text-sm",
                                getSourceColor(job.source),
                              )}
                            >
                              {job.company ? (
                                job.company.charAt(0).toUpperCase()
                              ) : (
                                <Building className="h-4 w-4" />
                              )}
                            </div>
                            <span className="font-semibold text-slate-800">
                              {job.company}
                            </span>
                          </CardDescription>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge
                            className={cn(
                              "shrink-0 font-bold px-3 py-1 text-white border-0",
                              getSourceColor(job.source),
                            )}
                          >
                            {formatJobSource(job.source)}
                          </Badge>
                          {job.contract_type && (
                            <Badge
                              variant="outline"
                              className="shrink-0 text-xs px-2 py-0.5 text-slate-600 border-slate-300"
                            >
                              {job.contract_type}
                            </Badge>
                          )}
                          <button
                            onClick={() => handleSaveJob(job)}
                            className={cn(
                              "relative p-2 rounded-full hover:bg-red-50 transition-all",
                              savedJobIds.has(job.id)
                                ? "opacity-100"
                                : "opacity-60 hover:opacity-100 group-hover:opacity-100",
                              (saveJobMutation.isPending ||
                                savedJobIds.has(job.id)) &&
                                "cursor-not-allowed opacity-50",
                            )}
                            title={
                              !hasFeature("has_favorites")
                                ? t("card.premiumFeature")
                                : savedJobIds.has(job.id)
                                  ? t("card.alreadySaved")
                                  : t("card.save")
                            }
                            aria-label={
                              savedJobIds.has(job.id)
                                ? t("card.alreadySavedShort")
                                : t("card.saveShort")
                            }
                            disabled={
                              saveJobMutation.isPending ||
                              savedJobIds.has(job.id)
                            }
                          >
                            {saveJobMutation.isPending ? (
                              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                            ) : (
                              <Heart
                                className={cn(
                                  "w-5 h-5 transition-colors",
                                  !hasFeature("has_favorites") &&
                                    "text-gray-300",
                                  hasFeature("has_favorites") &&
                                    !savedJobIds.has(job.id) &&
                                    "text-gray-400 hover:text-red-500 hover:fill-red-500",
                                  hasFeature("has_favorites") &&
                                    savedJobIds.has(job.id) &&
                                    "text-red-500 fill-red-500",
                                )}
                              />
                            )}
                            {!hasFeature("has_favorites") && (
                              <Lock className="w-3 h-3 absolute -top-0.5 -right-0.5 text-gray-400 bg-white rounded-full" />
                            )}
                          </button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col pt-4">
                      <div className="flex-1 space-y-4">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-gray-50 px-3 py-2 rounded-lg">
                          <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
                          <span className="font-medium">
                            {job.location || t("card.locationUnknown")}
                          </span>
                        </div>

                        {job.salary && (
                          <div className="flex items-center gap-2 bg-green-50 px-3 py-2 rounded-lg">
                            <span className="text-sm font-bold text-green-600">
                              💰 {job.salary}
                            </span>
                          </div>
                        )}

                        <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                          {stripHtmlForPreview(job.description || "")}
                        </p>
                      </div>

                      {/* URL indicator */}
                      {job.url_is_direct === false && (
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" />
                          Via agrégateur
                        </span>
                      )}

                      {/* Posted date */}
                      {job.posted_date && (
                        <p className="text-xs text-slate-400 flex items-center justify-end gap-1 mt-1">
                          <Clock className="h-3 w-3" />
                          {formatRelativeDate(job.posted_date)}
                        </p>
                      )}

                      {/* Button always at bottom */}
                      <div className="flex gap-2 pt-5 mt-auto">
                        <Button
                          size="lg"
                          className="flex-1 bg-gradient-to-r from-[#00D9FF] to-[#00C4EA] hover:from-[#00C4EA] hover:to-[#00B3D9] text-white font-bold shadow-md hover:shadow-lg hover:shadow-[#00D9FF]/30 transition-all h-11"
                          onClick={() => handleViewDetails(job)}
                        >
                          {t("card.details")}
                          <ExternalLink className="ml-2 h-4 w-4" />
                        </Button>
                      </div>

                      {/* Recruiter email finder */}
                      <Sheet>
                        <SheetTrigger asChild>
                          <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                            <UserSearch className="w-3.5 h-3.5" />
                            Trouver les recruteurs
                            <span className="px-1 py-0.5 bg-orange-100 text-orange-700 text-[10px] font-semibold rounded">
                              BÊTA
                            </span>
                          </button>
                        </SheetTrigger>
                        <SheetContent>
                          <SheetHeader>
                            <SheetTitle>Trouver les recruteurs</SheetTitle>
                          </SheetHeader>
                          <div className="mt-4">
                            <RecruiterEmailFinder
                              companyName={job.company || ""}
                            />
                          </div>
                        </SheetContent>
                      </Sheet>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}

              {/* Skeleton placeholders for jobs not yet revealed */}
              {isLoadingMore &&
                Array.from({
                  length: Math.min(4, jobs.length - visibleJobsCount),
                }).map((_, i) => (
                  <motion.div
                    key={`reveal-skeleton-${i}`}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                  >
                    <Card className="flex flex-col border border-slate-200 overflow-hidden h-full bg-white">
                      <CardHeader className="pb-4 bg-gradient-to-br from-slate-50 to-white border-b border-slate-100">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 space-y-3">
                            <Skeleton className="h-6 w-3/4" />
                            <div className="flex items-center gap-2">
                              <Skeleton className="h-9 w-9 rounded-xl" />
                              <Skeleton className="h-4 w-1/2" />
                            </div>
                          </div>
                          <Skeleton className="h-6 w-16 rounded-full" />
                        </div>
                      </CardHeader>
                      <CardContent className="flex-1 flex flex-col pt-4 space-y-3">
                        <Skeleton className="h-8 w-full rounded-lg" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-5/6" />
                        <Skeleton className="h-4 w-4/6" />
                        <Skeleton className="h-11 w-full rounded-md mt-auto" />
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}

              {/* Gradient job cards for free users (last page only) */}
              {showBlurredCards && isLastPage && (
                <>
                  {Array.from({ length: Math.min(4, blurredJobsCount) }).map(
                    (_, index) => (
                      <GradientJobCard
                        key={`gradient-job-${jobs.length + index}`}
                        index={index}
                      />
                    ),
                  )}

                  {/* Show remaining count */}
                  {blurredJobsCount > 4 && (
                    <JobsLimitReached
                      totalJobs={jobs.length}
                      visibleJobs={jobsVisibleLimit}
                    />
                  )}
                </>
              )}
            </div>

            {/* Pagination controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(
                    (page) =>
                      page === 1 ||
                      page === totalPages ||
                      Math.abs(page - safePage) <= 1,
                  )
                  .reduce<(number | "...")[]>((acc, page, idx, arr) => {
                    if (
                      idx > 0 &&
                      typeof arr[idx - 1] === "number" &&
                      page - (arr[idx - 1] as number) > 1
                    ) {
                      acc.push("...");
                    }
                    acc.push(page);
                    return acc;
                  }, [])
                  .map((item, idx) =>
                    item === "..." ? (
                      <span
                        key={`ellipsis-${idx}`}
                        className="px-1 text-slate-400 text-sm"
                      >
                        …
                      </span>
                    ) : (
                      <Button
                        key={item}
                        variant={item === safePage ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(item as number)}
                        className={
                          item === safePage
                            ? "h-8 w-8 p-0 bg-emerald-600 hover:bg-emerald-700 text-white"
                            : "h-8 w-8 p-0"
                        }
                      >
                        {item}
                      </Button>
                    ),
                  )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={safePage === totalPages}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </ErrorBoundary>
      )}

      {/* Placeholder avant première recherche - NOUVEAU */}
      {!searchQuery.isFetching &&
        !searchQuery.isSuccess &&
        jobs.length === 0 && (
          <JobsPlaceholder
            onSearchClick={(popularJobTitle) => {
              setPopularQuery(popularJobTitle);
              setTimeout(() => {
                const input =
                  document.getElementById("query-inline") ??
                  document.getElementById("query-mobile");
                input?.scrollIntoView({ behavior: "smooth", block: "center" });
                input?.focus();
              }, 50);
            }}
          />
        )}

      {!searchQuery.isFetching &&
        searchQuery.isSuccess &&
        jobs.length === 0 && (
          <Card className="border-2 border-dashed border-slate-300 bg-white">
            <CardContent className="py-16 text-center">
              <div className="w-20 h-20 mx-auto rounded-full bg-slate-100 flex items-center justify-center mb-6">
                <Search className="h-10 w-10 text-muted-foreground/50" />
              </div>
              <h3 className="text-2xl font-bold text-slate-700 mb-2">
                {t("empty.title")}
              </h3>
              <p className="text-base text-muted-foreground mb-6 max-w-md mx-auto">
                {t("empty.subtitle")}
              </p>
              <div className="space-y-2 text-sm text-muted-foreground max-w-lg mx-auto">
                <p className="font-semibold">{t("empty.tips")}</p>
                <ul className="text-left space-y-1 inline-block">
                  <li>• {t("empty.tip1")}</li>
                  <li>• {t("empty.tip2")}</li>
                  <li>• {t("empty.tip3")}</li>
                  <li>• {t("empty.tip4")}</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        )}

      {/* Job Details Modal */}
      <JobDetailsModal
        job={selectedJob}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onApplied={(id) => {
          setAppliedJobIds((prev) => {
            const next = new Set(prev).add(id);
            try {
              localStorage.setItem(
                "huntzen_applied_jobs",
                JSON.stringify([...next]),
              );
            } catch {}
            return next;
          });
        }}
        onApplyPending={(pendingJob) => {
          // Modal fermée avant la popup → toast Sonner avec confirmation
          toast(`As-tu postulé chez ${pendingJob.company} ?`, {
            description: pendingJob.title,
            duration: 12000,
            action: {
              label: "✓ Oui, postulé !",
              onClick: () => {
                setAppliedJobIds((prev) => {
                  const next = new Set(prev).add(pendingJob.id);
                  try {
                    localStorage.setItem(
                      "huntzen_applied_jobs",
                      JSON.stringify([...next]),
                    );
                  } catch {}
                  return next;
                });
              },
            },
            cancel: { label: "Non", onClick: () => {} },
          });
        }}
      />

      {/* Advanced Filters Modal */}
      <AdvancedFiltersModal
        isOpen={advancedFiltersOpen}
        onClose={() => setAdvancedFiltersOpen(false)}
        onApply={handleApplyAdvancedFilters}
        initialFilters={advancedFilters}
      />

      {/* Conversion popup: quota recherches atteint */}
      <searchLimitPopup.PopupComponent />

      {/* Internal Links Footer for SEO */}
    </div>
  );
}
