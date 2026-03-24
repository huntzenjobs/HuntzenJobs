'use client'

import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Star, Users, TrendingUp } from 'lucide-react'

export function HeroSection() {
  return (
    <section className="relative overflow-hidden mb-12 rounded-3xl bg-white border border-gray-100">
      {/* Ocean ambient glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-huntzen-turquoise/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-12 -left-12 w-64 h-64 bg-ocean-500/5 rounded-full blur-2xl" />
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2300d4aa' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}
        />
      </div>

      <div className="relative container max-w-5xl mx-auto px-6 py-16">
        <div className="max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <Badge className="bg-turquoise-50 text-turquoise-700 border-turquoise-200 hover:bg-turquoise-100">
              ✨ Session individuelle · Prise en charge sous 48h
            </Badge>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="text-5xl md:text-6xl font-black mb-6 leading-tight text-gray-900"
          >
            Parlez directement avec{' '}
            <span className="text-huntzen-turquoise">un recruteur</span>{' '}
            expert
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl text-gray-500 max-w-xl mb-8 leading-relaxed"
          >
            30 minutes de conseil personnalisé pour booster votre candidature et décrocher le job de vos rêves.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col sm:flex-row gap-4"
          >
            <Button
              size="lg"
              className="h-14 px-8 bg-huntzen-turquoise hover:bg-huntzen-turquoise-dark text-white font-semibold shadow-glow-turquoise transition-all duration-300"
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
              className="h-14 px-8 border-2 border-gray-200 text-gray-700 hover:border-huntzen-turquoise hover:text-huntzen-turquoise transition-all"
            >
              <Star className="w-4 h-4 mr-2 fill-yellow-400 text-yellow-400" />
              4.9/5 · 127 avis
            </Button>
          </motion.div>
        </div>

        {/* Floating social proof cards — desktop only */}
        <motion.div
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="hidden lg:flex flex-col gap-3 absolute right-8 top-1/2 -translate-y-1/2"
        >
          <div className="bg-white rounded-2xl p-4 shadow-md border border-gray-100 flex items-center gap-3 w-56">
            <div className="w-10 h-10 rounded-xl bg-turquoise-50 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-huntzen-turquoise" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">127 candidats</p>
              <p className="text-xs text-gray-500">consultations réalisées</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-md border border-gray-100 flex items-center gap-3 w-56">
            <div className="w-10 h-10 rounded-xl bg-gold-400/10 flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5 text-gold-500" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">87% de réussite</p>
              <p className="text-xs text-gray-500">trouvent un poste en 30j</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-md border border-gray-100 flex items-center gap-3 w-56">
            <div className="w-10 h-10 rounded-xl bg-ocean-50 flex items-center justify-center shrink-0">
              <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">4.9 / 5</p>
              <p className="text-xs text-gray-500">satisfaction client</p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
