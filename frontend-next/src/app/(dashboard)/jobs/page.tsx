'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, MapPin, Building, ExternalLink, Loader2, Lock, Heart, Sparkles, Filter, AlertCircle, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { huntzenApi, type Job } from '@/lib/api/huntzen-client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSubscription } from '@/contexts/subscription-context'
import { useOptionalAuth } from '@/contexts/auth-context'
import { toast } from 'sonner'
import { UsageCounter } from '@/components/freemium/usage-counter'
import { GradientJobCard, JobsLimitReached } from '@/components/jobs/gradient-job-card'
import { JobDetailsModal } from '@/components/jobs/job-details-modal'
import { formatJobSource } from '@/lib/utils/job-source-formatter'
import { SearchFormInline, type SearchParams } from '@/components/jobs/search-form-inline'
import { featureFlags } from '@/lib/feature-flags'
import { JobsPlaceholder } from '@/components/jobs/jobs-placeholder'
import { ErrorBoundary } from '@/components/error-boundary'
import { AdvancedFiltersModal, type AdvancedFilters } from '@/components/jobs/advanced-filters-modal'

export default function JobsPage() {
  const [jobTitle, setJobTitle] = useState('')
  const [selectedCountry, setSelectedCountry] = useState('')
  const [selectedCity, setSelectedCity] = useState('')
  const [contractType, setContractType] = useState('')
  const [jobs, setJobs] = useState<Job[]>([])
  const [visibleJobsCount, setVisibleJobsCount] = useState(0)
  const [correctedQuery, setCorrectedQuery] = useState<string | null>(null)
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set())

  // Advanced filters state
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false)
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>({})

  // Auth & Query Client
  const auth = useOptionalAuth()
  const queryClient = useQueryClient()

  // Navigation
  const router = useRouter()
  const searchParams = useSearchParams()

  // Country autocomplete state
  const [countrySearch, setCountrySearch] = useState('')
  const [showCountrySuggestions, setShowCountrySuggestions] = useState(false)
  const countryInputRef = useRef<HTMLInputElement>(null)
  const countrySuggestionsRef = useRef<HTMLDivElement>(null)

  // City autocomplete state
  const [citySearch, setCitySearch] = useState('')
  const [showCitySuggestions, setShowCitySuggestions] = useState(false)
  const cityInputRef = useRef<HTMLInputElement>(null)
  const citySuggestionsRef = useRef<HTMLDivElement>(null)

  // Freemium state
  const {
    canUse,
    incrementUsage,
    getRemaining,
    hasFeature,
    openPricingModal,
    limits,
    isFreePlan,
    plan
  } = useSubscription()

  // Simple direct calls - no useMemo needed since functions are stable
  const searchesRemaining = getRemaining('job_search')
  const jobsVisibleLimit = limits.jobs_visible

  // Fetch countries
  const { data: countries = [], isLoading: loadingCountries } = useQuery({
    queryKey: ['countries'],
    queryFn: () => huntzenApi.getCountries(),
    staleTime: 1000 * 60 * 60, // 1 hour
  })

  // Get selected country name for cities query
  const selectedCountryName = useMemo(
    () => countries.find(c => c.code === selectedCountry)?.name,
    [countries, selectedCountry]
  )

  // Fetch cities for autocomplete (only loads when country is selected)
  const citiesQuery = useQuery({
    queryKey: ['cities', selectedCountryName],
    queryFn: () => selectedCountryName ? huntzenApi.getCities(selectedCountryName) : Promise.resolve([]),
    enabled: !!selectedCountryName,
    staleTime: 1000 * 60 * 30, // 30 minutes
    placeholderData: [],
  })

  // Get all cities for autocomplete filtering
  const allCities = citiesQuery.data ?? []
  const loadingCities = citiesQuery.isLoading

  // Fetch contract types
  const { data: contractTypes = [] } = useQuery({
    queryKey: ['contractTypes'],
    queryFn: () => huntzenApi.getContractTypes(),
    staleTime: 1000 * 60 * 60, // 1 hour
  })

  // Filter countries based on search
  const filteredCountries = countries.filter(country =>
    country.name.toLowerCase().includes(countrySearch.toLowerCase())
  ).slice(0, 8) // Limit to 8 suggestions

  // Filter cities based on search
  const filteredCities = useMemo(() => {
    if (!citySearch) return []
    return allCities
      .filter(city => city.toLowerCase().includes(citySearch.toLowerCase()))
      .slice(0, 8) // Limit to 8 suggestions
  }, [allCities, citySearch])

  // Reset city when country changes
  useEffect(() => {
    setSelectedCity('')
    setCitySearch('')
  }, [selectedCountry])

  // Load advanced filters from URL on mount
  useEffect(() => {
    const filters: AdvancedFilters = {}

    const industries = searchParams.get('industries')
    if (industries) filters.industries = industries.split(',')

    const keywords = searchParams.get('keywords')
    if (keywords) filters.keywords = keywords.split(',')

    const experienceLevel = searchParams.get('experienceLevel')
    if (experienceLevel) filters.experienceLevel = experienceLevel

    const salaryMin = searchParams.get('salaryMin')
    if (salaryMin) filters.salaryMin = Number(salaryMin)

    const salaryMax = searchParams.get('salaryMax')
    if (salaryMax) filters.salaryMax = Number(salaryMax)

    const companySize = searchParams.get('companySize')
    if (companySize) filters.companySize = companySize

    if (Object.keys(filters).length > 0) {
      setAdvancedFilters(filters)
      console.log('[ADVANCED_FILTERS] Loaded from URL:', filters)
    }
  }, [searchParams])

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        countryInputRef.current &&
        !countryInputRef.current.contains(event.target as Node) &&
        countrySuggestionsRef.current &&
        !countrySuggestionsRef.current.contains(event.target as Node)
      ) {
        setShowCountrySuggestions(false)
      }
      if (
        cityInputRef.current &&
        !cityInputRef.current.contains(event.target as Node) &&
        citySuggestionsRef.current &&
        !citySuggestionsRef.current.contains(event.target as Node)
      ) {
        setShowCitySuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Load saved jobs to populate savedJobIds
  useEffect(() => {
    const loadSavedJobs = async () => {
      // Only load if user is authenticated AND has a valid access token
      if (auth?.user && auth?.session?.access_token) {
        try {
          const saved = await huntzenApi.getSavedJobs(auth.session.access_token)
          const ids = new Set(saved.map(job => job.external_job_id || ''))
          setSavedJobIds(ids)
        } catch (error) {
          // Silently fail for 401 errors (expired token, etc.)
          const err = error as Error
          if (!err.message?.includes('401')) {
            console.error('Failed to load saved jobs:', error)
          }
        }
      } else {
        // Clear saved job IDs if user is not authenticated
        setSavedJobIds(new Set())
      }
    }
    loadSavedJobs()
  }, [auth?.user, auth?.session?.access_token])

  // Progressive reveal of jobs for better UX
  useEffect(() => {
    if (jobs.length === 0) {
      setVisibleJobsCount(0)
      return
    }

    // Show jobs progressively (3 at a time, every 300ms for better visibility)
    const BATCH_SIZE = 3
    const REVEAL_INTERVAL = 300
    const INITIAL_DELAY = 400 // Wait before starting progressive reveal

    if (visibleJobsCount < jobs.length) {
      const delay = visibleJobsCount === 0 ? INITIAL_DELAY : REVEAL_INTERVAL
      const timer = setTimeout(() => {
        setVisibleJobsCount(prev => Math.min(prev + BATCH_SIZE, jobs.length))
      }, delay)

      return () => clearTimeout(timer)
    }
  }, [jobs.length, visibleJobsCount])

  // Handle country selection
  const handleCountrySelect = (country: { code: string; name: string }) => {
    setShowCountrySuggestions(false)
    setSelectedCountry(country.code)
    setCountrySearch(country.name)
    setSelectedCity('') // Reset city after country change
    setCitySearch('')
  }

  // Handle city selection
  const handleCitySelect = (city: string) => {
    setShowCitySuggestions(false)
    setSelectedCity(city)
    setCitySearch(city)
  }

  // Search mutation
  const searchMutation = useMutation({
    mutationFn: async (params: SearchParams) => {
      if (!params.query.trim() || !params.country) {
        throw new Error('Veuillez remplir le titre du poste et le pays')
      }

      // Check if user can search
      if (!canUse('job_search')) {
        openPricingModal('job_searches_per_day')
        throw new Error('Limite de recherches atteinte')
      }

      // Debug: Log search parameters
      console.log('🔍 [SEARCH] Paramètres de recherche:', {
        query: params.query,
        location: params.location,
        country: params.country,
        radiusKm: params.radiusKm,
        includeRemote: params.includeRemote,
        contractType,
      })

      return huntzenApi.searchJobs({
        job_title: params.query,
        country_code: params.country,
        city: params.location,
        contract_type: contractType,
        radiusKm: params.radiusKm,
        includeRemote: params.includeRemote,
        // Advanced filters (Premium feature)
        industries: advancedFilters.industries?.join(','),
        keywords: advancedFilters.keywords?.join(','),
        experienceLevel: advancedFilters.experienceLevel,
        salaryMin: advancedFilters.salaryMin,
        salaryMax: advancedFilters.salaryMax,
        companySize: advancedFilters.companySize,
      })
    },
    onSuccess: (data) => {
      console.log('✅ [SEARCH] Résultats reçus:', {
        totalJobs: data.jobs.length,
        correctedQuery: data.corrected_query
      })
      setJobs(data.jobs)
      setVisibleJobsCount(0) // Reset counter for progressive reveal
      setCorrectedQuery(data.corrected_query || null)
      // Increment search usage
      incrementUsage('job_search')
    },
    onError: (error) => {
      console.error('❌ [SEARCH] Erreur de recherche:', error)
    },
  })

  const handleSearch = (params: SearchParams) => {
    // Update form state for backward compatibility
    setJobTitle(params.query)
    setSelectedCountry(params.country)
    setSelectedCity(params.location)

    searchMutation.mutate(params)
  }

  const handleSearchLegacy = (e: React.FormEvent) => {
    e.preventDefault()
    handleSearch({
      query: jobTitle,
      location: selectedCity,
      country: selectedCountry,
    })
  }

  // Save job mutation
  const saveJobMutation = useMutation({
    mutationFn: async (job: Job) => {
      if (!auth?.session?.access_token) {
        throw new Error('Vous devez être connecté pour sauvegarder des offres')
      }
      return huntzenApi.saveJob(job, auth.session.access_token)
    },
    onSuccess: (_, job) => {
      setSavedJobIds(prev => new Set(prev).add(job.id))
      toast.success('Offre ajoutée aux favoris ✨')
      // Invalidate saved jobs query
      queryClient.invalidateQueries({ queryKey: ['saved-jobs'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la sauvegarde')
    },
  })

  const handleSaveJob = (job: Job) => {
    if (!hasFeature('has_favorites')) {
      openPricingModal('has_favorites')
      return
    }
    if (!auth?.user) {
      toast.error('Connectez-vous pour sauvegarder des offres')
      return
    }

    // Check if already saved
    if (savedJobIds.has(job.id)) {
      toast.info('Cette offre est déjà dans vos favoris')
      return
    }

    saveJobMutation.mutate(job)
  }

  const handleAdvancedFilters = () => {
    if (!hasFeature('has_advanced_filters')) {
      openPricingModal('has_advanced_filters')
      return
    }
    setAdvancedFiltersOpen(true)
  }

  const handleApplyAdvancedFilters = (filters: AdvancedFilters) => {
    setAdvancedFilters(filters)
    setAdvancedFiltersOpen(false)

    // Log for debugging
    console.log('[ADVANCED_FILTERS] Applied filters:', filters)

    // Persist in URL search params
    const params = new URLSearchParams(searchParams.toString())

    // Remove old advanced filter params
    params.delete('industries')
    params.delete('keywords')
    params.delete('experienceLevel')
    params.delete('salaryMin')
    params.delete('salaryMax')
    params.delete('companySize')

    // Add new filter params
    if (filters.industries && filters.industries.length > 0) {
      params.set('industries', filters.industries.join(','))
    }
    if (filters.keywords && filters.keywords.length > 0) {
      params.set('keywords', filters.keywords.join(','))
    }
    if (filters.experienceLevel) {
      params.set('experienceLevel', filters.experienceLevel)
    }
    if (filters.salaryMin !== undefined && filters.salaryMin > 0) {
      params.set('salaryMin', filters.salaryMin.toString())
    }
    if (filters.salaryMax !== undefined && filters.salaryMax > 0) {
      params.set('salaryMax', filters.salaryMax.toString())
    }
    if (filters.companySize) {
      params.set('companySize', filters.companySize)
    }

    // Update URL without page reload
    router.push(`/jobs?${params.toString()}`, { scroll: false })

    // Re-run search with new filters if a search has already been performed
    if (jobTitle && selectedCountry && jobs.length > 0) {
      console.log('[ADVANCED_FILTERS] Re-running search with filters...')
      handleSearch({
        query: jobTitle,
        country: selectedCountry,
        location: selectedCity,
      })
    }

    // Show confirmation toast
    const filtersCount = Object.keys(filters).length
    if (filtersCount > 0) {
      toast.success(`${filtersCount} filtre(s) avancé(s) appliqué(s)`, {
        description: filtersCount > 0 && jobs.length > 0
          ? 'Recherche mise à jour avec les nouveaux filtres'
          : 'Les filtres seront appliqués à la prochaine recherche',
      })
    } else {
      toast.info('Filtres avancés réinitialisés')
      // Re-run search to remove filters
      if (jobs.length > 0) {
        handleSearch({
          query: jobTitle,
          country: selectedCountry,
          location: selectedCity,
        })
      }
    }
  }

  const handleViewDetails = (job: Job) => {
    setSelectedJob(job)
    setModalOpen(true)
  }

  // Split jobs into visible and blurred
  // Progressive reveal: only show jobs up to visibleJobsCount
  const progressiveJobs = jobs.slice(0, visibleJobsCount)
  const visibleJobs = progressiveJobs.slice(0, jobsVisibleLimit)
  const blurredJobsCount = Math.max(0, jobs.length - jobsVisibleLimit)
  const showBlurredCards = isFreePlan && blurredJobsCount > 0
  const isLoadingMore = visibleJobsCount < jobs.length

  return (
    <div className="space-y-6">
      {/* Hero Header - HuntZen Style */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-start justify-between gap-4 bg-gradient-to-br from-white to-gray-50 p-8 rounded-2xl border border-gray-200 shadow-sm"
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
            <h1 className="text-4xl font-black text-black">
              Recherche d&apos;Emplois
            </h1>
          </motion.div>
          <p className="text-gray-700 text-base max-w-3xl leading-relaxed">
            Accédez à des milliers d&apos;offres d&apos;emploi provenant des meilleures plateformes de recrutement, agrégées et mises à jour quotidiennement.
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
      <ErrorBoundary fallback={
        <Card className="p-6 bg-red-50 border-red-200">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
          <p className="text-red-700 text-center">
            Erreur lors du chargement du formulaire. Veuillez rafraîchir la page.
          </p>
        </Card>
      }>
        {featureFlags.useJobsV2 ? (
          <SearchFormInline
            onSearch={handleSearch}
            isLoading={searchMutation.isPending}
            disabled={false}
          />
        ) : (
          <Card className="shadow-sm border-2 border-gray-200">
          <CardHeader className="pb-6 bg-white border-b-2 border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl font-bold flex items-center gap-2.5 text-gray-900">
                  <Filter className="w-6 h-6 text-huntzen-blue" />
                  Définissez vos critères de recherche
                </CardTitle>
                <p className="text-sm text-gray-600 mt-2">
                  Remplissez les champs ci-dessous pour trouver les offres qui correspondent à votre profil
                </p>
              </div>

              {/* Advanced filters button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleAdvancedFilters}
                className="gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Filtres avancés
                {!hasFeature('has_advanced_filters') && (
                  <Lock className="w-3.5 h-3.5" />
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSearchLegacy} className="space-y-4">
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="jobTitle" className="text-sm font-semibold flex items-center gap-1">
                  Titre du poste <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="jobTitle"
                  name="jobTitle"
                  placeholder="Ex: Developpeur Full Stack, Chef de Projet..."
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  required
                  className="h-11 border-2 focus:border-primary"
                />
              </div>

              <div className="space-y-2 relative">
                <Label htmlFor="country" className="text-sm font-semibold flex items-center gap-1">
                  Pays <span className="text-red-500">*</span>
                </Label>
                <Input
                  ref={countryInputRef}
                  id="country"
                  name="country"
                  placeholder={loadingCountries ? 'Chargement...' : 'France, Belgique, Suisse...'}
                  value={countrySearch}
                  className="h-11 border-2 focus:border-primary"
                  onChange={(e) => {
                    setCountrySearch(e.target.value)
                    setShowCountrySuggestions(true)
                    if (!e.target.value) {
                      setSelectedCountry('')
                    }
                  }}
                  onFocus={() => setShowCountrySuggestions(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setShowCountrySuggestions(false)
                    }
                  }}
                  autoComplete="off"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={showCountrySuggestions && filteredCountries.length > 0}
                  aria-controls="country-suggestions"
                  aria-activedescendant={selectedCountry ? `country-${selectedCountry}` : undefined}
                  required
                />
                {showCountrySuggestions && countrySearch && filteredCountries.length > 0 && (
                  <div
                    ref={countrySuggestionsRef}
                    id="country-suggestions"
                    role="listbox"
                    className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-[200px] overflow-y-auto pointer-events-auto"
                  >
                    {filteredCountries.map((country) => (
                      <button
                        key={country.code}
                        id={`country-${country.code}`}
                        type="button"
                        role="option"
                        aria-selected={selectedCountry === country.code}
                        className={cn(
                          "w-full px-3 py-2 text-left text-sm hover:bg-gray-100 focus:bg-gray-100 focus:outline-none transition-colors",
                          selectedCountry === country.code && "bg-blue-50 font-medium"
                        )}
                        onClick={() => handleCountrySelect(country)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleCountrySelect(country)
                          }
                        }}
                      >
                        {country.name}
                      </button>
                    ))}
                  </div>
                )}
                {showCountrySuggestions && countrySearch && filteredCountries.length === 0 && (
                  <div
                    ref={countrySuggestionsRef}
                    className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl p-3 text-sm text-gray-600 pointer-events-auto"
                  >
                    Aucun pays trouvé
                  </div>
                )}
              </div>

              <div className="space-y-2 relative">
                <div className="flex items-center justify-between">
                  <Label htmlFor="city" className="text-sm font-semibold">
                    Ville <span className="text-muted-foreground text-xs font-normal">(optionnel)</span>
                  </Label>
                  {selectedCountry && !citySearch && (
                    <span className="text-xs text-huntzen-blue font-medium">Tout le pays si vide</span>
                  )}
                </div>
                <Input
                  ref={cityInputRef}
                  id="city"
                  name="city"
                  placeholder={!selectedCountry ? 'Selectionnez d\'abord un pays' : loadingCities ? 'Chargement...' : 'Paris, Lyon, Bruxelles...'}
                  value={citySearch}
                  className="h-11 border-2 focus:border-primary"
                  onChange={(e) => {
                    setCitySearch(e.target.value)
                    setShowCitySuggestions(true)
                    if (!e.target.value) {
                      setSelectedCity('')
                    }
                  }}
                  onFocus={() => setShowCitySuggestions(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setShowCitySuggestions(false)
                    }
                  }}
                  disabled={!selectedCountry}
                  autoComplete="off"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={showCitySuggestions && filteredCities.length > 0}
                  aria-controls="city-suggestions"
                  aria-activedescendant={selectedCity ? `city-${selectedCity}` : undefined}
                />
                {showCitySuggestions && citySearch && filteredCities.length > 0 && (
                  <div
                    ref={citySuggestionsRef}
                    id="city-suggestions"
                    role="listbox"
                    className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-[200px] overflow-y-auto pointer-events-auto"
                  >
                    {filteredCities.map((city) => (
                      <button
                        key={city}
                        id={`city-${city}`}
                        type="button"
                        role="option"
                        aria-selected={selectedCity === city}
                        className={cn(
                          "w-full px-3 py-2 text-left text-sm hover:bg-gray-100 focus:bg-gray-100 focus:outline-none transition-colors",
                          selectedCity === city && "bg-blue-50 font-medium"
                        )}
                        onClick={() => handleCitySelect(city)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleCitySelect(city)
                          }
                        }}
                      >
                        {city}
                      </button>
                    ))}
                  </div>
                )}
                {showCitySuggestions && citySearch && filteredCities.length === 0 && !loadingCities && allCities.length > 0 && (
                  <div
                    ref={citySuggestionsRef}
                    className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl p-3 text-sm text-gray-600 pointer-events-auto"
                  >
                    Aucune ville trouvée
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="contractType" className="text-sm font-semibold">
                  Type de contrat <span className="text-muted-foreground text-xs font-normal">(optionnel)</span>
                </Label>
                <Select name="contractType" value={contractType || 'all'} onValueChange={(value) => setContractType(value === 'all' ? '' : value)}>
                  <SelectTrigger id="contractType" className="h-11 border-2 focus:border-primary">
                    <SelectValue placeholder="Tous les types de contrat" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">✓ Tous les types</SelectItem>
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
                disabled={searchMutation.isPending || !jobTitle.trim() || !selectedCountry || (!canUse('job_search') && isFreePlan)}
              >
                {searchMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Recherche en cours...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-5 w-5" />
                    Lancer la recherche
                    {isFreePlan && searchesRemaining <= 3 && searchesRemaining > 0 && (
                      <span className="ml-2 px-2 py-0.5 bg-white/20 rounded-full text-xs font-semibold">
                        {searchesRemaining} restante{searchesRemaining !== 1 ? 's' : ''}
                      </span>
                    )}
                  </>
                )}
              </Button>

              {!canUse('job_search') && isFreePlan && (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => openPricingModal('job_searches_per_day')}
                  className="gap-2 border-2 border-[#00D9FF] text-[#00D9FF] hover:bg-[#00D9FF]/10 h-12 font-semibold"
                >
                  <Sparkles className="w-4 h-4" />
                  Débloquer les recherches illimitées
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
        )}
      </ErrorBoundary>

      {/* Error */}
      {searchMutation.isError && searchMutation.error?.message !== 'Limite de recherches atteinte' && (
        <div className="rounded-lg bg-red-50 p-5 border-l-4 border-red-500">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-700 mb-1">Erreur lors de la recherche</h3>
              <p className="text-sm text-red-600">
                {searchMutation.error instanceof Error
                  ? searchMutation.error.message
                  : 'Une erreur est survenue lors de la recherche. Veuillez reessayer.'}
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
                <h3 className="font-bold text-black mb-1">Recherche améliorée</h3>
                <p className="text-sm text-gray-700">
                  Nous avons optimisé votre recherche : <strong className="font-bold text-[#00D9FF]">{correctedQuery}</strong>
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      {searchMutation.isPending && (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!searchMutation.isPending && jobs.length > 0 && (
        <ErrorBoundary fallback={
          <Card className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              Erreur lors de l'affichage des résultats
            </h3>
            <p className="text-gray-600">
              Une erreur s'est produite. Veuillez réessayer.
            </p>
          </Card>
        }>
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
                <h2 className="text-2xl font-black text-emerald-700">
                  {jobs.length} offre{jobs.length > 1 ? 's' : ''} trouvée{jobs.length > 1 ? 's' : ''}
                </h2>
                <p className="text-sm text-emerald-600 font-medium">
                  Résultats récents et pertinents
                </p>
              </div>
            </div>
            {isFreePlan && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
                className="text-right"
              >
                <p className="text-sm font-bold text-gray-700">
                  {Math.min(jobs.length, jobsVisibleLimit)} visible{Math.min(jobs.length, jobsVisibleLimit) > 1 ? 's' : ''} sur {jobs.length}
                </p>
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => openPricingModal('jobs_visible')}
                  className="text-xs text-[#00D9FF] hover:text-[#00C4EA] p-0 h-auto font-semibold"
                >
                  Débloquer toutes les offres →
                </Button>
              </motion.div>
            )}
          </motion.div>

          <div className={`grid gap-6 auto-rows-fr ${
            featureFlags.useJobsV2
              ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
              : 'md:grid-cols-2'
          }`}>
            {/* Visible jobs */}
            {visibleJobs.map((job, index) => (
              <motion.div
                key={job.id || index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="hover:shadow-2xl hover:border-[#00D9FF]/30 transition-all duration-300 group flex flex-col border border-gray-200 overflow-hidden h-full bg-white">
                  <CardHeader className="pb-4 bg-gradient-to-br from-gray-50 to-white border-b border-gray-100">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-xl line-clamp-2 font-black group-hover:text-[#00D9FF] transition-colors text-black">
                          {job.title}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-3 text-base">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#00D9FF] to-[#00C4EA] flex items-center justify-center flex-shrink-0 shadow-md">
                            <Building className="h-5 w-5 text-white" />
                          </div>
                          <span className="font-semibold text-gray-800">{job.company}</span>
                        </CardDescription>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge variant="secondary" className="shrink-0 font-bold px-3 py-1 bg-gray-100 text-gray-700 border border-gray-200">
                          {formatJobSource(job.source)}
                        </Badge>
                        <button
                        onClick={() => handleSaveJob(job)}
                        className={cn(
                          "relative p-2 rounded-full hover:bg-red-50 transition-all",
                          savedJobIds.has(job.id) ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                          (saveJobMutation.isPending || savedJobIds.has(job.id)) && "cursor-not-allowed opacity-50"
                        )}
                        title={
                          !hasFeature('has_favorites')
                            ? 'Fonctionnalite Premium'
                            : savedJobIds.has(job.id)
                            ? 'Deja dans vos favoris'
                            : 'Sauvegarder cette offre'
                        }
                        aria-label={savedJobIds.has(job.id) ? 'Déjà sauvegardé' : 'Sauvegarder'}
                        disabled={saveJobMutation.isPending || savedJobIds.has(job.id)}
                      >
                        {saveJobMutation.isPending ? (
                          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                        ) : (
                          <Heart className={cn(
                            "w-5 h-5 transition-colors",
                            !hasFeature('has_favorites') && 'text-gray-300',
                            hasFeature('has_favorites') && !savedJobIds.has(job.id) && 'text-gray-400 hover:text-red-500 hover:fill-red-500',
                            hasFeature('has_favorites') && savedJobIds.has(job.id) && 'text-red-500 fill-red-500'
                          )} />
                        )}
                        {!hasFeature('has_favorites') && (
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
                      <span className="font-medium">{job.location || 'Localisation non specifiee'}</span>
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
                        Voir détails
                        <ExternalLink className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}

            {/* Loading indicator for progressive reveal */}
            {isLoadingMore && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="col-span-full flex items-center justify-center py-8"
              >
                <div className="flex items-center gap-3 text-gray-600">
                  <Loader2 className="w-5 h-5 animate-spin text-[#00D9FF]" />
                  <span className="text-sm font-medium">
                    Chargement des offres... ({visibleJobsCount}/{jobs.length})
                  </span>
                </div>
              </motion.div>
            )}

            {/* Gradient job cards for free users */}
            {showBlurredCards && (
              <>
                {Array.from({ length: Math.min(4, blurredJobsCount) }).map((_, index) => (
                  <GradientJobCard key={`gradient-job-${jobs.length + index}`} index={index} />
                ))}

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
      {!searchMutation.isPending && !searchMutation.isSuccess && jobs.length === 0 && (
        <JobsPlaceholder
          onSearchClick={(jobTitle) => {
            // TODO: Trigger search with popular job title
            // This would require access to the search form state
            console.log('Search for:', jobTitle)
          }}
        />
      )}

      {!searchMutation.isPending && searchMutation.isSuccess && jobs.length === 0 && (
        <Card className="border-2 border-dashed">
          <CardContent className="py-16 text-center">
            <div className="w-20 h-20 mx-auto rounded-full bg-gray-100 flex items-center justify-center mb-6">
              <Search className="h-10 w-10 text-muted-foreground/50" />
            </div>
            <h3 className="text-2xl font-bold text-gray-700 mb-2">
              Aucune offre trouvee
            </h3>
            <p className="text-base text-muted-foreground mb-6 max-w-md mx-auto">
              Nous n&apos;avons pas trouve d&apos;offres correspondant a vos criteres pour le moment.
            </p>
            <div className="space-y-2 text-sm text-muted-foreground max-w-lg mx-auto">
              <p className="font-semibold">💡 Suggestions :</p>
              <ul className="text-left space-y-1 inline-block">
                <li>• Essayez avec des mots-cles plus generaux</li>
                <li>• Verifiez l&apos;orthographe du titre de poste</li>
                <li>• Elargissez votre zone geographique (ville → pays entier)</li>
                <li>• Selectionnez &quot;Tous les types&quot; pour le contrat</li>
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
    </div>
  )
}
