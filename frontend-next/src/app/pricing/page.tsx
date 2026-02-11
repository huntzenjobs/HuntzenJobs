'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, X, Sparkles, Zap, Crown, ArrowLeft, Rocket, Star, TrendingUp, Users, Shield, Gift, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useOptionalAuth } from '@/contexts/auth-context'
import { useOptionalSubscription } from '@/contexts/subscription-context'
import { useSubscriptionApi } from '@/hooks/use-subscription-api'
import { toast } from 'sonner'

const plans = [
  {
    id: 'free',
    name: 'Gratuit',
    priceMonthly: '0',
    priceYearly: '0',
    period: '',
    description: 'Parfait pour découvrir HuntZen et ses fonctionnalités',
    icon: Gift,
    color: 'gray',
    gradient: 'from-gray-400 to-gray-500',
    features: [
      { name: '3 recherches d\'offres par jour', included: true },
      { name: '10 offres d\'emploi visibles maximum', included: true },
      { name: '1 analyse de CV par jour avec IA', included: true },
      { name: '5 minutes de coaching IA personnel', included: true },
      { name: 'Support standard', included: true },
      { name: 'Filtres avancés (salaire, télétravail, localisation)', included: false },
      { name: 'Gestion de vos favoris', included: false },
      { name: 'Score de compatibilité visuel', included: false },
      { name: 'Export PDF de vos rapports', included: false },
      { name: 'Simulations d\'entretien avec IA', included: false },
      { name: 'Historique de vos analyses', included: false },
      { name: 'Alertes email pour nouvelles offres', included: false },
    ],
  },
  {
    id: 'starter',
    name: 'Starter',
    priceMonthly: '8,90',
    priceYearly: '85,00',
    period: '/mois',
    description: 'Parfait pour démarrer votre recherche d\'emploi efficacement',
    icon: Zap,
    color: 'blue',
    gradient: 'from-blue-500 to-blue-600',
    features: [
      { name: 'Recherches d\'offres illimitées', included: true },
      { name: 'Accès à toutes les offres d\'emploi', included: true },
      { name: 'Filtres avancés (salaire, télétravail, localisation, date)', included: true },
      { name: 'Gestion de vos favoris', included: true },
      { name: 'Analyses de CV illimitées avec IA', included: true },
      { name: 'Score de compatibilité visuel et animé', included: true },
      { name: 'Coach IA personnel (30 min/jour)', included: true },
      { name: 'Export PDF de vos rapports d\'analyse', included: false },
      { name: 'Simulations d\'entretien avec IA', included: false },
      { name: 'Historique complet de vos analyses', included: false },
      { name: 'Conseils personnalisés par l\'IA', included: false },
      { name: 'Alertes email pour nouvelles offres', included: false },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    priceMonthly: '13,90',
    priceYearly: '133,00',
    period: '/mois',
    description: 'Le choix préféré des professionnels en quête d\'excellence',
    icon: Sparkles,
    color: 'violet',
    gradient: 'from-violet-500 to-purple-600',
    popular: true,
    features: [
      { name: 'Toutes les fonctionnalités Starter incluses', included: true },
      { name: 'Coach IA disponible 24/7 sans limite', included: true },
      { name: 'Export PDF professionnel de vos rapports', included: true },
      { name: 'Simulations d\'entretien réalistes avec IA', included: true },
      { name: 'Feedback détaillé sur vos performances', included: true },
      { name: 'Support prioritaire par email', included: true },
      { name: 'Historique complet de vos CV', included: false },
      { name: 'Conseils personnalisés avancés', included: false },
      { name: 'Alertes email intelligentes', included: false },
      { name: 'Historique de vos sessions coaching', included: false },
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    priceMonthly: '19,90',
    priceYearly: '191,00',
    period: '/mois',
    description: 'L\'expérience ultime pour maximiser vos chances de succès',
    icon: Crown,
    color: 'amber',
    gradient: 'from-amber-500 to-orange-500',
    features: [
      { name: 'Toutes les fonctionnalités Pro incluses', included: true },
      { name: 'Historique illimité de toutes vos analyses CV', included: true },
      { name: 'Conseils personnalisés ultra-ciblés par l\'IA', included: true },
      { name: 'Alertes email instantanées pour offres correspondantes', included: true },
      { name: 'Historique complet de vos sessions de coaching', included: true },
      { name: 'Accès anticipé aux nouvelles fonctionnalités', included: true },
      { name: 'Support VIP avec assistance prioritaire', included: true },
      { name: 'Rapports mensuels de progression', included: true },
      { name: 'Stratégie de recherche personnalisée', included: true },
    ],
  },
]

const comparisonFeatures = [
  {
    category: 'Recherche d\'emploi',
    features: [
      { name: 'Recherches quotidiennes', free: '3 max', starter: 'Illimitées', pro: 'Illimitées', premium: 'Illimitées' },
      { name: 'Offres d\'emploi visibles', free: '10 max', starter: 'Illimitées', pro: 'Illimitées', premium: 'Illimitées' },
      { name: 'Filtres avancés (salaire, remote, etc.)', free: false, starter: true, pro: true, premium: true },
      { name: 'Sauvegarde de favoris', free: false, starter: true, pro: true, premium: true },
      { name: 'Alertes email nouvelles offres', free: false, starter: false, pro: false, premium: true },
    ]
  },
  {
    category: 'Analyse de CV',
    features: [
      { name: 'Analyses de CV par jour', free: '1 max', starter: 'Illimitées', pro: 'Illimitées', premium: 'Illimitées' },
      { name: 'Score de compatibilité visuel', free: false, starter: true, pro: true, premium: true },
      { name: 'Export PDF des rapports', free: false, starter: false, pro: true, premium: true },
      { name: 'Historique des analyses', free: false, starter: false, pro: false, premium: true },
      { name: 'Conseils personnalisés IA', free: false, starter: false, pro: false, premium: true },
    ]
  },
  {
    category: 'Coaching IA',
    features: [
      { name: 'Temps de coaching quotidien', free: '5 min', starter: '30 min', pro: 'Illimité', premium: 'Illimité' },
      { name: 'Simulation d\'entretien', free: false, starter: false, pro: true, premium: true },
      { name: 'Historique des sessions', free: false, starter: false, pro: false, premium: true },
      { name: 'Stratégie personnalisée', free: false, starter: false, pro: false, premium: true },
    ]
  },
  {
    category: 'Support',
    features: [
      { name: 'Support client', free: 'Standard', starter: 'Standard', pro: 'Prioritaire', premium: 'VIP' },
      { name: 'Accès beta fonctionnalités', free: false, starter: false, pro: false, premium: true },
    ]
  },
]

const faqs = [
  {
    question: 'Puis-je changer de plan à tout moment ?',
    answer: 'Absolument ! Vous pouvez upgrader ou downgrader votre abonnement à tout moment depuis votre tableau de bord. Le changement prend effet immédiatement et nous calculons automatiquement le prorata pour que vous ne payiez que ce que vous utilisez.',
  },
  {
    question: 'Y a-t-il un engagement de durée ?',
    answer: 'Non, aucun engagement ! Tous nos abonnements sont mensuels et sans engagement. Vous êtes libre d\'annuler à tout moment et vous conserverez l\'accès à votre plan jusqu\'à la fin de votre période de facturation en cours.',
  },
  {
    question: 'Quelle est votre politique de remboursement ?',
    answer: 'Nous offrons une garantie satisfait ou remboursé de 14 jours sur tous nos plans. Si vous n\'êtes pas entièrement satisfait de HuntZen, contactez notre support et nous vous rembourserons intégralement, sans poser de questions.',
  },
  {
    question: 'Les prix incluent-ils la TVA ?',
    answer: 'Oui, tous les prix affichés sont TTC (Toutes Taxes Comprises) et incluent la TVA française applicable. Aucun frais supplémentaire ne sera ajouté lors du paiement.',
  },
  {
    question: 'Quels moyens de paiement acceptez-vous ?',
    answer: 'Nous acceptons toutes les cartes bancaires principales (Visa, Mastercard, American Express) via notre partenaire de paiement sécurisé Stripe. Vos informations de paiement sont cryptées et totalement sécurisées.',
  },
  {
    question: 'Puis-je essayer avant de m\'engager ?',
    answer: 'Oui ! Notre plan gratuit vous permet de découvrir HuntZen avec des fonctionnalités essentielles (3 recherches/jour, 1 analyse CV/jour, 5 min de coaching IA). Aucune carte bancaire n\'est requise pour commencer.',
  },
]

const testimonials = [
  {
    name: 'Marie L.',
    role: 'Chef de projet',
    content: 'J\'ai trouvé mon poste actuel en 3 semaines grâce à HuntZen Pro. L\'analyse CV et les simulations d\'entretien m\'ont vraiment aidée à me démarquer.',
    rating: 5,
  },
  {
    name: 'Thomas D.',
    role: 'Développeur Full Stack',
    content: 'Le coach IA est incroyable. Il m\'a aidé à optimiser mon CV et à préparer mes entretiens. Le plan Premium vaut vraiment son prix !',
    rating: 5,
  },
  {
    name: 'Sophie M.',
    role: 'Responsable Marketing',
    content: 'Les alertes email du plan Premium m\'ont permis de postuler en premier sur des offres qui correspondaient parfaitement à mon profil.',
    rating: 5,
  },
]

export default function PricingPage() {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly')
  const auth = useOptionalAuth()
  const user = auth?.user
  const subscription = useOptionalSubscription()

  // 🔥 FIX: Use useSubscriptionApi directly to get fresh data from backend
  const apiData = useSubscriptionApi()

  // Use API data as source of truth, fallback to context if API not loaded yet
  const currentPlan = apiData.subscription?.plan_name || subscription?.plan || 'free'

  // 🔍 DEBUG: Log subscription data to see what's happening
  console.log('[PRICING DEBUG] Subscription data:', {
    apiSubscription: apiData.subscription,
    apiPlan: apiData.subscription?.plan_name,
    contextPlan: subscription?.plan,
    finalPlan: currentPlan,
    isLoading: apiData.isLoading,
    error: apiData.error
  })

  const setPlan = subscription?.setPlan

  const getPrice = (plan: typeof plans[0]) => {
    return billingPeriod === 'monthly' ? plan.priceMonthly : plan.priceYearly
  }

  const getMonthlyEquivalent = (yearlyPrice: string) => {
    return (parseFloat(yearlyPrice) / 12).toFixed(2)
  }

  const getSavings = (monthlyPrice: string, yearlyPrice: string) => {
    const monthlyCost = parseFloat(monthlyPrice) * 12
    const yearlyCost = parseFloat(yearlyPrice)
    const savings = monthlyCost - yearlyCost
    const percentage = Math.round((savings / monthlyCost) * 100)
    return { amount: savings.toFixed(2), percentage }
  }

  const handleSelectPlan = async (planId: string) => {
    console.log('[CHECKOUT] 🎯 Starting checkout flow:', {
      planId,
      currentPlan,
      billingPeriod,
      hasUser: !!user,
      hasSession: !!auth?.session
    })

    // Free plan or already subscribed
    if (planId === 'free' || planId === currentPlan) {
      toast.info('Vous utilisez déjà ce plan')
      return
    }

    // Check if user is authenticated
    if (!user || !auth?.session) {
      toast.error('Vous devez être connecté pour souscrire à un plan')
      window.location.href = '/login?redirectTo=/pricing'
      return
    }

    try {
      toast.loading('Redirection vers le paiement...', { id: 'stripe-redirect' })

      // Call backend to create Stripe checkout session
      const apiUrl = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL
      if (!apiUrl) throw new Error('Backend URL not configured')

      console.log('[CHECKOUT] 📡 Calling API:', `${apiUrl}/api/stripe/create-checkout-session`)

      const response = await fetch(`${apiUrl}/api/stripe/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Bearer ${auth.session.access_token}`,
        },
        body: new URLSearchParams({
          plan_name: planId,
          billing_period: billingPeriod,
        }),
      })

      const data = await response.json()

      console.log('[CHECKOUT] 📨 API Response:', {
        status: response.status,
        ok: response.ok,
        hasModified: !!data.modified,
        hasCheckoutUrl: !!data.checkout_url,
        data
      })

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to create checkout session')
      }

      toast.dismiss('stripe-redirect')

      // Check if it's a subscription modification (upgrade/downgrade) or new subscription
      if (data.modified) {
        console.log('[CHECKOUT] ✅ Subscription modification (upgrade/downgrade):', {
          immediate: data.immediate,
          message: data.message
        })

        // Subscription was modified immediately (upgrade) or scheduled (downgrade)
        if (data.immediate) {
          toast.success('✨ Abonnement mis à niveau ! Vérification en cours...')
        } else {
          toast.success('📅 Changement planifié ! Votre nouveau plan sera actif à la fin de la période actuelle.')
        }

        // Redirect to success page with polling to verify update
        // Use a fake session_id to trigger the polling mechanism
        const sessionId = `mod_${Date.now()}`
        console.log('[CHECKOUT] 🔄 Redirecting to success page for verification:', sessionId)
        window.location.href = `/payment/success?session_id=${sessionId}&type=modification`
      } else {
        // New subscription - redirect to Stripe Checkout
        console.log('[CHECKOUT] 💳 New checkout session - redirecting to Stripe')

        if (!data.checkout_url) {
          console.error('[CHECKOUT] ❌ Missing checkout_url:', data)
          throw new Error('Checkout URL manquante - le serveur n\'a pas retourné d\'URL de paiement')
        }

        console.log('[CHECKOUT] ➡️ Redirecting to:', data.checkout_url)
        window.location.href = data.checkout_url
      }

    } catch (error: any) {
      console.error('Stripe checkout error:', error)
      toast.dismiss('stripe-redirect')
      toast.error(error.message || 'Erreur lors de la création de la session de paiement')
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-huntzen-dark py-4 sticky top-0 z-50 border-b border-white/10">
        <div className="container mx-auto px-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 flex items-center justify-center">
              <span className="text-lg font-bold text-white">H</span>
            </div>
            <span className="text-white font-bold text-lg">HuntZen</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/jobs" className="text-white/70 hover:text-white text-sm transition-colors">
              <ArrowLeft className="w-4 h-4 inline mr-1" />
              Retour
            </Link>
            {user ? (
              <Link href="/jobs">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
                  <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                    <User className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-sm font-medium text-white">
                    {user.user_metadata?.full_name || user.email?.split('@')[0]}
                  </span>
                </div>
              </Link>
            ) : (
              <Link href="/login">
                <Button variant="outline" size="sm" className="border-white/20 text-white hover:bg-white/10">
                  Connexion
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 bg-gradient-to-br from-gray-50 via-blue-50/30 to-violet-50/30 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-20 left-10 w-72 h-72 bg-blue-500 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-violet-500 rounded-full blur-3xl"></div>
        </div>

        <div className="container mx-auto px-4 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-100 border border-violet-200 mb-6">
            <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
            <span className="text-sm font-medium text-gray-900">Rejoignez plus de 10 000 chercheurs d&apos;emploi</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-bold mb-6 text-gray-900">
            Trouvez le job de vos rêves<br />plus rapidement
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8 leading-relaxed">
            Des outils d&apos;IA puissants pour optimiser votre CV, préparer vos entretiens et dénicher les meilleures opportunités d&apos;emploi. Choisissez le plan qui correspond à vos ambitions.
          </p>

          {/* Trust indicators */}
          <div className="flex items-center justify-center gap-8 flex-wrap text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-green-600" />
              <span>Paiement sécurisé</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              <span>+10 000 utilisateurs</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-violet-600" />
              <span>78% de taux de succès</span>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-20 -mt-12 relative z-20">
        <div className="container mx-auto px-4">
          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-4 mb-12">
            <span className={`text-lg font-medium transition-colors ${billingPeriod === 'monthly' ? 'text-gray-900' : 'text-gray-400'}`}>
              Mensuel
            </span>
            <button
              onClick={() => setBillingPeriod(billingPeriod === 'monthly' ? 'yearly' : 'monthly')}
              className="relative w-16 h-8 bg-gray-200 rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
              style={{
                backgroundColor: billingPeriod === 'yearly' ? '#8b5cf6' : '#e5e7eb'
              }}
            >
              <span
                className="absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow-md transition-transform duration-300"
                style={{
                  transform: billingPeriod === 'yearly' ? 'translateX(32px)' : 'translateX(0)'
                }}
              />
            </button>
            <span className={`text-lg font-medium transition-colors ${billingPeriod === 'yearly' ? 'text-gray-900' : 'text-gray-400'}`}>
              Annuel
            </span>
            {billingPeriod === 'yearly' && (
              <span className="ml-2 px-3 py-1 bg-green-100 text-green-700 text-sm font-semibold rounded-full animate-in fade-in slide-in-from-right-2">
                🎉 Économisez jusqu&apos;à 20%
              </span>
            )}
          </div>

          <div className="grid md:grid-cols-4 gap-8 max-w-7xl mx-auto">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-3xl border-2 p-8 bg-white transition-all hover:shadow-2xl ${
                  plan.popular
                    ? 'border-violet-500 shadow-2xl shadow-violet-100 scale-[1.05] z-10'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {/* Popular badge */}
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-2 px-6 py-2 rounded-full bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-bold shadow-lg">
                      <Sparkles className="w-4 h-4" />
                      Le plus populaire
                    </span>
                  </div>
                )}

                {/* Plan header */}
                <div className="text-center mb-8 pt-2">
                  <div
                    className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br ${plan.gradient} text-white mb-5 shadow-lg`}
                  >
                    <plan.icon className="w-8 h-8" />
                  </div>
                  <h3 className="text-3xl font-bold mb-2">{plan.name}</h3>
                  <p className="text-muted-foreground text-base leading-relaxed">{plan.description}</p>
                </div>

                {/* Price */}
                <div className="text-center mb-8 py-4 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100">
                  {plan.id !== 'free' && billingPeriod === 'yearly' && (
                    <div className="mb-2">
                      <span className="inline-block px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">
                        Économisez {getSavings(plan.priceMonthly, plan.priceYearly).amount}€/an
                      </span>
                    </div>
                  )}
                  <div className="flex items-baseline justify-center gap-1 mb-1">
                    {plan.id === 'free' ? (
                      <span className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-gray-900 to-gray-700">
                        Gratuit
                      </span>
                    ) : (
                      <>
                        <span className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-gray-900 to-gray-700">
                          {billingPeriod === 'monthly' ? plan.priceMonthly : getMonthlyEquivalent(plan.priceYearly)}€
                        </span>
                        <span className="text-xl text-muted-foreground font-medium">/mois</span>
                      </>
                    )}
                  </div>
                  {plan.id !== 'free' && billingPeriod === 'yearly' && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {plan.priceYearly}€ facturé annuellement
                    </p>
                  )}
                  {plan.id !== 'free' && billingPeriod === 'monthly' && (
                    <p className="text-sm text-muted-foreground mt-1">Sans engagement</p>
                  )}
                  {plan.id === 'free' && (
                    <p className="text-sm text-muted-foreground mt-1">Pour toujours</p>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-4 mb-8">
                  {plan.features
                    .filter((f) => f.name)
                    .map((feature, index) => (
                      <li key={index} className="flex items-start gap-3">
                        {feature.included ? (
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center bg-gradient-to-br ${plan.gradient} flex-shrink-0 mt-0.5 shadow-md`}
                          >
                            <Check className="w-4 h-4 text-white stroke-[3]" />
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <X className="w-4 h-4 text-gray-300" />
                          </div>
                        )}
                        <span className={`text-sm leading-relaxed ${feature.included ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                          {feature.name}
                        </span>
                      </li>
                    ))}
                </ul>

                {/* CTA */}
                <Button
                  onClick={() => handleSelectPlan(plan.id)}
                  className={`w-full h-14 text-lg font-semibold rounded-xl shadow-lg transition-all ${
                    plan.popular
                      ? 'bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 shadow-violet-200 hover:shadow-violet-300 hover:scale-[1.02]'
                      : 'hover:scale-[1.02]'
                  }`}
                  variant={plan.popular ? 'default' : 'outline'}
                  size="lg"
                  disabled={plan.id === 'free' || plan.id === currentPlan}
                >
                  {plan.id === currentPlan ? 'Plan actuel' : `Commencer avec ${plan.name}`}
                </Button>

                {plan.popular && (
                  <p className="text-center text-sm text-muted-foreground mt-3">
                    ⚡ Activation immédiate
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Money back guarantee */}
          <div className="text-center mt-12">
            <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-green-50 border border-green-200">
              <Shield className="w-5 h-5 text-green-600" />
              <span className="text-green-800 font-medium">Garantie satisfait ou remboursé pendant 14 jours</span>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Ils ont transformé leur recherche d&apos;emploi
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Découvrez comment HuntZen a aidé des milliers de professionnels à décrocher leur prochain poste
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {testimonials.map((testimonial, index) => (
              <div key={index} className="bg-white rounded-2xl p-6 shadow-lg">
                <div className="flex gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
                <p className="text-gray-700 mb-4 italic">&ldquo;{testimonial.content}&rdquo;</p>
                <div>
                  <p className="font-semibold text-gray-900">{testimonial.name}</p>
                  <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Comparaison détaillée des fonctionnalités
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Trouvez le plan qui correspond exactement à vos besoins
            </p>
          </div>

          <div className="max-w-6xl mx-auto overflow-x-auto">
            <div className="bg-white rounded-2xl border-2 border-gray-200 overflow-hidden shadow-xl">
              {comparisonFeatures.map((category, categoryIndex) => (
                <div key={categoryIndex}>
                  {/* Category header */}
                  <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
                    <h3 className="font-bold text-lg text-gray-900">{category.category}</h3>
                  </div>

                  {/* Features table */}
                  <table className="w-full">
                    <thead>
                      {categoryIndex === 0 && (
                        <tr className="border-b-2 border-gray-200 bg-gray-50">
                          <th className="text-left py-4 px-6 font-semibold text-gray-900 w-1/3">Fonctionnalité</th>
                          <th className="text-center py-4 px-4 font-semibold text-gray-600 w-1/6">Gratuit</th>
                          <th className="text-center py-4 px-4 font-semibold text-blue-600 w-1/6">Starter</th>
                          <th className="text-center py-4 px-4 font-semibold text-violet-600 w-1/6">Pro</th>
                          <th className="text-center py-4 px-4 font-semibold text-amber-600 w-1/6">Premium</th>
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {category.features.map((feature, featureIndex) => (
                        <tr key={featureIndex} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="py-4 px-6 font-medium text-gray-700">{feature.name}</td>
                          <td className="text-center py-4 px-4">
                            {typeof feature.free === 'boolean' ? (
                              feature.free ? (
                                <Check className="w-5 h-5 text-green-500 mx-auto" />
                              ) : (
                                <X className="w-5 h-5 text-gray-300 mx-auto" />
                              )
                            ) : (
                              <span className="text-sm text-gray-600 font-medium">{feature.free}</span>
                            )}
                          </td>
                          <td className="text-center py-4 px-4">
                            {typeof feature.starter === 'boolean' ? (
                              feature.starter ? (
                                <Check className="w-5 h-5 text-blue-500 mx-auto" />
                              ) : (
                                <X className="w-5 h-5 text-gray-300 mx-auto" />
                              )
                            ) : (
                              <span className="text-sm font-semibold text-blue-600">{feature.starter}</span>
                            )}
                          </td>
                          <td className="text-center py-4 px-4">
                            {typeof feature.pro === 'boolean' ? (
                              feature.pro ? (
                                <Check className="w-5 h-5 text-violet-500 mx-auto" />
                              ) : (
                                <X className="w-5 h-5 text-gray-300 mx-auto" />
                              )
                            ) : (
                              <span className="text-sm font-semibold text-violet-600">{feature.pro}</span>
                            )}
                          </td>
                          <td className="text-center py-4 px-4">
                            {typeof feature.premium === 'boolean' ? (
                              feature.premium ? (
                                <Check className="w-5 h-5 text-amber-500 mx-auto" />
                              ) : (
                                <X className="w-5 h-5 text-gray-300 mx-auto" />
                              )
                            ) : (
                              <span className="text-sm font-semibold text-amber-600">{feature.premium}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Questions fréquentes
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Tout ce que vous devez savoir sur nos abonnements
            </p>
          </div>

          <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-6">
            {faqs.map((faq, index) => (
              <div key={index} className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow">
                <h3 className="font-bold text-lg mb-3 text-gray-900">{faq.question}</h3>
                <p className="text-muted-foreground leading-relaxed">{faq.answer}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <p className="text-muted-foreground mb-4">Vous avez d&apos;autres questions ?</p>
            <Button variant="outline" size="lg" className="rounded-xl">
              Contactez notre support
            </Button>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-600 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-10 right-10 w-96 h-96 bg-white rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 left-10 w-72 h-72 bg-blue-300 rounded-full blur-3xl"></div>
        </div>

        <div className="container mx-auto px-4 text-center relative z-10">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Prêt à transformer votre carrière ?
          </h2>
          <p className="text-xl text-white/90 max-w-3xl mx-auto mb-10 leading-relaxed">
            Rejoignez des milliers de professionnels qui utilisent HuntZen pour trouver leur emploi idéal.
            Commencez gratuitement, aucune carte bancaire requise.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/signup">
              <Button size="lg" className="bg-white text-violet-700 hover:bg-white/90 h-14 px-10 text-lg font-bold rounded-xl shadow-2xl hover:scale-105 transition-transform">
                <Rocket className="w-5 h-5 mr-2" />
                Commencer gratuitement
              </Button>
            </Link>
            <Link href="/jobs">
              <Button
                size="lg"
                variant="outline"
                className="border-2 border-white text-white hover:bg-white/20 h-14 px-10 text-lg font-semibold rounded-xl backdrop-blur-sm"
              >
                Voir les offres d&apos;emploi
              </Button>
            </Link>
          </div>

          <div className="mt-10 flex items-center justify-center gap-8 text-white/80 text-sm flex-wrap">
            <div className="flex items-center gap-2">
              <Check className="w-5 h-5" />
              <span>Sans engagement</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-5 h-5" />
              <span>14 jours satisfait ou remboursé</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-5 h-5" />
              <span>Support francophone</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-huntzen-dark text-white py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            {/* Brand */}
            <div>
              <Link href="/" className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 flex items-center justify-center">
                  <span className="text-lg font-bold text-white">H</span>
                </div>
                <span className="text-white font-bold text-lg">HuntZen</span>
              </Link>
              <p className="text-white/60 text-sm leading-relaxed">
                Votre partenaire IA pour une recherche d&apos;emploi efficace et personnalisée.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="font-semibold mb-4">Produit</h4>
              <ul className="space-y-2 text-sm text-white/60">
                <li><Link href="/jobs" className="hover:text-white transition-colors">Offres d&apos;emploi</Link></li>
                <li><Link href="/pricing" className="hover:text-white transition-colors">Tarifs</Link></li>
                <li><Link href="/features" className="hover:text-white transition-colors">Fonctionnalités</Link></li>
              </ul>
            </div>

            {/* Support */}
            <div>
              <h4 className="font-semibold mb-4">Support</h4>
              <ul className="space-y-2 text-sm text-white/60">
                <li><Link href="/help" className="hover:text-white transition-colors">Centre d&apos;aide</Link></li>
                <li><Link href="/contact" className="hover:text-white transition-colors">Contact</Link></li>
                <li><Link href="/faq" className="hover:text-white transition-colors">FAQ</Link></li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="font-semibold mb-4">Légal</h4>
              <ul className="space-y-2 text-sm text-white/60">
                <li><Link href="/privacy" className="hover:text-white transition-colors">Confidentialité</Link></li>
                <li><Link href="/terms" className="hover:text-white transition-colors">CGU</Link></li>
                <li><Link href="/cookies" className="hover:text-white transition-colors">Cookies</Link></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-white/10 pt-8 text-center">
            <p className="text-white/50 text-sm">
              &copy; {new Date().getFullYear()} HuntZen. Tous droits réservés. Fait avec ❤️ en France.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
