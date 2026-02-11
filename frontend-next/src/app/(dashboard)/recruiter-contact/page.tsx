'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
  CheckCircle2,
  Star,
  Clock,
  Shield,
  Sparkles,
  Phone,
  Mail,
  Calendar,
  ArrowRight,
  Loader2,
} from 'lucide-react'
import { huntzenApi } from '@/lib/api/huntzen-client'
import { useRouter } from 'next/navigation'
import { useOptionalAuth } from '@/contexts/auth-context'
import { HeroSection } from '@/components/recruiter/hero-section'
import { ProcessSteps } from '@/components/recruiter/process-steps'
import { TestimonialsSection } from '@/components/recruiter/testimonials-section'
import { FAQSection } from '@/components/recruiter/faq-section'

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
      router.push('/login?redirectTo=' + encodeURIComponent('/recruiter-contact'))
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
      {/* Hero Premium */}
      <HeroSection />

      {/* Stats rapides */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-16"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center p-6 bg-white rounded-xl border-2 border-[#00D9FF]/20 hover:border-[#00D9FF] hover:shadow-lg transition-all"
        >
          <div className="text-4xl font-black text-[#00D9FF] mb-2">127</div>
          <p className="text-sm text-gray-600">Consultations réussies</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center p-6 bg-white rounded-xl border-2 border-[#00C4EA]/20 hover:border-[#00C4EA] hover:shadow-lg transition-all"
        >
          <div className="text-4xl font-black text-[#00C4EA] mb-2">4.9/5</div>
          <p className="text-sm text-gray-600">Satisfaction moyenne</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6 }}
          className="text-center p-6 bg-white rounded-xl border-2 border-[#00D9FF]/20 hover:border-[#00D9FF] hover:shadow-lg transition-all"
        >
          <div className="text-4xl font-black text-[#00D9FF] mb-2">48h</div>
          <p className="text-sm text-gray-600">Délai moyen</p>
        </motion.div>
      </motion.div>

      {/* Benefits Section */}
      <div className="grid md:grid-cols-3 gap-6 mb-16">
        {[
          {
            icon: CheckCircle2,
            title: "Conseils personnalisés",
            description: "Un recruteur expert analyse votre profil et vous donne des recommandations sur-mesure",
            delay: 0.7
          },
          {
            icon: Star,
            title: "Expertise professionnelle",
            description: "Nos recruteurs ont 10+ ans d'expérience dans le recrutement de cadres et talents",
            delay: 0.8
          },
          {
            icon: Clock,
            title: "Réponse rapide",
            description: "Vous serez contacté sous 48h pour planifier votre consultation de 30 minutes",
            delay: 0.9
          }
        ].map((benefit, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: benefit.delay }}
          >
            <Card className="border-2 border-gray-200 hover:border-[#00D9FF] hover:shadow-lg transition-all h-full">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#00D9FF] to-[#00C4EA] flex items-center justify-center mb-4 shadow-lg shadow-[#00D9FF]/30">
                  <benefit.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-bold text-lg text-black mb-2">{benefit.title}</h3>
                <p className="text-gray-600 text-sm">
                  {benefit.description}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Process Steps */}
      <ProcessSteps />

      {/* Testimonials */}
      <TestimonialsSection />

      <motion.div
        id="contact-form"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.0 }}
        className="grid lg:grid-cols-2 gap-8"
      >
        {/* Pricing Card */}
        <Card className="border-2 border-[#00D9FF] shadow-lg overflow-hidden h-fit">
          <CardHeader className="bg-gradient-to-br from-[#00D9FF] to-[#00C4EA] text-white">
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
                <span className="text-5xl font-bold text-black">50€</span>
                <span className="text-gray-600">/ consultation</span>
              </div>
              <p className="text-sm text-gray-600">Paiement unique, aucun abonnement</p>
            </div>

            <div className="space-y-4">
              {[
                {
                  title: "Session vidéo de 30 minutes",
                  description: "Échange en direct avec un expert"
                },
                {
                  title: "Analyse personnalisée",
                  description: "CV, profil LinkedIn, stratégie de recherche"
                },
                {
                  title: "Plan d'action concret",
                  description: "Recommandations actionnables immédiatement"
                },
                {
                  title: "Compte-rendu écrit",
                  description: "Résumé détaillé après la consultation"
                }
              ].map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1.1 + index * 0.1 }}
                  className="flex items-start gap-3"
                >
                  <CheckCircle2 className="w-5 h-5 text-[#00D9FF] mt-0.5" />
                  <div>
                    <p className="font-medium text-black">{item.title}</p>
                    <p className="text-sm text-gray-600">{item.description}</p>
                  </div>
                </motion.div>
              ))}
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
        <Card className="border-2 border-gray-200 h-fit">
          <CardHeader>
            <CardTitle className="text-black">Réserver ma consultation</CardTitle>
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
                    className="border-gray-300 focus:border-[#00D9FF] focus:ring-[#00D9FF]"
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
                      className="pl-10 border-gray-300 focus:border-[#00D9FF] focus:ring-[#00D9FF]"
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
                      className="pl-10 border-gray-300 focus:border-[#00D9FF] focus:ring-[#00D9FF]"
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
                      className="pl-10 border-gray-300 focus:border-[#00D9FF] focus:ring-[#00D9FF]"
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
                    className="border-gray-300 focus:border-[#00D9FF] focus:ring-[#00D9FF]"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-base font-bold bg-gradient-to-r from-[#00D9FF] to-[#00C4EA] hover:shadow-lg hover:shadow-[#00D9FF]/40 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
                disabled={isSubmitting || !formData.fullName || !formData.email}
              >
                {isSubmitting ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Traitement en cours...</span>
                  </div>
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
      </motion.div>

      {/* FAQ Interactive */}
      <FAQSection />

      {/* CTA Bottom */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2 }}
        className="bg-gradient-to-r from-[#00D9FF] to-[#00C4EA] text-white p-12 rounded-3xl text-center mt-12 shadow-xl"
      >
        <h3 className="text-3xl font-bold mb-4">
          Prêt à booster votre carrière ?
        </h3>
        <p className="text-xl text-white/90 mb-6">
          👥 <strong>5 consultations</strong> réservées cette semaine
        </p>
        <Button
          size="lg"
          className="h-14 px-12 bg-white text-[#00D9FF] hover:bg-gray-100 font-bold transition-all duration-300 hover:scale-105"
          onClick={() => {
            const formSection = document.getElementById('contact-form')
            formSection?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
        >
          Réserver maintenant (50€)
        </Button>
      </motion.div>
    </div>
  )
}
