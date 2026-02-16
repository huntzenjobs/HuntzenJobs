'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
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
  Calendar,
  ArrowRight,
  X,
} from 'lucide-react'
import { useOptionalAuth } from '@/contexts/auth-context'
import { useRouter } from 'next/navigation'

interface RecruiterContactModalProps {
  isOpen: boolean
  onClose: () => void
  /**
   * Context from which the modal was opened
   * Used to customize the experience
   */
  source?: 'job-listing' | 'cv-analysis' | 'sidebar' | 'assistant'
}

export function RecruiterContactModal({
  isOpen,
  onClose,
  source = 'sidebar',
}: RecruiterContactModalProps) {
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
      onClose()
      router.push('/login?redirectTo=' + encodeURIComponent('/recruiter-contact'))
      return
    }

    setIsSubmitting(true)

    try {
      // Create recruiter request
      const response = await huntzenApi.createRecruiterRequest(formData)

      // Create Stripe payment session
      const paymentResponse = await huntzenApi.createRecruiterPayment(response.request_id)

      // Redirect to Stripe checkout
      if (paymentResponse.checkout_url) {
        window.location.href = paymentResponse.checkout_url
      }
    } catch (error: any) {
      alert('Une erreur est survenue. Veuillez réessayer.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const getContextMessage = () => {
    switch (source) {
      case 'job-listing':
        return 'Cette offre vous intéresse ? Un recruteur peut vous aider à maximiser vos chances !'
      case 'cv-analysis':
        return 'Besoin de conseils personnalisés pour optimiser votre CV ?'
      case 'assistant':
        return 'Passez à l\'étape supérieure avec l\'expertise d\'un recruteur professionnel'
      default:
        return 'Obtenez des conseils personnalisés d\'un recruteur expert'
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Users className="w-6 h-6 text-emerald-500" />
            Contact Recruteur Expert
          </DialogTitle>
          <DialogDescription className="text-base">
            {getContextMessage()}
          </DialogDescription>
        </DialogHeader>

        <div className="grid lg:grid-cols-2 gap-6 mt-4">
          {/* Left column: Benefits & Pricing */}
          <div className="space-y-4">
            {/* Benefits */}
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Session vidéo 30 min</p>
                  <p className="text-sm text-gray-600">Échange en direct avec un expert</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <Star className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Expertise professionnelle</p>
                  <p className="text-sm text-gray-600">10+ ans d'expérience en recrutement</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Réponse rapide</p>
                  <p className="text-sm text-gray-600">Contact sous 48h</p>
                </div>
              </div>
            </div>

            {/* Pricing */}
            <div className="p-6 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
              <div className="flex items-baseline gap-2 mb-2">
                <Sparkles className="w-5 h-5" />
                <span className="text-3xl font-bold">50€</span>
                <span className="text-white/80">/ consultation</span>
              </div>
              <p className="text-sm text-white/90">
                Paiement unique · Aucun abonnement
              </p>
              <div className="mt-4 pt-4 border-t border-white/20">
                <div className="flex items-center gap-2 text-sm">
                  <Shield className="w-4 h-4" />
                  <span>Paiement sécurisé par Stripe</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right column: Form */}
          <div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-3">
                <div>
                  <Label htmlFor="modal-fullName" className="text-sm">Nom complet *</Label>
                  <Input
                    id="modal-fullName"
                    placeholder="Jean Dupont"
                    value={formData.fullName}
                    onChange={(e) => handleChange('fullName', e.target.value)}
                    required
                    className="h-10"
                  />
                </div>

                <div>
                  <Label htmlFor="modal-email" className="text-sm">Email *</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    <Input
                      id="modal-email"
                      type="email"
                      placeholder="jean.dupont@example.com"
                      className="pl-10 h-10"
                      value={formData.email}
                      onChange={(e) => handleChange('email', e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="modal-phone" className="text-sm">Téléphone</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    <Input
                      id="modal-phone"
                      type="tel"
                      placeholder="+33 6 12 34 56 78"
                      className="pl-10 h-10"
                      value={formData.phone}
                      onChange={(e) => handleChange('phone', e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="modal-sector" className="text-sm">Secteur *</Label>
                  <Select
                    value={formData.sector}
                    onValueChange={(value) => handleChange('sector', value)}
                    required
                  >
                    <SelectTrigger id="modal-sector" className="h-10">
                      <SelectValue placeholder="Sélectionnez" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tech">Tech / IT</SelectItem>
                      <SelectItem value="finance">Finance</SelectItem>
                      <SelectItem value="marketing">Marketing</SelectItem>
                      <SelectItem value="sales">Commercial</SelectItem>
                      <SelectItem value="hr">RH</SelectItem>
                      <SelectItem value="engineering">Ingénierie</SelectItem>
                      <SelectItem value="other">Autre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="modal-experience" className="text-sm">Expérience *</Label>
                  <Select
                    value={formData.experienceLevel}
                    onValueChange={(value) => handleChange('experienceLevel', value)}
                    required
                  >
                    <SelectTrigger id="modal-experience" className="h-10">
                      <SelectValue placeholder="Sélectionnez" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="junior">Junior (0-3 ans)</SelectItem>
                      <SelectItem value="confirmed">Confirmé (3-7 ans)</SelectItem>
                      <SelectItem value="senior">Senior (7-12 ans)</SelectItem>
                      <SelectItem value="expert">Expert (12+ ans)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="modal-message" className="text-sm">Message *</Label>
                  <Textarea
                    id="modal-message"
                    placeholder="Décrivez votre situation..."
                    rows={3}
                    value={formData.message}
                    onChange={(e) => handleChange('message', e.target.value)}
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 text-base font-bold bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  'Traitement...'
                ) : (
                  <>
                    Réserver (50€)
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>

              <p className="text-xs text-gray-500 text-center">
                Redirection vers paiement sécurisé Stripe
              </p>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
