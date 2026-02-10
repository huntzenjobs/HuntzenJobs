const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || (() => {
  throw new Error('NEXT_PUBLIC_BACKEND_URL or NEXT_PUBLIC_API_URL is not configured')
})()

export interface Country {
  name: string
  code: string
}

export interface ContractType {
  id: string
  label: string
  label_en: string
}

export interface Job {
  id: string
  title: string
  company: string
  location: string
  description: string
  url: string
  salary?: string
  source: string
  posted_date?: string
}

export interface SavedJob {
  id: string
  job_title: string
  company: string
  location: string
  salary?: string
  job_url: string
  description?: string
  external_job_id?: string
  job_source: string
  saved_at: string
  updated_at: string
}

export interface Recruiter {
  name: string
  title?: string
  company: string
  linkedin_url?: string
  email?: string
  location?: string
}

export interface CVAnalysisResult {
  success: boolean
  analysis: string
  score?: number
  cv_info?: {
    name?: string
    email?: string
    phone?: string
    skills?: string[]
  }
  filename?: string
  error?: string
}

export interface JobFair {
  title: string
  event_type: string
  public: string
  sector: string
  level: string
  date_start: string
  date_end?: string
  time_start?: string
  time_end?: string
  city: string
  region: string
  address?: string
  format: string
  organizer: string
  description?: string
  url: string
  source: string
  registration_url?: string
  is_free: boolean
  companies_count?: number
}

export interface JobFairSearchResult {
  success: boolean
  message: string
  events: JobFair[]
  count: number
  filters_applied: {
    region?: string
    sector?: string
    public?: string
    event_type?: string
    format?: string
  }
}

