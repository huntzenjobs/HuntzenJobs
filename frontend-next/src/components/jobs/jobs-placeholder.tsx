'use client'

import { motion } from 'framer-motion'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, CheckCircle, Sparkles, BarChart3, Globe, Zap } from 'lucide-react'

interface JobsPlaceholderProps {
  onSearchClick?: (jobTitle: string) => void
}

export function JobsPlaceholder({ onSearchClick }: JobsPlaceholderProps) {
  const popularSearches = [
    'Développeur Full Stack',
    'Product Manager',
    'Data Scientist',
    'DevOps Engineer',
    'UX Designer',
    'Business Developer',
    'Growth Hacker',
    'Backend Developer'
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-12 py-8"
    >
      {/* Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="text-center p-8 border-2 border-huntzen-blue/30 hover:border-huntzen-blue transition-all hover:shadow-xl">
          <BarChart3 className="w-12 h-12 text-huntzen-blue mx-auto mb-4" />
          <div className="text-5xl font-black text-huntzen-blue mb-2">
            10K+
          </div>
          <p className="text-gray-600 font-medium">Offres d'emploi agrégées</p>
          <Badge className="mt-3 bg-blue-50 text-huntzen-blue border-0">
            Mise à jour 24h/24
          </Badge>
        </Card>

        <Card className="text-center p-8 border-2 border-huntzen-turquoise/30 hover:border-huntzen-turquoise transition-all hover:shadow-xl">
          <Globe className="w-12 h-12 text-huntzen-turquoise mx-auto mb-4" />
          <div className="text-5xl font-black text-huntzen-turquoise mb-2">
            15+
          </div>
          <p className="text-gray-600 font-medium">Sources d'emploi partenaires</p>
          <Badge className="mt-3 bg-cyan-50 text-huntzen-turquoise border-0">
            LinkedIn, Indeed, APEC...
          </Badge>
        </Card>

        <Card className="text-center p-8 border-2 border-blue-500/30 hover:border-blue-500 transition-all hover:shadow-xl">
          <Zap className="w-12 h-12 text-blue-500 mx-auto mb-4" />
          <div className="text-5xl font-black text-blue-500 mb-2">
            24h
          </div>
          <p className="text-gray-600 font-medium">Délai de mise à jour max</p>
          <Badge className="mt-3 bg-blue-50 text-blue-500 border-0">
            Nouvelles offres quotidiennes
          </Badge>
        </Card>
      </div>

      {/* Recherches populaires */}
      <div>
        <h3 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-huntzen-blue" />
          Recherches populaires en ce moment
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {popularSearches.map((job) => (
            <Button
              key={job}
              variant="outline"
              className="h-auto py-3 px-4 text-left justify-start border-2 border-gray-200 hover:border-huntzen-blue hover:text-huntzen-blue hover:bg-blue-50 transition-all"
              onClick={() => onSearchClick?.(job)}
            >
              <span className="font-medium text-sm">{job}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Tips visuels */}
      <Card className="p-8 bg-gradient-to-br from-blue-50 via-cyan-50 to-blue-50 border-2 border-huntzen-blue/30">
        <h3 className="font-bold text-xl mb-6 flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-huntzen-blue" />
          Conseils pour une recherche efficace
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-huntzen-blue flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-gray-900 mb-1">
                Soyez spécifique
              </div>
              <p className="text-sm text-gray-600">
                Utilisez des mots-clés précis comme "React" au lieu de "développeur"
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-huntzen-blue flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-gray-900 mb-1">
                Élargissez votre zone
              </div>
              <p className="text-sm text-gray-600">
                Laissez la ville vide pour chercher dans toute la France
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-huntzen-blue flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-gray-900 mb-1">
                Utilisez les filtres
              </div>
              <p className="text-sm text-gray-600">
                Type de contrat et pays pour affiner vos résultats
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-huntzen-blue flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-gray-900 mb-1">
                Revenez régulièrement
              </div>
              <p className="text-sm text-gray-600">
                Nos résultats sont mis à jour toutes les 24 heures
              </p>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  )
}
