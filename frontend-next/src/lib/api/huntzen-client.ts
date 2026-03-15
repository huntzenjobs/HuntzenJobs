// Resolved lazily inside fetch() to avoid crashing at module load time during
// Next.js static generation (prerendering), where NEXT_PUBLIC_* vars may be absent.
function getApiBaseUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_BACKEND_URL or NEXT_PUBLIC_API_URL is not configured",
    );
  }
  return url;
}

export interface QueueWaitingState {
  status: "queued" | "processing";
  estimatedWaitSeconds: number;
  elapsedSeconds: number;
}

export interface Country {
  name: string;
  code: string;
}

export interface ContractType {
  id: string;
  label: string;
  label_en: string;
}

export interface LocationResult {
  name: string;
  type: "city" | "region" | "department";
  code?: string; // department number (e.g., "75" for Paris)
}

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
  salary?: string;
  source: string;
  posted_date?: string;
  url_is_direct?: boolean;
  description_truncated?: boolean;
  contract_type?: string;
}

export interface SavedJob {
  id: string;
  job_title: string;
  company: string;
  location: string;
  salary?: string;
  job_url: string;
  description?: string;
  external_job_id?: string;
  job_source: string;
  saved_at: string;
  updated_at: string;
}

export interface Recruiter {
  name: string;
  title?: string;
  company: string;
  linkedin_url?: string;
  email?: string;
  location?: string;
}

export interface JobFair {
  title: string;
  event_type: string;
  public: string;
  sector: string;
  level: string;
  date_start: string;
  date_end?: string;
  time_start?: string;
  time_end?: string;
  city: string;
  region: string;
  address?: string;
  format: string;
  organizer: string;
  description?: string;
  url: string;
  source: string;
  registration_url?: string;
  is_free: boolean;
  companies_count?: number;
}

export interface JobFairSearchResult {
  success: boolean;
  message: string;
  events: JobFair[];
  count: number;
  filters_applied: {
    region?: string;
    sector?: string;
    public?: string;
    event_type?: string;
    format?: string;
  };
}

class HuntzenApiClient {
  private _baseUrl?: string;

  constructor(baseUrl?: string) {
    this._baseUrl = baseUrl;
  }

  private get baseUrl(): string {
    return this._baseUrl ?? getApiBaseUrl();
  }

  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // Countries & Cities
  async getCountries(): Promise<Country[]> {
    const response = await this.fetch<{ success: boolean; data: Country[] }>(
      "/api/countries",
    );
    return response.data || [];
  }

  async getCities(countryName: string): Promise<string[]> {
    const response = await this.fetch<{ success: boolean; data: string[] }>(
      `/api/cities/${encodeURIComponent(countryName)}`,
    );
    return response.data || [];
  }

  /**
   * Search cities dynamically using OpenStreetMap Nominatim
   * @param query - City search query (e.g., "Garges", "Par")
   * @param countryCode - ISO country code (e.g., "fr", "by")
   * @returns List of matching city names
   */
  async searchCities(
    query: string,
    countryCode: string,
  ): Promise<LocationResult[]> {
    if (!query || query.length < 1) return [];

    const response = await this.fetch<{
      success: boolean;
      data: LocationResult[];
    }>(
      `/api/cities/search?q=${encodeURIComponent(query)}&country_code=${countryCode}`,
    );
    return response.data || [];
  }

  async getContractTypes(): Promise<ContractType[]> {
    const response = await this.fetch<{
      success: boolean;
      data: ContractType[];
    }>("/api/contract-types");
    return response.data || [];
  }

