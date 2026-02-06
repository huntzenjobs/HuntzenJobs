'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Sparkles, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [verifying, setVerifying] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const sessionId = searchParams.get('session_id')

    if (!sessionId) {
      setError('Session de paiement invalide')
      setVerifying(false)
      return
    }

    // Wait for webhook to process, then reload user context
    const timer = setTimeout(() => {
      setVerifying(false)
      // Force page reload to refresh auth context and subscription
      // This ensures the user immediately sees their new plan
      router.refresh()
    }, 2000)

    return () => clearTimeout(timer)
  }, [searchParams, router])

  if (verifying) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-violet-50/30 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="w-16 h-16 text-violet-600 animate-spin mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Vérification du paiement...</h2>
          <p className="text-gray-600">Veuillez patienter quelques instants</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-red-50/30 to-orange-50/30 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 text-center">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">❌</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Erreur</h1>
          <p className="text-gray-600 mb-8">{error}</p>
          <Link href="/pricing">
            <Button className="w-full h-12 text-lg font-semibold">
              Retour à la page Tarifs
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-violet-50/30 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* Success Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-12 text-center relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute top-10 right-10 w-64 h-64 bg-violet-500 rounded-full blur-3xl"></div>
            <div className="absolute bottom-10 left-10 w-48 h-48 bg-blue-500 rounded-full blur-3xl"></div>
          </div>

          <div className="relative z-10">
            {/* Success Icon */}
            <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-green-400 to-green-600 rounded-full mb-6 shadow-2xl shadow-green-200 animate-in zoom-in duration-500">
              <CheckCircle2 className="w-12 h-12 text-white" strokeWidth={3} />
            </div>

            {/* Confetti effect */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 text-4xl animate-in fade-in slide-in-from-top-10 duration-700">
              🎉
            </div>

            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              Paiement réussi !
            </h1>

            <p className="text-xl text-gray-600 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
              Bienvenue dans votre nouvel abonnement HuntZen 🚀
            </p>

            {/* Success message */}
            <div className="bg-gradient-to-br from-violet-50 to-blue-50 rounded-2xl p-6 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
              <div className="flex items-center gap-3 text-left">
                <Sparkles className="w-6 h-6 text-violet-600 flex-shrink-0" />
                <p className="text-gray-700 leading-relaxed">
                  Votre abonnement est maintenant actif ! Vous avez accès à toutes les fonctionnalités premium de votre plan.
                </p>
              </div>
            </div>

            {/* Benefits list */}
            <div className="text-left mb-8 space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <span className="text-gray-700">Recherches d'offres illimitées</span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <span className="text-gray-700">Analyses de CV illimitées avec IA</span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <span className="text-gray-700">Coach IA disponible 24/7</span>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-400">
              <Link href="/jobs" className="flex-1">
                <Button className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all">
                  Commencer la recherche
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link href="/profile" className="flex-1">
                <Button variant="outline" className="w-full h-14 text-lg font-semibold border-2 hover:bg-gray-50">
                  Voir mon profil
                </Button>
              </Link>
            </div>

            {/* Email confirmation notice */}
            <p className="text-sm text-gray-500 mt-8">
              Un email de confirmation vous a été envoyé avec les détails de votre abonnement.
            </p>
          </div>
        </div>

        {/* Support link */}
        <p className="text-center text-sm text-gray-600 mt-6">
          Une question ?{' '}
          <Link href="/help" className="text-violet-600 hover:text-violet-700 font-medium underline">
            Contactez notre support
          </Link>
        </p>
      </div>
    </div>
  )
}