class HuntzenApiClient {
  private baseUrl: string

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl
  }

  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    })

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  // Countries & Cities
  async getCountries(): Promise<Country[]> {
    const response = await this.fetch<{ success: boolean; data: Country[] }>('/api/countries')
    return response.data || []
  }

  async getCities(countryName: string): Promise<string[]> {
    const response = await this.fetch<{ success: boolean; data: string[] }>(
      `/api/cities/${encodeURIComponent(countryName)}`
    )
    return response.data || []
  }

  /**
   * Search cities dynamically using OpenStreetMap Nominatim
   * @param query - City search query (e.g., "Garges", "Par")
   * @param countryCode - ISO country code (e.g., "fr", "by")
   * @returns List of matching city names
   */
  async searchCities(query: string, countryCode: string): Promise<string[]> {
    if (!query || query.length < 1) return []

    const response = await this.fetch<{ success: boolean; data: string[] }>(
      `/api/cities/search?q=${encodeURIComponent(query)}&country_code=${countryCode}`
    )
    return response.data || []
  }

  async getContractTypes(): Promise<ContractType[]> {
    const response = await this.fetch<{ success: boolean; data: ContractType[] }>('/api/contract-types')
    return response.data || []
  }

  // Job Search
  async searchJobs(params: {
    job_title: string
    country_code: string
    city?: string
    contract_type?: string
    radiusKm?: number
    includeRemote?: boolean
    // Advanced filters (Premium feature)
    industries?: string
    keywords?: string
    experienceLevel?: string
    salaryMin?: number
    salaryMax?: number
    companySize?: string
  }): Promise<{ jobs: Job[]; count: number; corrected_query?: string }> {
    // Build query parameters
    const queryParams = new URLSearchParams()
    queryParams.append('q', params.job_title)
    queryParams.append('country', params.country_code)
    if (params.city) queryParams.append('city', params.city)
    if (params.contract_type) queryParams.append('contract', params.contract_type)
    if (params.radiusKm !== undefined) queryParams.append('radius', params.radiusKm.toString())
    if (params.includeRemote !== undefined) queryParams.append('include_remote', params.includeRemote.toString())

    // Add advanced filters if provided
    if (params.industries) queryParams.append('industries', params.industries)
    if (params.keywords) queryParams.append('keywords', params.keywords)
    if (params.experienceLevel) queryParams.append('experience_level', params.experienceLevel)
    if (params.salaryMin !== undefined) queryParams.append('salary_min', params.salaryMin.toString())
    if (params.salaryMax !== undefined) queryParams.append('salary_max', params.salaryMax.toString())
    if (params.companySize) queryParams.append('company_size', params.companySize)

    const response = await this.fetch<{
      success: boolean
      jobs: Job[]
      count: number
      corrected_query?: string
      metadata?: {
        total_filtered?: number
        total_before_filters?: number
      }
    }>(`/api/jobs/search?${queryParams.toString()}`)

    return {
      jobs: response.jobs || [],
      count: response.metadata?.total_filtered ?? response.count ?? 0,
      corrected_query: response.corrected_query,
    }
  }

  // Saved Jobs
  async saveJob(job: Job, token: string): Promise<{ success: boolean; job_id: string }> {
    return this.fetch<{ success: boolean; job_id: string }>('/api/saved-jobs', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        job_title: job.title,
        company: job.company,
        location: job.location,
        salary: job.salary || null,
        job_url: job.url,
        description: job.description,
        external_job_id: job.id,
        job_source: job.source,
      }),
    })
  }

  async getSavedJobs(token: string): Promise<SavedJob[]> {
    const response = await this.fetch<{ success: boolean; jobs: SavedJob[] }>(
      '/api/saved-jobs',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )
    return response.jobs || []
  }

  async deleteSavedJob(jobId: string, token: string): Promise<{ success: boolean }> {
    return this.fetch<{ success: boolean }>(`/api/saved-jobs/${jobId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
  }

  // Recruiter Search
  async searchRecruiter(companyName: string, location?: string): Promise<Recruiter[]> {
    const response = await this.fetch<{
      success: boolean
      recruiters: Recruiter[]
    }>('/api/search/recruiter', {
      method: 'POST',
      body: JSON.stringify({
        company_name: companyName,
        location: location || '',
      }),
    })
    return response.recruiters || []
  }

  async searchRecruitersByDomain(
    domain: string,
    country?: string,
    city?: string
  ): Promise<Recruiter[]> {
    const response = await this.fetch<{
      success: boolean
      recruiters: Recruiter[]
    }>('/api/search/recruiters-by-domain', {
      method: 'POST',
      body: JSON.stringify({
        domain,
        country: country || 'France',
        city: city || '',
      }),
    })
    return response.recruiters || []
  }

  // CV Analysis
  async analyzeCV(
    cvText: string,
    jobDescription?: string,
    language: string = 'fr'
  ): Promise<CVAnalysisResult> {
    return this.fetch<CVAnalysisResult>('/api/analyze-cv', {
      method: 'POST',
      body: JSON.stringify({
        cv_text: cvText,
        job_description: jobDescription || '',
        language,
      }),
    })
  }

  async analyzeCVFile(
    file: File,
    jobDescription?: string,
    language: string = 'fr'
  ): Promise<CVAnalysisResult> {
    const formData = new FormData()
    formData.append('file', file)
    if (jobDescription) {
      formData.append('job_description', jobDescription)
    }
    formData.append('language', language)

    // Timeout de 5 minutes pour le chargement initial des modèles Marker et traitement OCR
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 300000) // 5 minutes

    try {
      const response = await fetch(`${this.baseUrl}/api/analyze-cv-pdf`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`)
      }

      return response.json()
    } catch (error: any) {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError') {
        throw new Error('L\'analyse a pris trop de temps. Les modèles sont peut-être en cours de chargement. Veuillez réessayer dans quelques instants.')
      }
      throw error
    }
  }

  // Assistant Chat - Unified endpoint for all assistants
  async sendAssistantMessage(
    message: string,
    sessionId: string,
    assistantType: 'career-coach' | 'job-scout' | 'cv-analyzer' | 'cv-adapter' | 'interview-sim'
  ): Promise<{ success: boolean; response: string; agent: string }> {
    // Route to appropriate endpoint based on assistant type
    const endpointMap = {
      'career-coach': '/api/coach/chat',
      'job-scout': '/api/assistant/job-scout',
      'cv-analyzer': '/api/assistant/cv-analyzer',
      'cv-adapter': '/api/assistant/cv-adapter',
      'interview-sim': '/api/assistant/interview-sim',
    }

    const endpoint = endpointMap[assistantType] || '/api/coach/chat'

    return this.fetch<{ success: boolean; response: string; agent: string }>(endpoint, {
      method: 'POST',
      body: JSON.stringify({
        message,
        session_id: sessionId,
        assistant_type: assistantType,
      }),
    })
  }

  // Legacy method - kept for backwards compatibility
  async sendCoachMessage(
    message: string,
    sessionId: string
  ): Promise<{ success: boolean; response: string; agent: string }> {
    return this.sendAssistantMessage(message, sessionId, 'career-coach')
  }

  // Specific assistant methods for better type safety
  async sendCareerCoachMessage(message: string, sessionId: string) {
    return this.sendAssistantMessage(message, sessionId, 'career-coach')
  }

  async sendJobScoutMessage(message: string, sessionId: string) {
    return this.sendAssistantMessage(message, sessionId, 'job-scout')
  }

  async sendCVAnalyzerMessage(message: string, sessionId: string, cvData?: any) {
    return this.fetch<{ success: boolean; response: string; agent: string }>(
      '/api/assistant/cv-analyzer',
      {
        method: 'POST',
        body: JSON.stringify({
          message,
          session_id: sessionId,
          assistant_type: 'cv-analyzer',
          cv_data: cvData,
        }),
      }
    )
  }

  async sendCVAdapterMessage(
    message: string,
    sessionId: string,
    cvData?: any,
    jobDescription?: string
  ) {
    return this.fetch<{ success: boolean; response: string; agent: string }>(
      '/api/assistant/cv-adapter',
      {
        method: 'POST',
        body: JSON.stringify({
          message,
          session_id: sessionId,
          assistant_type: 'cv-adapter',
          cv_data: cvData,
          job_description: jobDescription,
        }),
      }
    )
  }

  async sendInterviewSimMessage(message: string, sessionId: string, jobInfo?: any) {
    return this.fetch<{ success: boolean; response: string; agent: string }>(
      '/api/assistant/interview-sim',
      {
        method: 'POST',
        body: JSON.stringify({
          message,
          session_id: sessionId,
          assistant_type: 'interview-sim',
          job_info: jobInfo,
        }),
      }
    )
  }

  // Job Description
  async getJobDescription(url: string, source?: string): Promise<string> {
    const response = await this.fetch<{ success: boolean; description: string }>(
      '/api/jobs/description',
      {
        method: 'POST',
        body: JSON.stringify({ url, source: source || '' }),
      }
    )
    return response.description || ''
  }

  // Job Fairs / Salons d'Emploi
  async searchJobFairs(params: {
    region?: string
    sector?: string
    public?: string
    event_type?: string
    format_type?: string
  }): Promise<JobFairSearchResult> {
    const queryParams = new URLSearchParams()
    if (params.region) queryParams.append('region', params.region)
    if (params.sector) queryParams.append('sector', params.sector)
    if (params.public) queryParams.append('public', params.public)
    if (params.event_type) queryParams.append('event_type', params.event_type)
    if (params.format_type) queryParams.append('format_type', params.format_type)

    const query = queryParams.toString()
    const url = query ? `/api/job-fairs/search?${query}` : '/api/job-fairs/search'

    return this.fetch<JobFairSearchResult>(url)
  }

  async getJobFairRegions(): Promise<string[]> {
    const response = await this.fetch<{ success: boolean; regions: string[] }>(
      '/api/job-fairs/regions'
    )
    return response.regions || []
  }

  async getJobFairSectors(): Promise<string[]> {
    const response = await this.fetch<{ success: boolean; sectors: string[] }>(
      '/api/job-fairs/sectors'
    )
    return response.sectors || []
  }

  async getJobFairEventTypes(): Promise<string[]> {
    const response = await this.fetch<{ success: boolean; event_types: string[] }>(
      '/api/job-fairs/event-types'
    )
    return response.event_types || []
  }
}

export const huntzenApi = new HuntzenApiClient()
export default huntzenApi
