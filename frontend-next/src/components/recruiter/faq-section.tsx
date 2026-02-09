'use client'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { HelpCircle } from 'lucide-react'

const faqs = [
  {
    q: "Comment se déroule la consultation ?",
    a: "La consultation se fait en visioconférence (Zoom/Google Meet) pendant 30 minutes. Le recruteur analyse votre CV, votre profil LinkedIn, et vous donne des conseils personnalisés sur votre stratégie de recherche."
  },
  {
    q: "Qui sont les recruteurs ?",
    a: "Nos recruteurs sont des professionnels certifiés avec 5+ ans d'expérience dans le recrutement tech. Ils ont placé des centaines de candidats dans des entreprises comme Google, Meta, Datadog, etc."
  },
  {
    q: "Combien de temps pour avoir un créneau ?",
    a: "En général, nous trouvons un créneau sous 48h. Les créneaux sont disponibles du lundi au vendredi de 9h à 19h, et le samedi matin."
  },
  {
    q: "Y a-t-il un suivi après la consultation ?",
    a: "Oui ! Vous recevez un compte-rendu détaillé par email dans les 24h, avec tous les conseils discutés et des ressources complémentaires."
  }
]

export function FAQSection() {
  return (
    <section className="mb-16">
      <div className="text-center mb-12">
        <HelpCircle className="w-12 h-12 text-huntzen-blue mx-auto mb-4" />
        <h2 className="text-3xl font-bold">Questions fréquentes</h2>
      </div>

      <div className="max-w-3xl mx-auto">
        <Accordion type="single" collapsible className="space-y-4">
          {faqs.map((faq, idx) => (
            <AccordionItem
              key={idx}
              value={`item-${idx}`}
              className="bg-white border-2 border-gray-200 rounded-xl px-6 data-[state=open]:border-huntzen-blue"
            >
              <AccordionTrigger className="text-left font-semibold hover:text-huntzen-blue">
                {faq.q}
              </AccordionTrigger>
              <AccordionContent className="text-gray-700">
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}
