'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, Star, Quote } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Testimonial {
  name: string
  role: string
  company: string
  content: string
  rating: 5
  avatar: string
}

const testimonials: Testimonial[] = [
  {
    name: "Sophie Martin",
    role: "Product Manager",
    company: "Datadog",
    content: "La consultation m'a permis d'identifier mes points faibles et de décrocher 3 entretiens en 2 semaines. Le recruteur connaît vraiment son métier !",
    rating: 5,
    avatar: "SM"
  },
  {
    name: "Thomas Dubois",
    role: "Développeur Full Stack",
    company: "Contentsquare",
    content: "J'étais bloqué dans ma recherche depuis 6 mois. Après cette consultation, j'ai revu mon CV et ma stratégie. J'ai signé un CDI 3 semaines plus tard.",
    rating: 5,
    avatar: "TD"
  },
  {
    name: "Julie Bernard",
    role: "UX Designer",
    company: "Alan",
    content: "Investissement qui vaut vraiment le coup ! Les conseils sont ultra personnalisés et le recruteur prend le temps de comprendre votre profil.",
    rating: 5,
    avatar: "JB"
  }
]

export function TestimonialsSection() {
  const [current, setCurrent] = useState(0)

  return (
    <section className="mb-16 bg-gradient-to-br from-blue-50 to-cyan-50 py-16 px-6 rounded-3xl">
      <h2 className="text-3xl font-bold text-center mb-12">
        Ce que disent nos candidats
      </h2>

      <div className="max-w-3xl mx-auto relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="bg-white p-8 rounded-2xl shadow-xl"
          >
            <Quote className="w-12 h-12 text-huntzen-blue/20 mb-4" />

            <div className="flex gap-1 mb-4">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
              ))}
            </div>

            <p className="text-lg text-gray-700 mb-6 italic">
              "{testimonials[current].content}"
            </p>

            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-huntzen-blue to-blue-600 flex items-center justify-center text-white font-bold">
                {testimonials[current].avatar}
              </div>
              <div>
                <div className="font-bold">{testimonials[current].name}</div>
                <div className="text-sm text-gray-600">
                  {testimonials[current].role} · {testimonials[current].company}
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Navigation arrows */}
        <div className="flex justify-center gap-4 mt-8">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrent((current - 1 + testimonials.length) % testimonials.length)}
            className="rounded-full"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrent((current + 1) % testimonials.length)}
            className="rounded-full"
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </section>
  )
}
