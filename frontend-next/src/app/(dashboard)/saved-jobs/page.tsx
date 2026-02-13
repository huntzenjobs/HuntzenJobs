'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center space-y-4"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-[#00D9FF]/20 to-[#00C4EA]/20 flex items-center justify-center"
          >
            <Bookmark className="w-10 h-10 text-[#00D9FF]" />
          </motion.div>
          <h2 className="text-2xl font-bold text-black">Connectez-vous pour sauvegarder des offres</h2>
          <p className="text-gray-600 max-w-md mx-auto">
            Créez un compte gratuit pour sauvegarder vos offres d'emploi favorites et y accéder facilement.
          </p>
          <Button
            onClick={() => window.location.href = '/login'}
            className="bg-gradient-to-r from-[#00D9FF] to-[#00C4EA] hover:shadow-lg hover:shadow-[#00D9FF]/40 text-white transition-all duration-300"
          >
            Se connecter
          </Button>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Hero Header - HuntZen Style */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-gradient-to-br from-white to-gray-50 p-8 rounded-2xl border border-gray-200 shadow-sm"
      >
        <div className="flex items-center gap-4 mb-3">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#00D9FF] to-[#00C4EA] flex items-center justify-center shadow-lg shadow-[#00D9FF]/30"
          >
            <Bookmark className="w-7 h-7 text-white" />
          </motion.div>
          <h1 className="text-4xl font-black text-black">Jobs Sauvegardés</h1>
        </div>
        <p className="text-base text-gray-700 leading-relaxed">
          Retrouvez toutes vos offres d'emploi favorites en un seul endroit
        </p>
        {!loading && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-sm text-[#00D9FF] font-medium mt-2"
          >
            {savedJobs.length} offre{savedJobs.length > 1 ? 's' : ''} sauvegardée{savedJobs.length > 1 ? 's' : ''}
          </motion.p>
        )}
      </motion.div>

      {/* Search Bar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white p-6 rounded-2xl border-2 border-gray-200 shadow-sm"
      >
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            type="text"
            placeholder="Rechercher dans mes favoris..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 text-base border-gray-300 dark:border-gray-600 focus:border-[#00D9FF] focus:ring-[#00D9FF] dark:bg-gray-700 dark:text-white"
          />
        </div>
      </motion.div>

      {/* Jobs List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white rounded-2xl border-2 border-gray-200 shadow-sm"
      >
        {loading ? (
          <div className="divide-y divide-gray-200">
            {[1, 2, 3].map((i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="p-6 space-y-3"
              >
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-1/3" />
              </motion.div>
            ))}
          </div>
        ) : filteredJobs.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-12 text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
              className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-[#00D9FF]/20 to-[#00C4EA]/20 flex items-center justify-center"
            >
              <Bookmark className="w-10 h-10 text-[#00D9FF]" />
            </motion.div>
            {searchQuery ? (
              <>
                <h3 className="text-xl font-bold text-black mb-2">
                  Aucun résultat trouvé
                </h3>
                <p className="text-gray-600 mb-4">
                  Essayez de modifier votre recherche
                </p>
              </>
            ) : (
              <>
                <h3 className="text-xl font-bold text-black mb-2">
                  Aucune offre sauvegardée
                </h3>
                <p className="text-gray-600 mb-4">
                  Commencez à sauvegarder vos offres favorites depuis la page de recherche
                </p>
                <Button
                  onClick={() => window.location.href = '/jobs'}
                  className="bg-gradient-to-r from-[#00D9FF] to-[#00C4EA] hover:shadow-lg hover:shadow-[#00D9FF]/40 text-white transition-all duration-300"
                >
                  <Briefcase className="w-4 h-4 mr-2" />
                  Rechercher des offres
                </Button>
              </>
            )}
          </motion.div>
        ) : (
          <div className="divide-y divide-gray-200">
            <AnimatePresence mode="popLayout">
              {filteredJobs.map((job, index) => (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  transition={{ delay: index * 0.05 }}
                  className="p-6 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      {/* Job Title & Company */}
                      <div>
                        <h3 className="text-xl font-bold text-black mb-1">
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
                          <div className="flex items-center gap-1.5 text-[#00D9FF] font-medium">
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
                        className="whitespace-nowrap bg-gradient-to-r from-[#00D9FF] to-[#00C4EA] hover:shadow-lg hover:shadow-[#00D9FF]/40 text-white transition-all duration-300"
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
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      {/* Info Banner */}
      <AnimatePresence>
        {!loading && filteredJobs.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ delay: 0.5 }}
            className="bg-[#00D9FF]/10 border-2 border-[#00D9FF]/30 rounded-2xl p-6"
          >
            <h3 className="font-bold text-black mb-2">
              💡 Astuce
            </h3>
            <p className="text-gray-700 text-sm">
              Utilisez la barre de recherche pour retrouver rapidement une offre spécifique parmi vos favoris.
              Vos offres sauvegardées sont synchronisées sur tous vos appareils.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Coming Soon Features */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="bg-gray-50 border-2 border-gray-200 rounded-2xl p-6"
      >
        <h3 className="font-bold text-black mb-3">
          🚀 Prochainement
        </h3>
        <ul className="space-y-2 text-sm text-gray-700">
          <motion.li
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.7 }}
            className="flex items-start gap-2"
          >
            <span className="w-1.5 h-1.5 bg-[#00D9FF] rounded-full mt-1.5" />
            <span>Organisation par dossiers et étiquettes personnalisées</span>
          </motion.li>
          <motion.li
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.8 }}
            className="flex items-start gap-2"
          >
            <span className="w-1.5 h-1.5 bg-[#00D9FF] rounded-full mt-1.5" />
            <span>Alertes automatiques si une offre favorite expire</span>
          </motion.li>
          <motion.li
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.9 }}
            className="flex items-start gap-2"
          >
            <span className="w-1.5 h-1.5 bg-[#00D9FF] rounded-full mt-1.5" />
            <span>Exportation de vos favoris en PDF</span>
          </motion.li>
        </ul>
      </motion.div>
    </div>
  )
}
