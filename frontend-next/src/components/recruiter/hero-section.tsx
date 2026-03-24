'use client'

import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Star, Users, TrendingUp, Clock } from 'lucide-react'
import { useTranslations } from 'next-intl'

export function HeroSection() {
  const t = useTranslations('dashboard.recruiterContact')

  return (
    <section className="mb-12">
      <div className="bg-gradient-to-br from-white to-slate-50 rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="grid lg:grid-cols-2 gap-0">
          {/* Left — Content */}
          <div className="p-8 lg:p-10 flex flex-col justify-center">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5"
            >
              <Badge className="bg-[#00D9FF]/10 text-[#0099bb] border-[#00D9FF]/30 hover:bg-[#00D9FF]/20 font-medium">
                {t('hero.badge')}
              </Badge>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="text-4xl md:text-5xl font-black text-slate-900 leading-tight mb-4"
            >
              {t('hero.heading1')}{' '}
              <span className="bg-gradient-to-r from-[#00D9FF] to-[#00C4EA] bg-clip-text text-transparent">
                {t('hero.headingAccent')}
              </span>{' '}
              {t('hero.heading2')}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-slate-500 text-lg leading-relaxed mb-8 max-w-md"
            >
              {t('hero.subtitle')}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="flex flex-col sm:flex-row gap-3"
            >
              <Button
                size="lg"
                className="h-12 px-8 bg-gradient-to-r from-[#00D9FF] to-[#00C4EA] hover:shadow-lg hover:shadow-[#00D9FF]/30 text-white font-semibold transition-all duration-300"
                onClick={() => {
                  document.getElementById('contact-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
              >
                {t('hero.cta')}
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 px-6 border-slate-200 text-slate-600 hover:border-[#00D9FF] hover:text-[#00D9FF] transition-all"
              >
                <Star className="w-4 h-4 mr-2 fill-yellow-400 text-yellow-400" />
                {t('hero.reviews')}
              </Button>
            </motion.div>
          </div>

          {/* Right — Stats cards */}
          <div className="hidden lg:flex flex-col justify-center gap-3 p-8 lg:p-10 bg-gradient-to-br from-slate-50/50 to-white border-l border-slate-100">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="flex items-center gap-4 bg-white rounded-xl p-4 border border-slate-100 shadow-sm"
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#00D9FF] to-[#00C4EA] flex items-center justify-center shadow-lg shadow-[#00D9FF]/20 shrink-0">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-black text-slate-900 text-lg leading-none">127</p>
                <p className="text-xs text-slate-500 mt-0.5">{t('hero.stat1Sub')}</p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.28 }}
              className="flex items-center gap-4 bg-white rounded-xl p-4 border border-slate-100 shadow-sm"
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-400/20 shrink-0">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-black text-slate-900 text-lg leading-none">87%</p>
                <p className="text-xs text-slate-500 mt-0.5">{t('hero.stat2Sub')}</p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.36 }}
              className="flex items-center gap-4 bg-white rounded-xl p-4 border border-slate-100 shadow-sm"
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-orange-400 flex items-center justify-center shadow-lg shadow-amber-400/20 shrink-0">
                <Star className="w-5 h-5 text-white fill-white" />
              </div>
              <div>
                <p className="font-black text-slate-900 text-lg leading-none">4.9/5</p>
                <p className="text-xs text-slate-500 mt-0.5">{t('hero.stat3Sub')}</p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.44 }}
              className="flex items-center gap-4 bg-white rounded-xl p-4 border border-slate-100 shadow-sm"
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center shadow-lg shadow-violet-400/20 shrink-0">
                <Clock className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-black text-slate-900 text-lg leading-none">48h</p>
                <p className="text-xs text-slate-500 mt-0.5">{t('hero.stat4Sub')}</p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  )
}
