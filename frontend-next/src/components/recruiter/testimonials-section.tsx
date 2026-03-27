"use client"

import { Star } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

interface Testimonial {
  name: string
  role: string
  company: string
  content: string
  avatar: string
}

const testimonials: Testimonial[] = [
  {
    name: "Sophie Martin",
    role: "Product Manager",
    company: "Datadog",
    content: "La consultation m'a permis d'identifier mes points faibles et de décrocher 3 entretiens en 2 semaines. Le recruteur connaît vraiment son métier !",
    avatar: "SM",
  },
  {
    name: "Thomas Dubois",
    role: "Développeur Full Stack",
    company: "Contentsquare",
    content: "J'étais bloqué dans ma recherche depuis 6 mois. Après cette consultation, j'ai revu mon CV et ma stratégie. J'ai signé un CDI 3 semaines plus tard.",
    avatar: "TD",
  },
  {
    name: "Julie Bernard",
    role: "UX Designer",
    company: "Alan",
    content: "Investissement qui vaut vraiment le coup ! Les conseils sont ultra personnalisés et le recruteur prend le temps de comprendre votre profil.",
    avatar: "JB",
  },
  {
    name: "Lucas Petit",
    role: "Data Scientist",
    company: "BlaBlaCar",
    content: "En 30 minutes, j'ai eu plus de conseils concrets que dans 6 mois de recherche solo. Mon CV est passé de 0 à 5 réponses en une semaine.",
    avatar: "LP",
  },
  {
    name: "Emma Rousseau",
    role: "Marketing Manager",
    company: "Qonto",
    content: "Le recruteur a su cerner exactement ce que je cherchais et m'a donné des conseils sur-mesure. J'ai décroché le job de mes rêves 3 semaines après !",
    avatar: "ER",
  },
  {
    name: "Antoine Moreau",
    role: "DevOps Engineer",
    company: "OVHcloud",
    content: "Très pro et à l'écoute. Il a identifié en 5 minutes ce qui bloquait mes candidatures. Je recommande à tous ceux qui se sentent bloqués.",
    avatar: "AM",
  },
]

function chunkArray<T>(array: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size))
  }
  return result
}

export function TestimonialsSection() {
  const chunks = chunkArray(testimonials, Math.ceil(testimonials.length / 3))

  return (
    <section className="mb-16">
      <div className="text-center mb-10">
        <p className="text-sm font-semibold text-[#00D9FF] uppercase tracking-wider mb-2">
          Témoignages
        </p>
        <h2 className="text-3xl font-bold text-gray-900">Ce que disent nos candidats</h2>
        <div className="flex items-center justify-center gap-1 mt-3">
          {[...Array(5)].map((_, i) => (
            <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
          ))}
          <span className="ml-2 text-sm text-gray-500 font-medium">4.9/5 · 127 avis</span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {chunks.map((chunk, chunkIndex) => (
          <div key={chunkIndex} className="space-y-4">
            {chunk.map((testimonial, index) => (
              <Card
                key={index}
                className="border border-gray-100 shadow-sm hover:shadow-md hover:border-turquoise-100 transition-all duration-300"
              >
                <CardContent className="pt-5 pb-5">
                  <div className="flex gap-1 mb-3">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <blockquote className="text-gray-600 text-sm leading-relaxed mb-4">
                    &ldquo;{testimonial.content}&rdquo;
                  </blockquote>
                  <div className="flex items-center gap-3">
                    <Avatar className="size-9">
                      <AvatarFallback className="bg-turquoise-50 text-[#00D9FF] font-semibold text-xs">
                        {testimonial.avatar}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{testimonial.name}</p>
                      <p className="text-xs text-gray-500">
                        {testimonial.role} · {testimonial.company}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
