'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Users,
  CheckCircle2,
  Star,
  Clock,
  Shield,
  Sparkles,
  Phone,
  Mail,
  Briefcase,
  Calendar,
  ArrowRight,
} from 'lucide-react'
import { huntzenApi } from '@/lib/api/huntzen-client'
import { useRouter } from 'next/navigation'
import { useOptionalAuth } from '@/contexts/auth-context'

export default function RecruiterContactPage() {
  const router = useRouter()
  const auth = useOptionalAuth()
  const user = auth?.user

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    fullName: user?.user_metadata?.full_name || '',
    email: user?.email || '',
    phone: '',
    sector: '',
    experienceLevel: '',
    message: '',
    preferredDate: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      router.push('/login?redirect=/recruiter-contact')
      return
    }

    setIsSubmitting(true)

    try {
      // TODO: Implement API call to create recruiter request
      // const response = await huntzenApi.createRecruiterRequest(formData)
      // const checkoutUrl = response.checkoutUrl

      // For now, just show success
      alert('Demande envoyée ! Redirection vers le paiement...')

      // router.push(checkoutUrl)
    } catch (error) {
      console.error('Error submitting request:', error)
      alert('Une erreur est survenue. Veuillez réessayer.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <div className="container max-w-6xl mx-auto px-4 py-8">
      {/* Hero Section */}
      <div className="mb-12 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/20 mb-4">
          <Users className="w-8 h-8 text-emerald-500" />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Parlez directement avec un recruteur expert
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          Obtenez des conseils personnalisés d'un professionnel du recrutement pour booster votre recherche d'emploi
        </p>
      </div>

      {/* Benefits Section */}
      <div className="grid md:grid-cols-3 gap-6 mb-12">
        <Card className="border-2 hover:border-emerald-500 transition-all">
          <CardContent className="pt-6">
            <div className="w-12 h-12 rounded-lg bg-emerald-500/20 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Conseils personnalisés</h3>
            <p className="text-gray-600 text-sm">
              Un recruteur expert analyse votre profil et vous donne des recommandations sur-mesure
            </p>
          </CardContent>
        </Card>

        <Card className="border-2 hover:border-emerald-500 transition-all">
          <CardContent className="pt-6">
            <div className="w-12 h-12 rounded-lg bg-emerald-500/20 flex items-center justify-center mb-4">
              <Star className="w-6 h-6 text-emerald-500" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Expertise professionnelle</h3>
            <p className="text-gray-600 text-sm">
              Nos recruteurs ont 10+ ans d'expérience dans le recrutement de cadres et talents
            </p>
          </CardContent>
        </Card>

        <Card className="border-2 hover:border-emerald-500 transition-all">
          <CardContent className="pt-6">
            <div className="w-12 h-12 rounded-lg bg-emerald-500/20 flex items-center justify-center mb-4">
              <Clock className="w-6 h-6 text-emerald-500" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Réponse rapide</h3>
            <p className="text-gray-600 text-sm">
              Vous serez contacté sous 48h pour planifier votre consultation de 30 minutes
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Pricing Card */}
        <Card className="border-2 border-emerald-500 shadow-lg">
          <CardHeader className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
            <CardTitle className="text-2xl flex items-center gap-2">
              <Sparkles className="w-6 h-6" />
              Consultation Recruteur
            </CardTitle>
            <CardDescription className="text-white/90 text-lg">
              Session individuelle de 30 minutes
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="mb-6">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-5xl font-bold text-gray-900">50€</span>
                <span className="text-gray-600">/ consultation</span>
              </div>
              <p className="text-sm text-gray-600">Paiement unique, aucun abonnement</p>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">Session vidéo de 30 minutes</p>
                  <p className="text-sm text-gray-600">Échange en direct avec un expert</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">Analyse personnalisée</p>
                  <p className="text-sm text-gray-600">CV, profil LinkedIn, stratégie de recherche</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">Plan d'action concret</p>
                  <p className="text-sm text-gray-600">Recommandations actionnables immédiatement</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">Compte-rendu écrit</p>
                  <p className="text-sm text-gray-600">Résumé détaillé après la consultation</p>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Shield className="w-4 h-4" />
                <span>Paiement sécurisé par Stripe</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Request Form */}
        <Card>
          <CardHeader>
            <CardTitle>Réserver ma consultation</CardTitle>
            <CardDescription>
              Remplissez le formulaire pour être contacté par un recruteur expert
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4">
                <div>
                  <Label htmlFor="fullName">Nom complet *</Label>
                  <Input
                    id="fullName"
                    placeholder="Jean Dupont"
                    value={formData.fullName}
                    onChange={(e) => handleChange('fullName', e.target.value)}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="email">Email *</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="jean.dupont@example.com"
                      className="pl-10"
                      value={formData.email}
                      onChange={(e) => handleChange('email', e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="phone">Téléphone</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+33 6 12 34 56 78"
                      className="pl-10"
                      value={formData.phone}
                      onChange={(e) => handleChange('phone', e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="sector">Secteur d'activité *</Label>
                  <Select
                    value={formData.sector}
                    onValueChange={(value) => handleChange('sector', value)}
                    required
                  >
                    <SelectTrigger id="sector">
                      <SelectValue placeholder="Sélectionnez votre secteur" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tech">Tech / IT</SelectItem>
                      <SelectItem value="finance">Finance / Banque</SelectItem>
                      <SelectItem value="marketing">Marketing / Communication</SelectItem>
                      <SelectItem value="sales">Vente / Commercial</SelectItem>
                      <SelectItem value="hr">RH / Recrutement</SelectItem>
                      <SelectItem value="engineering">Ingénierie</SelectItem>
                      <SelectItem value="healthcare">Santé</SelectItem>
                      <SelectItem value="education">Éducation</SelectItem>
                      <SelectItem value="other">Autre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="experienceLevel">Niveau d'expérience *</Label>
                  <Select
                    value={formData.experienceLevel}
                    onValueChange={(value) => handleChange('experienceLevel', value)}
                    required
                  >
                    <SelectTrigger id="experienceLevel">
                      <SelectValue placeholder="Sélectionnez votre niveau" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="junior">Junior (0-3 ans)</SelectItem>
                      <SelectItem value="confirmed">Confirmé (3-7 ans)</SelectItem>
                      <SelectItem value="senior">Senior (7-12 ans)</SelectItem>
                      <SelectItem value="expert">Expert (12+ ans)</SelectItem>
                      <SelectItem value="manager">Manager / Lead</SelectItem>
                      <SelectItem value="executive">Executive / C-level</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="preferredDate">Date préférée (optionnel)</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <Input
                      id="preferredDate"
                      type="date"
                      className="pl-10"
                      value={formData.preferredDate}
                      onChange={(e) => handleChange('preferredDate', e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="message">Message / Questions *</Label>
                  <Textarea
                    id="message"
                    placeholder="Décrivez brièvement votre situation et vos objectifs professionnels..."
                    rows={4}
                    value={formData.message}
                    onChange={(e) => handleChange('message', e.target.value)}
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-base font-bold bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  'Traitement en cours...'
                ) : (
                  <>
                    Réserver ma consultation (50€)
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </>
                )}
              </Button>

              <p className="text-xs text-gray-500 text-center">
                Après validation, vous serez redirigé vers le paiement sécurisé Stripe
              </p>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* FAQ Section */}
      <div className="mt-12 max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-8">Questions fréquentes</h2>
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <h3 className="font-semibold mb-2">Comment se déroule la consultation ?</h3>
              <p className="text-gray-600 text-sm">
                Après paiement, vous recevrez un email avec un lien pour planifier la session à l'horaire qui vous convient. La consultation se fait en visioconférence avec un recruteur expert qui analysera votre situation et vous donnera des conseils personnalisés.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <h3 className="font-semibold mb-2">Que se passe-t-il si je ne suis pas satisfait ?</h3>
              <p className="text-gray-600 text-sm">
                Nous offrons une garantie satisfait ou remboursé de 7 jours. Si la consultation ne répond pas à vos attentes, contactez-nous pour obtenir un remboursement complet.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <h3 className="font-semibold mb-2">Qui sont les recruteurs ?</h3>
              <p className="text-gray-600 text-sm">
                Nos recruteurs sont des professionnels certifiés avec 10+ ans d'expérience dans le recrutement de talents. Ils ont travaillé pour des cabinets de recrutement renommés et des entreprises du CAC 40.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
