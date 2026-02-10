'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Sparkles, ArrowRight, Loader2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/auth-context'

type VerificationStatus = 'polling' | 'success' | 'timeout' | 'error'

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { session } = useAuth()

  const [status, setStatus] = useState<VerificationStatus>('polling')
  const [message, setMessage] = useState('Vérification de votre paiement...')
  const [pollingAttempts, setPollingAttempts] = useState(0)

  useEffect(() => {
    const sessionId = searchParams.get('session_id')

    if (!sessionId) {
      setStatus('error')
      setMessage('Session de paiement invalide')
      return
    }

    if (!session?.access_token) {
      setMessage('En attente de l\'authentification...')
      return
    }

    // Polling avec retry intelligent au lieu de wait fixe 2s
    // Check toutes les 1s pendant max 20s pour détecter changement abonnement (webhooks Stripe peuvent être lents)
    const MAX_ATTEMPTS = 20
    const POLL_INTERVAL = 1000 // 1 seconde

    let currentAttempt = 0
    let pollingInterval: NodeJS.Timeout

    const checkSubscriptionStatus = async () => {
      try {
        currentAttempt++
        setPollingAttempts(currentAttempt)
        setMessage(`Vérification en cours (tentative ${currentAttempt}/${MAX_ATTEMPTS})...`)

        // Call /api/subscription/current pour fresh data sans cache
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/subscription/current`,
          {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json'
            }
          }
        )

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const data = await response.json()
        const planName = data.subscription?.plan_name

        // Si plan détecté et != free, abonnement créé!
        if (planName && planName !== 'free') {
          console.log(`[PaymentSuccess] Upgrade détecté vers plan: ${planName}`)

          // Clear polling
          if (pollingInterval) clearInterval(pollingInterval)

          // Force cache sync
          await fetch(
            `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/subscription/sync-cache`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json'
              }
            }
          )

          // Clear frontend cache
          localStorage.removeItem('huntzen_subscription_cache')
          localStorage.removeItem('huntzen_subscription_cache_expiry')

          // Dispatch event pour invalidation cache
          window.dispatchEvent(new CustomEvent('subscription-changed'))

          setStatus('success')
          setMessage('Abonnement activé avec succès!')

          // Redirect to profile after 3s
          setTimeout(() => {
            router.push('/profile')
          }, 3000)

          return true // Success
        }

        // Si timeout (10 tentatives), fallback vers sync quand même
        if (currentAttempt >= MAX_ATTEMPTS) {
          console.warn('[PaymentSuccess] Timeout atteint, fallback vers sync')

          if (pollingInterval) clearInterval(pollingInterval)

          // Call sync même si timeout (webhook peut avoir été lent)
          await fetch(
            `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/subscription/sync-cache`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json'
              }
            }
          )

          // Dispatch event quand même
          window.dispatchEvent(new CustomEvent('subscription-changed'))

          setStatus('timeout')
          setMessage('Délai dépassé. Votre abonnement sera visible dans quelques instants.')

          // Redirect to profile after 5s
          setTimeout(() => {
            router.push('/profile')
          }, 5000)

          return false // Timeout
        }

        return false // Continue polling

      } catch (error) {
        console.error('[PaymentSuccess] Polling error:', error)

        if (currentAttempt >= MAX_ATTEMPTS) {
          if (pollingInterval) clearInterval(pollingInterval)
          setStatus('error')
          setMessage('Erreur lors de la vérification. Votre abonnement sera visible dans votre profil.')
        }

        return false
      }
    }

    // Initial check immédiat
    checkSubscriptionStatus()

    // Setup polling interval
    pollingInterval = setInterval(checkSubscriptionStatus, POLL_INTERVAL)

    // Cleanup
    return () => {
      if (pollingInterval) clearInterval(pollingInterval)
    }
  }, [searchParams, router, session?.access_token])

  // Polling state
  if (status === 'polling') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-violet-50/30 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <Loader2 className="w-16 h-16 text-violet-600 animate-spin mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{message}</h2>
          <p className="text-gray-600 text-sm">
            Webhook Stripe en cours de traitement...
          </p>
          {pollingAttempts > 0 && (
            <div className="mt-4 w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-violet-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(pollingAttempts / 10) * 100}%` }}
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  // Timeout state
  if (status === 'timeout') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-orange-50/30 to-yellow-50/30 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 text-center">
          <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Loader2 className="w-10 h-10 text-orange-600 animate-spin" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Traitement en cours</h1>
          <p className="text-gray-600 mb-4">{message}</p>
          <p className="text-sm text-gray-500 mb-8">
            Le webhook Stripe prend plus de temps que prévu. Votre abonnement sera visible dans votre profil dans quelques instants.
          </p>
          <Button
            onClick={() => router.push('/profile')}
            className="w-full h-12 text-lg font-semibold"
          >
            Aller au profil
          </Button>
        </div>
      </div>
    )
  }

  // Error state
  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-red-50/30 to-orange-50/30 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 text-center">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-10 h-10 text-red-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Erreur de vérification</h1>
          <p className="text-gray-600 mb-8">{message}</p>
          <div className="space-y-3">
            <Button
              onClick={() => router.push('/profile')}
              className="w-full h-12 text-lg font-semibold"
            >
              Voir mon profil
            </Button>
            <Link href="/pricing">
              <Button variant="outline" className="w-full h-12 text-lg font-semibold">
                Retour à la page Tarifs
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Success state
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
