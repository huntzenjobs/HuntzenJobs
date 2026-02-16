'use client'

import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Star } from 'lucide-react'

export function HeroSection() {
  return (
    <section className="relative overflow-hidden mb-12 rounded-3xl">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-huntzen-blue via-blue-600 to-huntzen-turquoise">
        {/* Pattern overlay */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }} />
      </div>

      {/* Content */}
      <div className="relative container max-w-4xl mx-auto px-6 py-20 text-white">
        <Badge className="mb-4 bg-white/20 text-white border-white/30 hover:bg-white/30">
          ✨ Accélérez votre recherche d'emploi
        </Badge>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-5xl md:text-6xl font-black mb-6 leading-tight"
        >
          Parlez directement avec un recruteur expert
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-xl text-white/90 max-w-2xl mb-8"
        >
          30 minutes de conseil personnalisé pour booster votre candidature et décrocher le job de vos rêves
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col sm:flex-row gap-4"
        >
          <Button
            size="lg"
            className="h-14 px-8 bg-white text-huntzen-blue font-semibold hover:bg-gray-100 shadow-xl"
            onClick={() => {
              const formSection = document.getElementById('contact-form')
              formSection?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
          >
            Réserver ma consultation →
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-14 px-8 border-2 border-white text-white bg-transparent hover:bg-white/10 hover:text-white"
          >
            <Star className="w-5 h-5 mr-2 fill-yellow-400 text-yellow-400" />
            Voir les avis (127) · 4.9/5
          </Button>
        </motion.div>
      </div>
    </section>
  )
}
