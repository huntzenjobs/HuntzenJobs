import { useState, useEffect } from 'react'
import { huntzenApi } from '@/lib/api/huntzen-client'

export function useFullJobDescription(url: string | undefined, source?: string) {
  const [description, setDescription] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!url) return

    const fetchFullDescription = async () => {
      setLoading(true)
      try {
        const fullDesc = await huntzenApi.getJobDescription(url, source)
        if (fullDesc && fullDesc.length > 100) {
          setDescription(fullDesc)
        }
      } catch (err) {
        console.error('Failed to fetch full description:', err)
        setError('Impossible de charger la description complète')
      } finally {
        setLoading(false)
      }
    }

    fetchFullDescription()
  }, [url, source])

  return { description, loading, error }
}
