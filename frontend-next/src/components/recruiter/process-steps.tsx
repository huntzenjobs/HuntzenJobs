'use client'

import { motion } from 'framer-motion'
import { FileText, Shield, Calendar, Video } from 'lucide-react'

const steps = [
  { num: 1, title: "Formulaire", desc: "Remplissez en 2 min", icon: FileText },
  { num: 2, title: "Paiement", desc: "Sécurisé (50€)", icon: Shield },
  { num: 3, title: "Planification", desc: "Sous 48h", icon: Calendar },
  { num: 4, title: "Consultation", desc: "30 min avec expert", icon: Video }
]

export function ProcessSteps() {
  return (
    <section className="mb-16">
      <h2 className="text-3xl font-bold text-center mb-12">Comment ça marche ?</h2>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        {steps.map((step, idx) => (
          <motion.div
            key={step.num}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="relative text-center"
          >
            {/* Connector line */}
            {idx < steps.length - 1 && (
              <div className="hidden md:block absolute top-12 left-[60%] w-[80%] h-0.5 bg-gradient-to-r from-huntzen-blue to-transparent" />
            )}

            {/* Icon circle */}
            <div className="relative w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-to-br from-huntzen-blue to-blue-600 flex items-center justify-center shadow-lg">
              <step.icon className="w-10 h-10 text-white" />
              <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-huntzen-turquoise text-white font-bold flex items-center justify-center text-sm">
                {step.num}
              </div>
            </div>

            <h3 className="font-bold text-lg mb-1">{step.title}</h3>
            <p className="text-sm text-gray-600">{step.desc}</p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
