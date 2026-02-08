'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Sparkles, CheckCircle2, TrendingUp, Shield, Zap } from 'lucide-react'

interface AuthLayoutProps {
  children: React.ReactNode
  type: 'login' | 'signup'
}

const features = [
  {
    icon: <Sparkles className="w-5 h-5" />,
    title: 'Analyse CV Intelligente',
    description: 'IA avancée pour optimiser votre CV selon les standards ATS'
  },
  {
    icon: <TrendingUp className="w-5 h-5" />,
    title: 'Recherche d\'emploi ciblée',
    description: 'Trouvez les meilleures opportunités adaptées à votre profil'
  },
  {
    icon: <Shield className="w-5 h-5" />,
    title: 'Données sécurisées',
    description: 'Vos informations sont protégées et confidentielles'
  },
  {
    icon: <Zap className="w-5 h-5" />,
    title: 'Résultats instantanés',
    description: 'Analyses rapides et recommandations personnalisées'
  }
]

const testimonials = [
  {
    text: "J'ai trouvé mon emploi de rêve en 3 semaines grâce à HuntZen!",
    author: "Sarah M.",
    role: "Développeuse Full-Stack"
  },
  {
    text: "L'analyse CV m'a aidé à passer les filtres ATS pour la première fois.",
    author: "Thomas L.",
    role: "Chef de Projet"
  },
  {
    text: "Interface intuitive et résultats impressionnants.",
    author: "Marie K.",
    role: "UX Designer"
  }
]

export function AuthLayout({ children, type }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-lg">H</span>
              </div>
              <span className="text-xl font-bold text-gray-900">
                HuntZen
              </span>
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            </Link>

            {/* Right side */}
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                {type === 'login' ? "Pas encore de compte ?" : "Déjà inscrit ?"}
              </span>
              <Link
                href={type === 'login' ? '/signup' : '/login'}
                className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
              >
                {type === 'login' ? "S'inscrire" : "Se connecter"}
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="pt-16 min-h-screen flex">
        {/* Left Side - Form */}
        <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-md"
          >
            {children}
          </motion.div>
        </div>

        {/* Right Side - Visual Content */}
        <div className="hidden lg:flex lg:flex-1 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 relative overflow-hidden">
          {/* Animated background orbs */}
          <div className="absolute inset-0 opacity-20">
            <motion.div
              className="absolute top-1/4 -right-20 w-96 h-96 bg-white rounded-full blur-3xl"
              animate={{
                x: [0, 30, 0],
                y: [0, -30, 0],
              }}
              transition={{
                duration: 8,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
            <motion.div
              className="absolute bottom-1/4 -left-20 w-80 h-80 bg-purple-400 rounded-full blur-3xl"
              animate={{
                x: [0, -30, 0],
                y: [0, 30, 0],
              }}
              transition={{
                duration: 10,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
          </div>

          {/* Content */}
          <div className="relative z-10 flex flex-col justify-center px-12 py-12 text-white">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <h2 className="text-4xl font-bold mb-4">
                Votre carrière mérite le meilleur
              </h2>
              <p className="text-blue-100 text-lg mb-12">
                Rejoignez des milliers de professionnels qui ont transformé leur recherche d'emploi avec HuntZen.
              </p>

              {/* Features */}
              <div className="space-y-6 mb-12">
                {features.map((feature, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.3 + index * 0.1 }}
                    className="flex items-start gap-4"
                  >
                    <div className="flex-shrink-0 w-10 h-10 bg-white/10 backdrop-blur-sm rounded-lg flex items-center justify-center text-white">
                      {feature.icon}
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">{feature.title}</h3>
                      <p className="text-sm text-blue-100">{feature.description}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Stats */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.8 }}
                className="grid grid-cols-3 gap-6 pt-8 border-t border-white/20"
              >
                <div>
                  <div className="text-3xl font-bold">10K+</div>
                  <div className="text-sm text-blue-100">Utilisateurs actifs</div>
                </div>
                <div>
                  <div className="text-3xl font-bold">95%</div>
                  <div className="text-sm text-blue-100">Satisfaction</div>
                </div>
                <div>
                  <div className="text-3xl font-bold">24/7</div>
                  <div className="text-sm text-blue-100">Support</div>
                </div>
              </motion.div>

              {/* Testimonial */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 1 }}
                className="mt-12 bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20"
              >
                <div className="flex items-start gap-3 mb-4">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <svg
                      key={star}
                      className="w-5 h-5 text-yellow-400 fill-current"
                      viewBox="0 0 20 20"
                    >
                      <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                    </svg>
                  ))}
                </div>
                <p className="text-white mb-4 italic">
                  "{testimonials[0].text}"
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-sm font-semibold">
                    {testimonials[0].author[0]}
                  </div>
                  <div>
                    <div className="font-semibold">{testimonials[0].author}</div>
                    <div className="text-sm text-blue-100">{testimonials[0].role}</div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}
