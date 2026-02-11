'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Sparkles, TrendingUp, Shield, Zap, User } from 'lucide-react'
import { useOptionalAuth } from '@/contexts/auth-context'

interface AuthLayoutProps {
  children: React.ReactNode
  type: 'login' | 'signup'
}

const features = [
  {
    icon: <Sparkles className="w-5 h-5" />,
    title: 'Analyse CV experte',
    description: 'Optimisez votre CV selon les standards ATS et du marché'
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
    text: "J'ai trouvé mon emploi de rêve en 3 semaines grâce à HuntZen !",
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
  const auth = useOptionalAuth()
  const user = auth?.user

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2">
              <span className="text-white font-bold text-xl tracking-tight">HuntZen</span>
              <span className="w-2 h-2 rounded-full bg-[#00D9FF] animate-pulse"></span>
            </Link>

            {/* Right side */}
            <div className="flex items-center gap-4">
              {user ? (
                <Link href="/jobs">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
                    <div className="w-7 h-7 rounded-full bg-[#00D9FF]/20 flex items-center justify-center">
                      <User className="w-4 h-4 text-[#00D9FF]" />
                    </div>
                    <span className="text-sm font-medium text-white hidden sm:inline">
                      {user.user_metadata?.full_name || user.email?.split('@')[0]}
                    </span>
                  </div>
                </Link>
              ) : (
                <>
                  <span className="text-sm text-white/70 hidden sm:inline">
                    {type === 'login' ? "Pas encore de compte ?" : "Déjà inscrit ?"}
                  </span>
                  <Link
                    href={type === 'login' ? '/signup' : '/login'}
                    className="px-4 py-2 text-sm font-semibold text-white hover:text-[#00D9FF] transition-colors"
                  >
                    {type === 'login' ? "S'inscrire" : "Se connecter"}
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="pt-16 min-h-screen flex">
        {/* Left Side - Form */}
        <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 py-12 bg-white">
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
        <div className="hidden lg:flex lg:flex-1 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 relative overflow-hidden">
          {/* Animated background pattern */}
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%2300D9FF\' fill-opacity=\'0.15\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
              backgroundSize: '60px 60px'
            }}
          />

          {/* Animated background orbs */}
          <motion.div
            className="absolute top-1/4 right-1/4 w-96 h-96 bg-[#00D9FF]/10 rounded-full blur-3xl"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.1, 0.15, 0.1]
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
          <motion.div
            className="absolute bottom-1/4 left-1/4 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl"
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.08, 0.12, 0.08]
            }}
            transition={{
              duration: 10,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 1
            }}
          />

          {/* Content */}
          <div className="relative z-10 flex flex-col justify-center px-12 py-12 text-white">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <h2 className="text-4xl font-black mb-4">
                Votre carrière mérite le meilleur
              </h2>
              <p className="text-white/80 text-lg mb-12 leading-relaxed">
                Rejoignez +100 000 candidats qui ont transformé leur recherche d'emploi avec HuntZen.
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
                    <div className="flex-shrink-0 w-10 h-10 bg-[#00D9FF]/10 backdrop-blur-sm rounded-lg flex items-center justify-center text-[#00D9FF]">
                      {feature.icon}
                    </div>
                    <div>
                      <h3 className="font-bold mb-1">{feature.title}</h3>
                      <p className="text-sm text-white/70">{feature.description}</p>
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
                  <div className="text-3xl font-black text-[#00D9FF]">+100K</div>
                  <div className="text-sm text-white/70">Candidats accompagnés</div>
                </div>
                <div>
                  <div className="text-3xl font-black text-[#00D9FF]">87%</div>
                  <div className="text-sm text-white/70">Taux de réponse</div>
                </div>
                <div>
                  <div className="text-3xl font-black text-[#00D9FF]">24/7</div>
                  <div className="text-sm text-white/70">Support</div>
                </div>
              </motion.div>

              {/* Testimonial */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 1 }}
                className="mt-12 bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10"
              >
                <div className="flex items-start gap-1 mb-4">
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
                <p className="text-white mb-4 italic leading-relaxed">
                  &ldquo;{testimonials[0].text}&rdquo;
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#00D9FF]/20 flex items-center justify-center text-sm font-bold text-[#00D9FF]">
                    {testimonials[0].author[0]}
                  </div>
                  <div>
                    <div className="font-bold">{testimonials[0].author}</div>
                    <div className="text-sm text-white/70">{testimonials[0].role}</div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap');

        body {
          font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
      `}</style>
    </div>
  )
}