  // Job Search
  async searchJobs(params: {
    job_title: string;
    country_code: string;
    city?: string;
    contract_type?: string;
    radiusKm?: number;
    includeRemote?: boolean;
    // Advanced filters (Premium feature)
    industries?: string;
    keywords?: string;
    experienceLevel?: string;
    salaryMin?: number;
    salaryMax?: number;
    companySize?: string;
  }): Promise<{ jobs: Job[]; count: number; corrected_query?: string }> {
    // Build query parameters
    const queryParams = new URLSearchParams();
    queryParams.append("q", params.job_title);
    queryParams.append("country", params.country_code);
    if (params.city) queryParams.append("city", params.city);
    if (params.contract_type)
      queryParams.append("contract", params.contract_type);
    if (params.radiusKm !== undefined)
      queryParams.append("radius", params.radiusKm.toString());
    if (params.includeRemote !== undefined)
      queryParams.append("include_remote", params.includeRemote.toString());

    // Add advanced filters if provided
    if (params.industries) queryParams.append("industries", params.industries);
    if (params.keywords) queryParams.append("keywords", params.keywords);
    if (params.experienceLevel)
      queryParams.append("experience_level", params.experienceLevel);
    if (params.salaryMin !== undefined)
      queryParams.append("salary_min", params.salaryMin.toString());
    if (params.salaryMax !== undefined)
      queryParams.append("salary_max", params.salaryMax.toString());
    if (params.companySize)
      queryParams.append("company_size", params.companySize);

    const response = await this.fetch<{
      success: boolean;
      jobs: Job[];
      count: number;
      corrected_query?: string;
      metadata?: {
        total_filtered?: number;
        total_before_filters?: number;
      };
    }>(`/api/jobs/search?${queryParams.toString()}`);

    return {
      jobs: response.jobs || [],
      count: response.metadata?.total_filtered ?? response.count ?? 0,
      corrected_query: response.corrected_query,
    };
  }

  // Saved Jobs
  async saveJob(
    job: Job,
    token: string,
  ): Promise<{ success: boolean; job_id: string }> {
    return this.fetch<{ success: boolean; job_id: string }>("/api/saved-jobs", {
      method: "POST",
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
    });
  }

