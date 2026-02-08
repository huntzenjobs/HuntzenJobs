'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, X, Sparkles, Zap, Crown, Gift } from 'lucide-react'
import { useSubscription } from '@/contexts/subscription-context'
import { useOptionalAuth } from '@/contexts/auth-context'
import { PlanType } from '@/hooks/use-freemium-limits'
import Link from 'next/link'
import { toast } from 'sonner'

interface PricingPlan {
  id: PlanType
  name: string
  price: string
  priceValue: number
  period: string
  description: string
  icon: React.ReactNode
  color: string
  bgGradient: string
  popular?: boolean
  features: {
    name: string
    included: boolean
    highlight?: boolean
  }[]
}

const plans: PricingPlan[] = [
  {
    id: 'free',
    name: 'Gratuit',
    price: '0',
    priceValue: 0,
    period: '',
    description: 'Parfait pour decouvrir HuntZen',
    icon: <Gift className="w-6 h-6" />,
    color: 'text-gray-600',
    bgGradient: 'from-gray-400 to-gray-500',
    features: [
      { name: '3 recherches par jour', included: true },
      { name: '10 offres visibles max', included: true },
      { name: '1 analyse CV par jour', included: true },
      { name: '5 minutes de coaching IA', included: true },
      { name: 'Filtres avances', included: false },
      { name: 'Favoris', included: false },
      { name: 'Score visuel CV', included: false },
      { name: 'Export PDF', included: false },
      { name: 'Simulation entretien', included: false },
    ],
  },
  {
    id: 'starter',
    name: 'Starter',
    price: '8,90',
    priceValue: 8.90,
    period: '/mois',
    description: 'Ideal pour commencer votre recherche',
    icon: <Zap className="w-6 h-6" />,
    color: 'text-blue-600',
    bgGradient: 'from-blue-500 to-blue-600',
    features: [
      { name: 'Recherches illimitees', included: true, highlight: true },
      { name: 'Toutes les offres visibles', included: true, highlight: true },
      { name: 'Filtres avances', included: true },
      { name: 'Favoris', included: true },
      { name: 'CV illimite + Score visuel', included: true },
      { name: 'Coach IA 30 min/jour', included: true },
      { name: 'Export PDF', included: false },
      { name: 'Simulation entretien', included: false },
      { name: 'Alertes email', included: false },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '13,90',
    priceValue: 13.90,
    period: '/mois',
    description: 'Le plus populaire pour booster sa carriere',
    icon: <Sparkles className="w-6 h-6" />,
    color: 'text-violet-600',
    bgGradient: 'from-violet-500 to-purple-600',
    popular: true,
    features: [
      { name: 'Tout Starter inclus', included: true },
      { name: 'Coach IA illimite', included: true, highlight: true },
      { name: 'Export PDF rapports CV', included: true, highlight: true },
      { name: 'Simulation entretien IA', included: true, highlight: true },
      { name: 'Support prioritaire', included: true },
      { name: 'Historique CV', included: false },
      { name: 'Conseils personnalises', included: false },
      { name: 'Alertes email', included: false },
      { name: 'Historique sessions coach', included: false },
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: '19,90',
    priceValue: 19.90,
    period: '/mois',
    description: 'Acces complet a toutes les fonctionnalites',
    icon: <Crown className="w-6 h-6" />,
    color: 'text-amber-600',
    bgGradient: 'from-amber-500 to-orange-500',
    features: [
      { name: 'Tout Pro inclus', included: true },
      { name: 'Historique CV illimite', included: true, highlight: true },
      { name: 'Conseils personnalises CV', included: true, highlight: true },
      { name: 'Alertes email nouvelles offres', included: true, highlight: true },
      { name: 'Historique sessions coach', included: true },
      { name: 'Acces beta nouvelles fonctions', included: true },
      { name: 'Support VIP', included: true },
      { name: '', included: true },
      { name: '', included: true },
    ],
  },
]

export function PricingModal() {
  const { showPricingModal, closePricingModal, pricingModalFeature, plan: currentPlan } =
    useSubscription()
  const auth = useOptionalAuth()
  const user = auth?.user

  const handleSelectPlan = async (planId: PlanType) => {
    if (planId === 'free' || planId === currentPlan) {
      toast.info('Vous utilisez déjà ce plan')
      closePricingModal()
      return
    }

    // Check if user is authenticated
    if (!user || !auth?.session) {
      toast.error('Vous devez être connecté pour souscrire à un plan')
      closePricingModal()
      // Redirect to login with pricing redirect
      window.location.href = '/login?redirectTo=/pricing'
      return
    }

    try {
      toast.loading('Redirection vers le paiement...', { id: 'stripe-redirect' })
      closePricingModal()

      // Call backend to create Stripe checkout session
      const apiUrl = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${apiUrl}/api/stripe/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Bearer ${auth.session.access_token}`,
        },
        body: new URLSearchParams({
          plan_name: planId,
          billing_period: 'monthly', // Default to monthly in modal
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to create checkout session')
      }

      toast.dismiss('stripe-redirect')

      // Redirect to Stripe Checkout
      window.location.href = data.checkout_url

    } catch (error: any) {
      console.error('Stripe checkout error:', error)
      toast.dismiss('stripe-redirect')
      toast.error(error.message || 'Erreur lors de la création de la session de paiement')
    }
  }

  return (
    <Dialog open={showPricingModal} onOpenChange={closePricingModal}>
      <DialogContent className="max-w-[95vw] w-full lg:max-w-6xl max-h-[95vh] overflow-hidden p-0 flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-3 flex-shrink-0">
          <DialogTitle className="text-2xl font-bold text-center">
            Debloquez toutes les fonctionnalites
          </DialogTitle>
          {pricingModalFeature && (
            <p className="text-center text-muted-foreground mt-2 text-sm">
              Cette fonctionnalite necessite un abonnement
            </p>
          )}
        </DialogHeader>

        <div className="px-6 pb-6 overflow-y-auto flex-1">
          {/* Plans Grid */}
          <div className="grid md:grid-cols-4 gap-4 pt-4">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-xl border-2 p-5 transition-all hover:shadow-lg ${
                  plan.popular
                    ? 'border-violet-500 shadow-violet-100 shadow-lg'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {/* Popular Badge */}
                {plan.popular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-violet-500 to-purple-600 text-white border-0 text-xs py-1 px-3 whitespace-nowrap">
                    Le plus populaire
                  </Badge>
                )}

                {/* Plan Header */}
                <div className="text-center mb-4">
                  <div
                    className={`inline-flex items-center justify-center w-12 h-12 rounded-lg bg-gradient-to-br ${plan.bgGradient} text-white mb-3`}
                  >
                    {plan.icon}
                  </div>
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                    {plan.description}
                  </p>
                </div>

                {/* Price */}
                <div className="text-center mb-4 py-3 bg-white rounded-lg">
                  <div className="flex items-baseline justify-center gap-1">
                    {plan.id === 'free' ? (
                      <span className="text-3xl font-bold text-gray-900">Gratuit</span>
                    ) : (
                      <>
                        <span className="text-3xl font-bold text-gray-900">{plan.price}€</span>
                        <span className="text-base text-gray-600">{plan.period}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Features */}
                <ul className="space-y-2 mb-4">
                  {plan.features
                    .filter((f) => f.name)
                    .slice(0, 6)
                    .map((feature, index) => (
                      <li
                        key={index}
                        className={`flex items-start gap-2 text-sm ${
                          feature.highlight ? 'font-medium' : ''
                        }`}
                      >
                        {feature.included ? (
                          <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            feature.highlight
                              ? `bg-gradient-to-br ${plan.bgGradient}`
                              : 'bg-green-500'
                          }`}>
                            <Check className="w-2.5 h-2.5 text-white" />
                          </div>
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <X className="w-2.5 h-2.5 text-gray-400" />
                          </div>
                        )}
                        <span
                          className={feature.included ? '' : 'text-gray-400'}
                        >
                          {feature.name}
                        </span>
                      </li>
                    ))}
                  {plan.features.filter((f) => f.name).length > 6 && (
                    <li className="text-xs text-muted-foreground italic pl-6">
                      + {plan.features.filter((f) => f.name).length - 6} autres fonctionnalités
                    </li>
                  )}
                </ul>

                {/* CTA Button */}
                <Button
                  onClick={() => handleSelectPlan(plan.id)}
                  className={`w-full h-11 text-sm font-semibold ${
                    plan.popular
                      ? 'bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700'
                      : ''
                  }`}
                  variant={plan.popular ? 'default' : 'outline'}
                  disabled={plan.id === 'free'}
                >
                  {plan.id === 'free' ? 'Plan actuel' : `Choisir ${plan.name}`}
                </Button>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="text-center mt-4 space-y-2">
            <p className="text-sm text-muted-foreground font-medium">
              ✓ Satisfait ou rembourse pendant 14 jours
            </p>
            <Link
              href="/pricing"
              onClick={closePricingModal}
              className="text-xs text-primary hover:underline block"
            >
              Voir le comparatif complet des fonctionnalites
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Standalone pricing cards for the pricing page
export function PricingCards({
  onSelectPlan,
}: {
  onSelectPlan?: (plan: PlanType) => void
}) {
  return (
    <div className="grid md:grid-cols-4 gap-6 max-w-6xl mx-auto">
      {plans.map((plan) => (
        <div
          key={plan.id}
          className={`relative rounded-2xl border-2 p-6 transition-all hover:shadow-xl ${
            plan.popular
              ? 'border-violet-500 shadow-violet-100 shadow-lg scale-[1.02]'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          {plan.popular && (
            <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-violet-500 to-purple-600 text-white border-0 px-4">
              Le plus populaire
            </Badge>
          )}

          <div className="text-center mb-6">
            <div
              className={`inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br ${plan.bgGradient} text-white mb-4`}
            >
              {plan.icon}
            </div>
            <h3 className="text-2xl font-bold">{plan.name}</h3>
            <p className="text-muted-foreground mt-2">{plan.description}</p>
          </div>

          <div className="text-center mb-6">
            <div className="flex items-baseline justify-center gap-1">
              {plan.id === 'free' ? (
                <span className="text-5xl font-bold">Gratuit</span>
              ) : (
                <>
                  <span className="text-5xl font-bold">{plan.price}</span>
                  <span className="text-xl text-muted-foreground">{plan.period}</span>
                </>
              )}
            </div>
          </div>

          <ul className="space-y-3 mb-8">
            {plan.features
              .filter((f) => f.name)
              .map((feature, index) => (
                <li
                  key={index}
                  className={`flex items-center gap-3 ${
                    feature.highlight ? 'font-medium' : ''
                  }`}
                >
                  {feature.included ? (
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center ${
                        feature.highlight
                          ? `bg-gradient-to-br ${plan.bgGradient}`
                          : 'bg-green-500'
                      }`}
                    >
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
                      <X className="w-3 h-3 text-gray-400" />
                    </div>
                  )}
                  <span className={feature.included ? '' : 'text-gray-400'}>
                    {feature.name}
                  </span>
                </li>
              ))}
          </ul>

          <Button
            onClick={() => onSelectPlan?.(plan.id)}
            className={`w-full h-12 text-lg ${
              plan.popular
                ? 'bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700'
                : ''
            }`}
            variant={plan.popular ? 'default' : 'outline'}
            size="lg"
            disabled={plan.id === 'free'}
          >
            {plan.id === 'free' ? 'Plan actuel' : `Commencer avec ${plan.name}`}
          </Button>
        </div>
      ))}
    </div>
  )
}
