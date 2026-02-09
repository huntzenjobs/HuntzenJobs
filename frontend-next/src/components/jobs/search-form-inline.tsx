'use client'

import { useState, useEffect } from 'react'
import { Search, MapPin, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AutocompleteInput, type AutocompleteOption } from '@/components/ui/autocomplete-input'
import { useSubscription } from '@/contexts/subscription-context'
import { toast } from 'sonner'
import { huntzenApi } from '@/lib/api/huntzen-client'

/**
 * SearchFormInline - Horizontal search form for Jobs page
 *
 * Layout:
 * - Desktop: Horizontal (3 inputs + 2 buttons in a row)
 * - Mobile: Vertical (stacked inputs and buttons)
 *
 * Features:
 * - AutocompleteInput for country and city
 * - Freemium usage check before search
 * - AI-enhanced search option (premium only)
 * - Validation with inline feedback
 */

interface SearchFormInlineProps {
  onSearch: (params: SearchParams) => void
  isLoading?: boolean
  disabled?: boolean
}

export interface SearchParams {
  query: string
  location: string
  country: string
  radiusKm?: number
  includeRemote?: boolean
}

export function SearchFormInline({ onSearch, isLoading = false, disabled = false }: SearchFormInlineProps) {
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState('')
  const [country, setCountry] = useState('')
  const [selectedCountryName, setSelectedCountryName] = useState('')
  const [isCountryValid, setIsCountryValid] = useState(false) // Track if valid country selected
  const [radiusKm, setRadiusKm] = useState(50) // Default 50km radius
  const [includeRemote, setIncludeRemote] = useState(true) // Include remote jobs by default
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { canUse, getRemaining, isFreePlan } = useSubscription()

  // Fetch countries for autocomplete
  const fetchCountries = async (query: string): Promise<AutocompleteOption[]> => {
    if (!query) return []
    try {
      const countries = await huntzenApi.getCountries()
      return countries
        .filter(c => c.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 8)
        .map(c => ({ label: c.name, value: c.code }))
    } catch (error) {
      return []
    }
  }

  // Fetch cities for autocomplete - DYNAMIC SEARCH with OpenStreetMap
  const fetchCities = async (query: string): Promise<AutocompleteOption[]> => {
    console.log('🏙️ fetchCities called:', { query, country, isCountryValid })
    if (!query || query.length < 1 || !country) {
      console.log('❌ Missing query or country code')
      return []
    }
    try {
      console.log('🌐 Searching cities dynamically via Nominatim:', query)
      // Use dynamic search with OpenStreetMap Nominatim
      const cities = await huntzenApi.searchCities(query, country)
      console.log('✅ Cities found:', cities.length)
      return cities.map(c => ({ label: c, value: c }))
    } catch (error) {
      console.error('❌ Error searching cities:', error)
      return []
    }
  }

  // Handle country selection
  const handleCountryChange = (value: string) => {
    console.log('🔍 handleCountryChange received:', { value, length: value.length, isUppercase: value === value.toUpperCase() })
    setCountry(value)

    // Clear country name when empty
    if (!value) {
      setSelectedCountryName('')
      setIsCountryValid(false)
      console.log('❌ Country cleared')
      return
    }

    // If it's a valid country code (2-3 chars), find the country name
    if (value.length >= 2 && value.length <= 3) {
      console.log('✅ Valid code format, fetching country name...')
      huntzenApi.getCountries().then(countries => {
        const found = countries.find(c => c.code.toLowerCase() === value.toLowerCase())
        if (found) {
          console.log('✅ Country found:', found.name)
          setSelectedCountryName(found.name)
          setIsCountryValid(true)
        } else {
          console.log('❌ Country code not found in list')
          setIsCountryValid(false)
        }
      })
    } else {
      // User is typing text, not a valid code yet
      console.log('⏳ User typing, not a valid code yet')
      setIsCountryValid(false)
    }
  }

  // Validation
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!query.trim()) {
      newErrors.query = 'Le métier est requis'
    }

    if (!country.trim()) {
      newErrors.country = 'Le pays est requis'
    } else if (!isCountryValid) {
      newErrors.country = 'Veuillez sélectionner un pays dans la liste'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Handle search
  const handleSearch = () => {
    // Validate form
    if (!validate()) {
      toast.error('Veuillez remplir tous les champs requis')
      return
    }

    // Check freemium limits
    if (!canUse('job_search')) {
      const remaining = getRemaining('job_search')
      toast.error(`Limite de recherches atteinte. Rechargez à ${remaining}`)
      return
    }

    // Execute search
    onSearch({
      query: query.trim(),
      location: location.trim(),
      country: country.trim(),
      radiusKm: location.trim() ? radiusKm : undefined, // Only send radius if city is specified
      includeRemote, // Include remote jobs setting
    })

    // Clear errors on successful search
    setErrors({})
  }

  // Clear errors when user types
  useEffect(() => {
    if (query.trim()) {
      setErrors(prev => ({ ...prev, query: '' }))
    }
  }, [query])

  useEffect(() => {
    if (country.trim()) {
      setErrors(prev => ({ ...prev, country: '' }))
    }
  }, [country])

  return (
    <div className="w-full">
      {/* Desktop: Horizontal Layout */}
      <div className="hidden md:block p-6 bg-white rounded-xl shadow-sm border border-gray-200">
        {/* Main Search Inputs Row */}
        <div className="flex items-start gap-3 mb-4">
          {/* Query Input */}
          <div className="flex-1 min-w-0">
            <label htmlFor="query-inline" className="sr-only">
              Métier ou poste recherché
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
              <input
                id="query-inline"
                type="text"
                placeholder="Métier ou poste recherché"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={disabled || isLoading}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSearch()
                  }
                }}
                className={`
                  w-full pl-10 pr-4 py-3
                  bg-white
                  border rounded-lg
                  text-sm font-medium
                  placeholder:text-gray-400 placeholder:font-normal
                  focus:outline-none focus:ring-2 focus:ring-offset-0
                  transition-all duration-200
                  disabled:opacity-50 disabled:cursor-not-allowed
                  ${errors.query
                    ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                    : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                  }
                `}
                aria-invalid={!!errors.query}
                aria-describedby={errors.query ? 'query-error' : undefined}
              />
            </div>
            {errors.query && (
              <p id="query-error" className="mt-1 text-xs text-red-600">
                {errors.query}
              </p>
            )}
          </div>

          {/* Country Autocomplete - DOIT ÊTRE AVANT LA VILLE */}
          <div className="flex-1 min-w-0">
            <AutocompleteInput
              placeholder="Pays"
              value={country}
              onChange={handleCountryChange}
              onSearch={fetchCountries}
              disabled={disabled || isLoading}
              icon={<Globe className="h-5 w-5" />}
              error={!!errors.country}
              helperText={errors.country}
              required
            />
          </div>

          {/* Location Autocomplete - APRÈS LE PAYS */}
          <div className="flex-1 min-w-0">
            <AutocompleteInput
              placeholder="Ville (optionnel)"
              value={location}
              onChange={setLocation}
              onSearch={fetchCities}
              disabled={disabled || isLoading || !isCountryValid}
              icon={<MapPin className="h-5 w-5" />}
              emptyMessage={!isCountryValid ? "Sélectionnez d'abord un pays" : "Aucune ville trouvée"}
            />
          </div>

          {/* Action Button */}
          <div className="flex-shrink-0">
            <Button
              onClick={() => handleSearch()}
              disabled={disabled || isLoading}
              size="lg"
              className="px-6 whitespace-nowrap bg-gradient-to-r from-huntzen-blue to-huntzen-turquoise hover:from-huntzen-blue/90 hover:to-huntzen-turquoise/90"
            >
              {isLoading ? 'Recherche...' : 'Rechercher'}
            </Button>
          </div>
        </div>

        {/* Options Row: Radius Slider + Remote Checkbox */}
        <div className="flex items-center gap-4 pt-3 border-t border-gray-100">
          {/* Include Remote Jobs Checkbox - ALWAYS VISIBLE */}
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
              Inclure jobs remote
            </label>
          </div>

          {/* Radius Slider - Only show if city is specified */}
          {location && (
            <>
              <div className="w-px h-6 bg-gray-200" />
              <div className="flex items-center gap-3 flex-1">
                <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0 max-w-md">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-700">Rayon de recherche</span>
                    <span className="text-xs font-bold text-huntzen-blue">{radiusKm} km</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={radiusKm}
                    onChange={(e) => setRadiusKm(Number(e.target.value))}
                    disabled={disabled || isLoading}
                    className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-huntzen-blue disabled:opacity-50"
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Mobile: Vertical Layout */}
      <div className="md:hidden space-y-4 p-4 bg-white rounded-xl shadow-sm border border-gray-200">
        {/* Query Input */}
        <div>
          <label htmlFor="query-mobile" className="sr-only">
            Métier ou poste recherché
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
            <input
              id="query-mobile"
              type="text"
              placeholder="Métier ou poste recherché"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={disabled || isLoading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSearch()
                }
              }}
              className={`
                w-full pl-10 pr-4 py-3
                bg-white
                border rounded-lg
                text-sm font-medium
                placeholder:text-gray-400 placeholder:font-normal
                focus:outline-none focus:ring-2 focus:ring-offset-0
                transition-all duration-200
                disabled:opacity-50 disabled:cursor-not-allowed
                ${errors.query
                  ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                  : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                }
              `}
              aria-invalid={!!errors.query}
              aria-describedby={errors.query ? 'query-error-mobile' : undefined}
            />
          </div>
          {errors.query && (
            <p id="query-error-mobile" className="mt-1 text-xs text-red-600">
              {errors.query}
            </p>
          )}
        </div>

        {/* Country Autocomplete - DOIT ÊTRE AVANT LA VILLE */}
        <AutocompleteInput
          placeholder="Pays"
          value={country}
          onChange={handleCountryChange}
          onSearch={fetchCountries}
          disabled={disabled || isLoading}
          icon={<Globe className="h-5 w-5" />}
          error={!!errors.country}
          helperText={errors.country}
          required
        />

        {/* Location Autocomplete - APRÈS LE PAYS */}
        <AutocompleteInput
          placeholder="Ville (optionnel)"
          value={location}
          onChange={setLocation}
          onSearch={fetchCities}
          disabled={disabled || isLoading || !isCountryValid}
          icon={<MapPin className="h-5 w-5" />}
          emptyMessage={!isCountryValid ? "Sélectionnez d'abord un pays" : "Aucune ville trouvée"}
        />

        {/* Radius Slider - Only show if city is specified */}
        {location && (
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-lg border border-gray-200">
            <MapPin className="h-5 w-5 text-gray-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Rayon de recherche</span>
                <span className="text-sm font-bold text-huntzen-blue">{radiusKm} km</span>
              </div>
              <input
                type="range"
                min="1"
                max="100"
                value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
                disabled={disabled || isLoading}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-huntzen-blue disabled:opacity-50"
              />
            </div>
          </div>
        )}

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
            Inclure jobs remote
          </label>
        </div>

        {/* Action Buttons */}
        <div className="w-full">
          <Button
            onClick={() => handleSearch()}
            disabled={disabled || isLoading}
            size="lg"
            className="w-full bg-gradient-to-r from-huntzen-blue to-huntzen-turquoise hover:from-huntzen-blue/90 hover:to-huntzen-turquoise/90"
          >
            {isLoading ? 'Recherche...' : 'Rechercher'}
          </Button>
        </div>
      </div>

      {/* Remaining usage indicator (freemium) */}
      {isFreePlan && (
        <div className="mt-3 text-center">
          <p className="text-xs text-gray-500">
            {getRemaining('job_search')} recherche(s) restante(s) aujourd&apos;hui
          </p>
        </div>
      )}
    </div>
  )
}