  async getSavedJobs(token: string): Promise<SavedJob[]> {
    const response = await this.fetch<{ success: boolean; jobs: SavedJob[] }>(
      "/api/saved-jobs",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return response.jobs || [];
  }

  async deleteSavedJob(
    jobId: string,
    token: string,
  ): Promise<{ success: boolean }> {
    return this.fetch<{ success: boolean }>(`/api/saved-jobs/${jobId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  // Recruiter Search
  async searchRecruiter(
    companyName: string,
    location?: string,
  ): Promise<Recruiter[]> {
    const response = await this.fetch<{
      success: boolean;
      recruiters: Recruiter[];
    }>("/api/search/recruiter", {
      method: "POST",
      body: JSON.stringify({
        company_name: companyName,
        location: location || "",
      }),
    });
    return response.recruiters || [];
  }

  async searchRecruitersByDomain(
    domain: string,
    country?: string,
    city?: string,
  ): Promise<Recruiter[]> {
    const response = await this.fetch<{
      success: boolean;
      recruiters: Recruiter[];
    }>("/api/search/recruiters-by-domain", {
      method: "POST",
      body: JSON.stringify({
        domain,
        country: country || "France",
        city: city || "",
      }),
    });
    return response.recruiters || [];
  }

  // ── ARQ job polling ───────────────────────────────────────────────────────
  // Poll immédiat puis toutes les 3s. Timeout max 2 min.
  private async _waitForJob(
    jobId: string,
    initialEstimatedWait: number = 30,
    token?: string,
    maxWaitMs = 120_000,
    pollIntervalMs = 3_000,
    onQueueUpdate?: (state: QueueWaitingState) => void,
  ): Promise<{ success: boolean; response: string; agent: string }> {
    const deadline = Date.now() + maxWaitMs;
    const startTime = Date.now();

    while (Date.now() < deadline) {
      let status: {
        status: "queued" | "processing" | "completed" | "failed";
        result?: { success: boolean; response: string; agent: string };
        error?: string;
      };

      try {
        status = await this.fetch<typeof status>(`/api/queue/status/${jobId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
      } catch (e: any) {
        // Job expiré (TTL 1h dépassé) → erreur claire
        if (e.message?.includes("404")) {
          throw new Error(
            "Ce traitement a expiré. Merci de renvoyer votre message.",
          );
        }
        // Erreur réseau / 5xx transitoire → on continue de poller
        await new Promise((r) => setTimeout(r, pollIntervalMs));
        continue;
      }

      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      onQueueUpdate?.({
        status: status.status === "processing" ? "processing" : "queued",
        estimatedWaitSeconds: initialEstimatedWait,
        elapsedSeconds,
      });

      if (status.status === "completed" && status.result) {
        return status.result;
      }
      if (status.status === "failed") {
        throw new Error(
          status.error || "La requête a échoué dans la file d'attente",
        );
      }
      // queued | processing → attendre avant prochain poll
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    throw new Error("Timeout : la réponse a pris trop de temps (> 2 min)");
  }

  // Assistant Chat - Unified endpoint for all assistants
  async sendAssistantMessage(
    message: string,
    sessionId: string,
    assistantType:
      | "career-coach"
      | "job-scout"
      | "cv-analyzer"
      | "cv-adapter"
      | "interview-sim",
    language: string = "fr",
    token?: string,
    onQueueUpdate?: (state: QueueWaitingState) => void,
  ): Promise<{ success: boolean; response: string; agent: string }> {
    // Route to appropriate endpoint based on assistant type
    const endpointMap = {
      "career-coach": "/api/coach/chat",
      "job-scout": "/api/assistant/job-scout",
      "cv-analyzer": "/api/assistant/cv-analyzer",
      "cv-adapter": "/api/assistant/cv-adapter",
      "interview-sim": "/api/assistant/interview-sim",
    };

    const endpoint = endpointMap[assistantType] || "/api/coach/chat";

    const raw = await this.fetch<
      | { success: boolean; response: string; agent: string }
      | { queued: true; job_id: string; estimated_wait_seconds: number }
    >(endpoint, {
      method: "POST",
      body: JSON.stringify({
        message,
        session_id: sessionId,
        assistant_type: assistantType,
        language,
      }),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    // Réponse immédiate (sync path)
    if (!("queued" in raw)) return raw;

    // Réponse différée (ARQ path) — poll jusqu'au résultat
    return this._waitForJob(
      raw.job_id,
      raw.estimated_wait_seconds ?? 30,
      token,
      120_000,
      3_000,
      onQueueUpdate,
    );
  }

  async sendBrandingMessage(
    message: string,
    sessionId: string,
    language: string = "fr",
    brandingState?: Record<string, unknown> | null,
    token?: string,
  ): Promise<{
    success: boolean;
    response: string;
    language: string;
    branding_state: Record<string, unknown> | null;
  }> {
    return this.fetch("/api/branding/chat", {
      method: "POST",
      body: JSON.stringify({
        message,
        session_id: sessionId,
        language,
        branding_state: brandingState ?? null,
      }),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  }

  // Legacy method - kept for backwards compatibility
  async sendCoachMessage(
    message: string,
    sessionId: string,
  ): Promise<{ success: boolean; response: string; agent: string }> {
    return this.sendAssistantMessage(message, sessionId, "career-coach");
  }

  // Specific assistant methods for better type safety
  async sendCareerCoachMessage(message: string, sessionId: string) {
    return this.sendAssistantMessage(message, sessionId, "career-coach");
  }

  async sendJobScoutMessage(message: string, sessionId: string) {
    return this.sendAssistantMessage(message, sessionId, "job-scout");
  }

  async sendCVAnalyzerMessage(
    message: string,
    sessionId: string,
    cvData?: any,
  ) {
    return this.fetch<{ success: boolean; response: string; agent: string }>(
      "/api/assistant/cv-analyzer",
      {
        method: "POST",
        body: JSON.stringify({
          message,
          session_id: sessionId,
          assistant_type: "cv-analyzer",
          cv_data: cvData,
        }),
      },
    );
  }

  async sendCVAdapterMessage(
    message: string,
    sessionId: string,
    cvData?: any,
    jobDescription?: string,
  ) {
    return this.fetch<{ success: boolean; response: string; agent: string }>(
      "/api/assistant/cv-adapter",
      {
        method: "POST",
        body: JSON.stringify({
          message,
          session_id: sessionId,
          assistant_type: "cv-adapter",
          cv_data: cvData,
          job_description: jobDescription,
        }),
      },
    );
  }

  async sendInterviewSimMessage(
    message: string,
    sessionId: string,
    jobInfo?: any,
  ) {
    return this.fetch<{ success: boolean; response: string; agent: string }>(
      "/api/assistant/interview-sim",
      {
        method: "POST",
        body: JSON.stringify({
          message,
          session_id: sessionId,
          assistant_type: "interview-sim",
          job_info: jobInfo,
        }),
      },
    );
  }

  // CV Attachment for Chat
  async attachCVToAssistant(
    file: File,
    assistantType: string,
    sessionId: string,
    language: string = "fr",
    token?: string,
  ): Promise<{
    success: boolean;
    filename: string;
    char_count: number;
    cv_structured: {
      name: string;
      current_role: string;
      years_experience: number;
      key_skills: string[];
      education: string[];
      experiences: Array<{ company: string; role: string; period: string }>;
      languages: string[];
      summary: string;
    };
    initial_response: string;
  }> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("assistant_type", assistantType);
    formData.append("session_id", sessionId);
    formData.append("language", language);

    const response = await fetch(`${this.baseUrl}/api/assistant/attach-cv`, {
      method: "POST",
      body: formData,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        error.detail || `Erreur ${response.status} lors de l'upload du CV`,
      );
    }

    return response.json();
  }

  // Job Description
  async getJobDescription(
    url: string,
    source?: string,
  ): Promise<{ description: string; final_url: string | null }> {
    const response = await this.fetch<{
      success: boolean;
      description: string;
      final_url?: string;
    }>("/api/jobs/description", {
      method: "POST",
      body: JSON.stringify({ url, source: source || "" }),
    });
    return {
      description: response.description || "",
      final_url: response.final_url || null,
    };
  }

  // Job Fairs / Salons d'Emploi
  async searchJobFairs(params: {
    region?: string;
    sector?: string;
    public?: string;
    event_type?: string;
    format_type?: string;
  }): Promise<JobFairSearchResult> {
    const queryParams = new URLSearchParams();
    if (params.region) queryParams.append("region", params.region);
    if (params.sector) queryParams.append("sector", params.sector);
    if (params.public) queryParams.append("public", params.public);
    if (params.event_type) queryParams.append("event_type", params.event_type);
    if (params.format_type)
      queryParams.append("format_type", params.format_type);

    const query = queryParams.toString();
    const url = query
      ? `/api/job-fairs/search?${query}`
      : "/api/job-fairs/search";

    return this.fetch<JobFairSearchResult>(url);
  }

  async getJobFairRegions(): Promise<string[]> {
    const response = await this.fetch<{ success: boolean; regions: string[] }>(
      "/api/job-fairs/regions",
    );
    return response.regions || [];
  }

  async getJobFairSectors(): Promise<string[]> {
    const response = await this.fetch<{ success: boolean; sectors: string[] }>(
      "/api/job-fairs/sectors",
    );
    return response.sectors || [];
  }

  async getJobFairEventTypes(): Promise<string[]> {
    const response = await this.fetch<{
      success: boolean;
      event_types: string[];
    }>("/api/job-fairs/event-types");
    return response.event_types || [];
  }

  // Recruiter Consultation Request
  async createRecruiterRequest(data: {
    fullName: string;
    email: string;
    phone?: string;
    sector: string;
    experienceLevel: string;
    message: string;
    preferredDate?: string;
  }): Promise<{ request_id: string; status: string; message: string }> {
    return this.fetch<{ request_id: string; status: string; message: string }>(
      "/api/recruiter/request",
      {
        method: "POST",
        body: JSON.stringify({
          full_name: data.fullName,
          email: data.email,
          phone: data.phone,
          sector: data.sector,
          experience_level: data.experienceLevel,
          message: data.message,
          preferred_date: data.preferredDate,
        }),
      },
    );
  }

  async createRecruiterPayment(
    requestId: string,
  ): Promise<{ checkout_url: string; session_id: string }> {
    return this.fetch<{ checkout_url: string; session_id: string }>(
      "/api/recruiter/create-payment",
      {
        method: "POST",
        body: JSON.stringify({ request_id: requestId }),
      },
    );
  }

  async getRecruiterRequestStatus(requestId: string): Promise<{
    request_id: string;
    payment_status: string;
    request_status: string;
    created_at: string;
    scheduled_at?: string;
  }> {
    return this.fetch<{
      request_id: string;
      payment_status: string;
      request_status: string;
      created_at: string;
      scheduled_at?: string;
    }>(`/api/recruiter/status/${requestId}`);
  }
}

export const huntzenApi = new HuntzenApiClient();
export default huntzenApi;
