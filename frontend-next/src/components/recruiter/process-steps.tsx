'use client'

import { FileText, Shield, Calendar, Video } from 'lucide-react'

const steps = [
  { num: 1, title: "Formulaire", desc: "Remplissez en 2 min", icon: FileText },
  { num: 2, title: "Paiement", desc: "Sécurisé · 50€ unique", icon: Shield },
  { num: 3, title: "Planification", desc: "Sous 48h ouvrées", icon: Calendar },
  { num: 4, title: "Consultation", desc: "30 min avec expert", icon: Video },
]

export function ProcessSteps() {
  return (
    <section className="mb-16">
      <div className="text-center mb-10">
        <p className="text-sm font-semibold text-[#00D9FF] uppercase tracking-wider mb-2">
          Processus
        </p>
        <h2 className="text-3xl font-bold text-gray-900">Comment ça marche ?</h2>
      </div>

      <div className="relative">
        {/* Connector line */}
        <div className="hidden md:block absolute top-8 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-turquoise-200 via-\[#00D9FF\] to-turquoise-200" />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {steps.map((step) => (
            <div key={step.num} className="relative flex flex-col items-center text-center">
              {/* Icon box */}
              <div className="relative mb-4 z-10">
                <div className="w-16 h-16 rounded-2xl bg-white border-2 border-turquoise-100 flex items-center justify-center shadow-sm">
                  <step.icon className="w-7 h-7 text-[#00D9FF]" />
                </div>
                <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gradient-to-br from-[#00D9FF] to-[#00C4EA] text-white font-bold flex items-center justify-center text-xs shadow-glow-turquoise">
                  {step.num}
                </div>
              </div>
              <h3 className="font-bold text-gray-900 mb-1">{step.title}</h3>
              <p className="text-sm text-gray-500">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
