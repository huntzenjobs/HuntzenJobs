import useSWR from 'swr'
import { huntzenApi, Job } from '@/lib/api/huntzen-client'

interface JobSearchParams {
  job_title: string
  country_code: string
  city?: string
  contract_type?: string
}

interface JobSearchResult {
  jobs: Job[]
  count: number
  corrected_query?: string
}

/**
 * Custom SWR hook for job search with client-side caching
 *
 * Features:
 * - Automatic deduplication: Multiple components searching the same query only trigger one API call
 * - Client-side cache: Results are cached for 60 seconds per query
 * - Background revalidation: Stale data shows immediately while fetching fresh data in background
 * - Optimistic UI: Loading states are managed automatically
 *
 * Usage:
 *   const { jobs, isLoading, error } = useJobSearch({
 *     job_title: 'Software Engineer',
 *     country_code: 'fr'
 *   })
 */
export function useJobSearch(params: JobSearchParams | null) {
  // Generate unique cache key from search parameters
  const cacheKey = params
    ? `/jobs/search/${params.job_title}/${params.country_code}/${params.city || ''}/${params.contract_type || ''}`
    : null

  // SWR fetcher function
  const fetcher = async () => {
    if (!params) return null
    return await huntzenApi.searchJobs(params)
  }

  // SWR configuration
  const { data, error, isLoading, mutate } = useSWR<JobSearchResult | null>(
    cacheKey,
    fetcher,
    {
      // Don't revalidate on window focus (avoid unnecessary API calls)
      revalidateOnFocus: false,

      // Deduplicate requests within 60 seconds
      dedupingInterval: 60000,

      // Revalidate if data becomes stale
      revalidateIfStale: true,

      // Keep previous data while fetching new data
      keepPreviousData: true,

      // Retry on error
      shouldRetryOnError: true,
      errorRetryCount: 2,
      errorRetryInterval: 1000,
    }
  )

  return {
    jobs: data?.jobs || [],
    count: data?.count || 0,
    corrected_query: data?.corrected_query,
    isLoading,
    error: error as Error | undefined,
    // Allow manual cache invalidation
    refresh: mutate,
  }
}

/**
 * Custom hook for fetching full job description with caching
 *
 * Usage:
 *   const { description, isLoading } = useJobDescription(url, source)
 */
export function useJobDescription(url: string | null, source?: string) {
  const cacheKey = url ? `/jobs/description/${url}/${source || ''}` : null

  const fetcher = async () => {
    if (!url) return null
    const description = await huntzenApi.getJobDescription(url, source)
    return description && description.length > 100 ? description : null
  }

  const { data, error, isLoading } = useSWR<string | null>(cacheKey, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 300000, // 5 minutes for descriptions
    revalidateIfStale: false, // Descriptions don't change often
  })

  return {
    description: data,
    isLoading,
    error: error as Error | undefined,
  }
}
