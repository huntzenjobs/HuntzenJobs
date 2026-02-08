'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
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

export default function JobsPage() {
  const [jobTitle, setJobTitle] = useState('')
  const [selectedCountry, setSelectedCountry] = useState('')
  const [selectedCity, setSelectedCity] = useState('')
  const [contractType, setContractType] = useState('')
  const [jobs, setJobs] = useState<Job[]>([])
  const [correctedQuery, setCorrectedQuery] = useState<string | null>(null)
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set())

  // Auth & Query Client
  const auth = useOptionalAuth()
  const queryClient = useQueryClient()

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

      return huntzenApi.searchJobs({
        job_title: params.query,
        country_code: params.country,
        city: params.location,
        contract_type: contractType,
      })
    },
    onSuccess: (data) => {
      setJobs(data.jobs)
      setCorrectedQuery(data.corrected_query || null)
      // Increment search usage
      incrementUsage('job_search')
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
    // TODO: Open advanced filters modal
  }

  const handleViewDetails = (job: Job) => {
    setSelectedJob(job)
    setModalOpen(true)
  }

  // Split jobs into visible and blurred
  const visibleJobs = jobs.slice(0, jobsVisibleLimit)
  const blurredJobsCount = Math.max(0, jobs.length - jobsVisibleLimit)
  const showBlurredCards = isFreePlan && blurredJobsCount > 0

  return (
    <div className="space-y-6">
      {/* Hero Header - HuntZen Style */}
      <div className="flex items-start justify-between gap-4 bg-white p-8 rounded-2xl border-2 border-gray-200 shadow-sm">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-huntzen-blue flex items-center justify-center">
              <Search className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-4xl font-black text-gray-900">
              Recherche d&apos;Emplois Intelligente
            </h1>
          </div>
          <p className="text-gray-600 text-base max-w-3xl leading-relaxed">
            Accédez à des milliers d&apos;offres d&apos;emploi agrégées depuis les meilleures sources : Adzuna, Google Jobs, RemoteOK et bien plus encore.
          </p>
        </div>

        {/* Usage counter for free users */}
        {isFreePlan && (
          <div className="shrink-0">
            <UsageCounter feature="job_search" compact />
          </div>
        )}
      </div>

      {/* Search Form - V2 (Inline) or V1 (Vertical) */}
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
                  autoComplete="off"
                  required
                />
                {showCountrySuggestions && countrySearch && filteredCountries.length > 0 && (
                  <div
                    ref={countrySuggestionsRef}
                    className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-[200px] overflow-y-auto pointer-events-auto"
                  >
                    {filteredCountries.map((country) => (
                      <button
                        key={country.code}
                        type="button"
                        className={cn(
                          "w-full px-3 py-2 text-left text-sm hover:bg-gray-100 transition-colors",
                          selectedCountry === country.code && "bg-gray-100 font-medium"
                        )}
                        onClick={() => handleCountrySelect(country)}
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
                  disabled={!selectedCountry}
                  autoComplete="off"
                />
                {showCitySuggestions && citySearch && filteredCities.length > 0 && (
                  <div
                    ref={citySuggestionsRef}
                    className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-[200px] overflow-y-auto pointer-events-auto"
                  >
                    {filteredCities.map((city) => (
                      <button
                        key={city}
                        type="button"
                        className={cn(
                          "w-full px-3 py-2 text-left text-sm hover:bg-gray-100 transition-colors",
                          selectedCity === city && "bg-gray-100 font-medium"
                        )}
                        onClick={() => handleCitySelect(city)}
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
                className="w-full md:w-auto bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white font-semibold shadow-lg hover:shadow-xl transition-all h-12 px-8"
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
                      <span className="ml-2 px-2 py-0.5 bg-white/20 rounded-full text-xs">
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
                  className="gap-2 border-2 border-amber-500 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950 h-12"
                >
                  <Sparkles className="w-4 h-4" />
                  Debloquer les recherches illimitees
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
      )}

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
      {correctedQuery && (
        <div className="rounded-lg bg-blue-50 p-5 border-l-4 border-blue-500">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-blue-700 mb-1">Recherche optimisee</h3>
              <p className="text-sm text-blue-600">
                Nous avons ameliore votre recherche : <strong className="font-bold">{correctedQuery}</strong>
              </p>
            </div>
          </div>
        </div>
      )}

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
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-gradient-to-r from-green-50 to-emerald-50 p-5 rounded-xl border border-green-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-green-700">
                  {jobs.length} offre{jobs.length > 1 ? 's' : ''} trouvee{jobs.length > 1 ? 's' : ''}
                </h2>
                <p className="text-sm text-green-600">
                  Resultats agreges depuis plusieurs sources
                </p>
              </div>
            </div>
            {isFreePlan && (
              <div className="text-right">
                <p className="text-sm font-semibold text-muted-foreground">
                  {Math.min(jobs.length, jobsVisibleLimit)} visible{Math.min(jobs.length, jobsVisibleLimit) > 1 ? 's' : ''} sur {jobs.length}
                </p>
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => openPricingModal('jobs_visible')}
                  className="text-xs text-primary hover:text-primary/80 p-0 h-auto"
                >
                  Debloquer toutes les offres →
                </Button>
              </div>
            )}
          </div>

          <div className={`grid gap-6 auto-rows-fr ${
            featureFlags.useJobsV2
              ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
              : 'md:grid-cols-2'
          }`}>
            {/* Visible jobs */}
            {visibleJobs.map((job, index) => (
              <Card key={job.id || index} className="hover:shadow-xl hover:border-primary/50 transition-all duration-300 group flex flex-col border-2 overflow-hidden">
                <CardHeader className="pb-3 bg-gradient-to-r from-gray-50 to-white">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-xl line-clamp-2 font-bold group-hover:text-primary transition-colors">
                        {job.title}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-2 text-base">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center flex-shrink-0">
                          <Building className="h-4 w-4 text-white" />
                        </div>
                        <span className="font-medium">{job.company}</span>
                      </CardDescription>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant="secondary" className="shrink-0 font-semibold px-3 py-1">
                        {formatJobSource(job.source)}
                      </Badge>
                      <button
                        onClick={() => handleSaveJob(job)}
                        className={cn(
                          "relative p-2 rounded-full hover:bg-red-50 transition-all",
                          savedJobIds.has(job.id) ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        )}
                        title={
                          !hasFeature('has_favorites')
                            ? 'Fonctionnalite Premium'
                            : savedJobIds.has(job.id)
                            ? 'Deja dans vos favoris'
                            : 'Sauvegarder cette offre'
                        }
                        disabled={saveJobMutation.isPending || savedJobIds.has(job.id)}
                      >
                        <Heart className={cn(
                          "w-5 h-5 transition-colors",
                          !hasFeature('has_favorites') && 'text-gray-300',
                          hasFeature('has_favorites') && !savedJobIds.has(job.id) && 'text-gray-400 hover:text-red-500 hover:fill-red-500',
                          hasFeature('has_favorites') && savedJobIds.has(job.id) && 'text-red-500 fill-red-500'
                        )} />
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
                      className="flex-1 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white font-semibold shadow-md hover:shadow-lg transition-all h-11"
                      onClick={() => handleViewDetails(job)}
                    >
                      Voir détails
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

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
    </div>
  )
}
