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
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { huntzenApi, type Job } from "@/lib/api/huntzen-client";
import { useStreamingJobSearch } from "@/hooks/use-streaming-job-search";
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
import { formatJobSource } from "@/lib/utils/job-source-formatter";
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

export default function JobsPage() {
  const t = useTranslations("dashboard.jobs");
  const [jobTitle, setJobTitle] = useState("");
  const [popularQuery, setPopularQuery] = useState<string | undefined>(
    undefined,
  );
  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [contractType, setContractType] = useState("");
  const {
    jobs,
    isLoading: searchLoading,
    isRankingPending,
    isDone: searchDone,
    error: searchError,
    refinedQuery: streamRefinedQuery,
    search: startSearch,
  } = useStreamingJobSearch();
  const { translatedJobs, isTranslating } = useJobTranslation(jobs);
  const [visibleJobsCount, setVisibleJobsCount] = useState(0);
  const [correctedQuery, setCorrectedQuery] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set());

  // Advanced filters state
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>({});

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
      console.log("[ADVANCED_FILTERS] Loaded from URL:", filters);
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

  // Quota increment — fires once per completed search (not on cache hits)
  const hasIncrementedQuotaRef = useRef(false);
  useEffect(() => {
    hasIncrementedQuotaRef.current = false;
  }, [streamRefinedQuery]);
  useEffect(() => {
    if (searchDone && jobs.length > 0 && !hasIncrementedQuotaRef.current) {
      incrementUsage("job_search");
      hasIncrementedQuotaRef.current = true;
    }
  }, [searchDone, jobs.length, incrementUsage]);

  // Sync corrected query from SSE stream
  useEffect(() => {
    setCorrectedQuery(streamRefinedQuery ?? null);
  }, [streamRefinedQuery]);

  const handleSearch = (params: SearchParams) => {
    if (!canUse("job_search")) {
      openPricingModal("job_searches_per_day");
      return;
    }
    setJobTitle(params.query);
    setSelectedCountry(params.country);
    setSelectedCity(params.location);
    setVisibleJobsCount(0);
    startSearch({
      query: params.query,
      country: params.country,
      city: params.location,
      contract: contractType,
      radius: params.radiusKm,
      includeRemote: params.includeRemote,
      limit: 50,
    });
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

    // Log for debugging
    console.log("[ADVANCED_FILTERS] Applied filters:", filters);

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
      console.log("[ADVANCED_FILTERS] Re-running search with filters...");
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
  };

  // Split jobs into visible and blurred
  // Progressive reveal: only show jobs up to visibleJobsCount
  // Use translatedJobs for display (auto-translated when locale ≠ fr)
  const progressiveJobs = translatedJobs.slice(0, visibleJobsCount);
  const visibleJobs = progressiveJobs.slice(0, jobsVisibleLimit);
  const blurredJobsCount = Math.max(0, jobs.length - jobsVisibleLimit);
  const showBlurredCards = isFreePlan && blurredJobsCount > 0;
  const isLoadingMore = visibleJobsCount < jobs.length;

  return (
    <div className="space-y-6">
      {/* Hero Header - HuntZen Style */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-start justify-between gap-4 bg-gradient-to-br from-white to-slate-50 p-8 rounded-2xl border border-slate-200 shadow-sm"
      >
        <div className="flex-1">
          <motion.div
            className="flex items-center gap-4 mb-3"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#00D9FF] to-[#00C4EA] flex items-center justify-center shadow-lg shadow-[#00D9FF]/30"
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
            className="shrink-0"
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
            isLoading={searchLoading}
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
                    searchLoading ||
                    !jobTitle.trim() ||
                    !selectedCountry ||
                    (!canUse("job_search") && isFreePlan)
                  }
                >
                  {searchLoading ? (
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
                      className="h-11 border-2 focus:border-primary"
                      onChange={(e) => {
                        setCountrySearch(e.target.value);
                        setShowCountrySuggestions(true);
                        if (!e.target.value) {
                          setSelectedCountry("");
                        }
                      }}
                      onFocus={() => setShowCountrySuggestions(true)}
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
                      searchLoading ||
                      !jobTitle.trim() ||
                      !selectedCountry ||
                      (!canUse("job_search") && isFreePlan)
                    }
                  >
                    {searchLoading ? (
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
                      onClick={() => openPricingModal("job_searches_per_day")}
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
      {searchError && searchError !== "Limite de recherches atteinte" && (
        <div className="rounded-lg bg-red-50 p-5 border-l-4 border-red-500">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-700 mb-1">
                {t("error.title")}
              </h3>
              <p className="text-sm text-red-600">{searchError}</p>
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
      {searchLoading && (
        <div
          className={`grid gap-6 auto-rows-fr ${
            featureFlags.useJobsV2
              ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
              : "md:grid-cols-2"
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

      {!searchLoading && jobs.length > 0 && (
        <ErrorBoundary
          fallback={
            <Card className="p-8 text-center bg-white border-slate-200">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-slate-900 mb-2">
                Erreur lors de l'affichage des résultats
              </h3>
              <p className="text-slate-600">
                Une erreur s'est produite. Veuillez réessayer.
              </p>
            </Card>
          }
        >
          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="flex items-center justify-between bg-gradient-to-r from-emerald-50 to-green-50 p-6 rounded-2xl border border-emerald-200/50 shadow-sm"
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
                    {isRankingPending && (
                      <Badge
                        variant="outline"
                        className="text-xs bg-amber-50 text-amber-700 border-amber-200 animate-pulse"
                      >
                        ✨ Ranking IA...
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-emerald-600 font-medium">
                    {searchLoading
                      ? "Chargement en cours..."
                      : isRankingPending
                        ? "Classement IA des résultats..."
                        : "Résultats récents et pertinents"}
                  </p>
                </div>
                {/* Refresh button - Force new fetch even from cache */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (jobTitle && selectedCountry) {
                      handleSearch({
                        query: jobTitle,
                        country: selectedCountry,
                        location: selectedCity,
                      });
                    }
                  }}
                  disabled={searchLoading || isRankingPending}
                  className="ml-4 gap-2 bg-white border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-400"
                  title="Relancer la recherche"
                >
                  <RefreshCw
                    className={cn(
                      "w-4 h-4",
                      (searchLoading || isRankingPending) && "animate-spin",
                    )}
                  />
                  <span className="hidden sm:inline">
                    {t("results.refresh")}
                  </span>
                </Button>
              </div>
              {isFreePlan && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 }}
                  className="text-right"
                >
                  <p className="text-sm font-bold text-slate-700">
                    {Math.min(jobs.length, jobsVisibleLimit)} visible
                    {Math.min(jobs.length, jobsVisibleLimit) > 1
                      ? "s"
                      : ""} sur {jobs.length}
                  </p>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => openPricingModal("jobs_visible")}
                    className="text-xs text-[#00D9FF] hover:text-[#00C4EA] p-0 h-auto font-semibold"
                  >
                    {t("results.unlockAll")}
                  </Button>
                </motion.div>
              )}
            </motion.div>

            <div
              className={`grid gap-6 auto-rows-fr ${
                featureFlags.useJobsV2
                  ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
                  : "md:grid-cols-2"
              }`}
            >
              {/* Visible jobs */}
              {visibleJobs.map((job, index) => (
                <motion.div
                  key={job.id || index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card className="hover:shadow-2xl hover:border-[#00D9FF]/30 transition-all duration-300 group flex flex-col border border-slate-200 overflow-hidden h-full bg-white">
                    <CardHeader className="pb-4 bg-gradient-to-br from-slate-50 to-white border-b border-slate-100">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-xl line-clamp-2 font-black group-hover:text-[#00D9FF] transition-colors text-slate-900">
                            {job.title}
                          </CardTitle>
                          <CardDescription className="flex items-center gap-2 mt-3 text-base">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#00D9FF] to-[#00C4EA] flex items-center justify-center flex-shrink-0 shadow-md">
                              <Building className="h-5 w-5 text-white" />
                            </div>
                            <span className="font-semibold text-slate-800">
                              {job.company}
                            </span>
                          </CardDescription>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge
                            variant="secondary"
                            className="shrink-0 font-bold px-3 py-1 bg-slate-100 text-slate-700 border border-slate-200"
                          >
                            {formatJobSource(job.source)}
                          </Badge>
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
                          {job.description}
                        </p>
                      </div>

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

              {/* Skeleton cards while AI ranking is in progress (lock-first-3 pattern) */}
              {isRankingPending &&
                Array.from({ length: 6 }).map((_, i) => (
                  <motion.div
                    key={`ranking-skeleton-${i}`}
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

              {/* Gradient job cards for free users */}
              {showBlurredCards && (
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
          </div>
        </ErrorBoundary>
      )}

      {/* Placeholder avant première recherche - NOUVEAU */}
      {!searchLoading && !searchDone && jobs.length === 0 && (
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

      {!searchLoading && searchDone && jobs.length === 0 && (
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
      />

      {/* Advanced Filters Modal */}
      <AdvancedFiltersModal
        isOpen={advancedFiltersOpen}
        onClose={() => setAdvancedFiltersOpen(false)}
        onApply={handleApplyAdvancedFilters}
        initialFilters={advancedFilters}
      />

      {/* Internal Links Footer for SEO */}
    </div>
  );
}
