'use client'

import { useEffect, useState } from 'react'
import { Bookmark, Briefcase, MapPin, Clock, ExternalLink, Trash2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useOptionalAuth } from '@/contexts/auth-context'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'

interface SavedJob {
  id: string
  job_title: string
  company: string
  location: string
  salary?: string
  job_url: string
  saved_at: string
  description?: string
}

export default function SavedJobsPage() {
  const auth = useOptionalAuth()
  const user = auth?.user

  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (user) {
      fetchSavedJobs()
    } else {
      setLoading(false)
    }
  }, [user])

  const fetchSavedJobs = async () => {
    try {
      const supabase = createClient()

      // TODO: Implémenter la table saved_jobs dans Supabase
      // Pour l'instant, retourner un tableau vide
      const { data, error } = await supabase
        .from('saved_jobs')
        .select('*')
        .eq('user_id', user?.id)
        .order('saved_at', { ascending: false })

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = table doesn't exist
        console.error('Error fetching saved jobs:', error)
        throw error
      }

      setSavedJobs(data || [])
    } catch (error) {
      console.error('Failed to fetch saved jobs:', error)
      // Don't show error toast if table doesn't exist yet
      setSavedJobs([])
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveSavedJob = async (jobId: string) => {
    try {
      const supabase = createClient()

      const { error } = await supabase
        .from('saved_jobs')
        .delete()
        .eq('id', jobId)
        .eq('user_id', user?.id)

      if (error) throw error

      setSavedJobs(prev => prev.filter(job => job.id !== jobId))
      toast.success('Offre retirée des favoris')
    } catch (error) {
      console.error('Failed to remove saved job:', error)
      toast.error('Erreur lors de la suppression')
    }
  }

  const filteredJobs = savedJobs.filter(job =>
    job.job_title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    job.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
    job.location.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-4">
          <Bookmark className="w-16 h-16 text-gray-300 mx-auto" />
          <h2 className="text-2xl font-bold text-gray-900">Connectez-vous pour sauvegarder des offres</h2>
          <p className="text-gray-600 max-w-md mx-auto">
            Créez un compte gratuit pour sauvegarder vos offres d'emploi favorites et y accéder facilement.
          </p>
          <Button onClick={() => window.location.href = '/login'}>
            Se connecter
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-8 rounded-2xl border-2 border-gray-200 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-xl bg-huntzen-blue flex items-center justify-center">
            <Bookmark className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-4xl font-black text-gray-900">Jobs Sauvegardés</h1>
        </div>
        <p className="text-lg text-gray-600">
          Retrouvez toutes vos offres d'emploi favorites en un seul endroit
        </p>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-6 rounded-2xl border-2 border-gray-200 shadow-sm">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            type="text"
            placeholder="Rechercher dans mes favoris..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-12 text-base"
          />
        </div>
      </div>

      {/* Jobs List */}
      <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-sm">
        {loading ? (
          <div className="divide-y divide-gray-200">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-6 space-y-3">
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            ))}
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="p-12 text-center">
            <Bookmark className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            {searchQuery ? (
              <>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Aucun résultat trouvé
                </h3>
                <p className="text-gray-600 mb-4">
                  Essayez de modifier votre recherche
                </p>
              </>
            ) : (
              <>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Aucune offre sauvegardée
                </h3>
                <p className="text-gray-600 mb-4">
                  Commencez à sauvegarder vos offres favorites depuis la page de recherche
                </p>
                <Button onClick={() => window.location.href = '/jobs'}>
                  <Briefcase className="w-4 h-4 mr-2" />
                  Rechercher des offres
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredJobs.map((job) => (
              <div key={job.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    {/* Job Title & Company */}
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 mb-1">
                        {job.job_title}
                      </h3>
                      <p className="text-base text-gray-700 font-medium">
                        {job.company}
                      </p>
                    </div>

                    {/* Location & Salary */}
                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-4 h-4" />
                        <span>{job.location}</span>
                      </div>
                      {job.salary && (
                        <div className="flex items-center gap-1.5 text-huntzen-blue font-medium">
                          <span>{job.salary}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-gray-400">
                        <Clock className="w-4 h-4" />
                        <span>
                          Sauvegardé le {new Date(job.saved_at).toLocaleDateString('fr-FR')}
                        </span>
                      </div>
                    </div>

                    {/* Description preview */}
                    {job.description && (
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {job.description}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2">
                    <Button
                      onClick={() => window.open(job.job_url, '_blank')}
                      size="sm"
                      className="whitespace-nowrap"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Voir l'offre
                    </Button>
                    <Button
                      onClick={() => handleRemoveSavedJob(job.id)}
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Retirer
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info Banner */}
      {!loading && filteredJobs.length > 0 && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-6">
          <h3 className="font-semibold text-blue-900 mb-2">
            💡 Astuce
          </h3>
          <p className="text-blue-700 text-sm">
            Utilisez la barre de recherche pour retrouver rapidement une offre spécifique parmi vos favoris.
            Vos offres sauvegardées sont synchronisées sur tous vos appareils.
          </p>
        </div>
      )}

      {/* Coming Soon Features */}
      <div className="bg-gray-50 border-2 border-gray-200 rounded-2xl p-6">
        <h3 className="font-semibold text-gray-900 mb-3">
          🚀 Prochainement
        </h3>
        <ul className="space-y-2 text-sm text-gray-600">
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 bg-huntzen-blue rounded-full mt-1.5" />
            <span>Organisation par dossiers et étiquettes personnalisées</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 bg-huntzen-blue rounded-full mt-1.5" />
            <span>Alertes automatiques si une offre favorite expire</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 bg-huntzen-blue rounded-full mt-1.5" />
            <span>Exportation de vos favoris en PDF</span>
          </li>
        </ul>
      </div>
    </div>
  )
}
