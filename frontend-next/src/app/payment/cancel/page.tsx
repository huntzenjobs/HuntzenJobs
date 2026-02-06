'use client'

import Link from 'next/link'
import { XCircle, ArrowLeft, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function PaymentCancelPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-orange-50/30 to-red-50/30 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* Cancel Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-12 text-center relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute top-10 right-10 w-64 h-64 bg-orange-500 rounded-full blur-3xl"></div>
            <div className="absolute bottom-10 left-10 w-48 h-48 bg-red-500 rounded-full blur-3xl"></div>
          </div>

          <div className="relative z-10">
            {/* Cancel Icon */}
            <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-orange-400 to-red-500 rounded-full mb-6 shadow-2xl shadow-orange-200">
              <XCircle className="w-12 h-12 text-white" strokeWidth={3} />
            </div>

            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Paiement annulé
            </h1>

            <p className="text-xl text-gray-600 mb-8">
              Vous avez annulé le processus de paiement
            </p>

            {/* Information message */}
            <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-2xl p-6 mb-8">
              <p className="text-gray-700 leading-relaxed">
                Aucun montant n'a été débité de votre compte. Vous pouvez réessayer quand vous le souhaitez ou continuer avec le plan gratuit.
              </p>
            </div>

            {/* Options */}
            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-3 text-left bg-white rounded-xl p-4 border-2 border-gray-100">
                <HelpCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-gray-900 mb-1">Besoin d'aide ?</p>
                  <p className="text-sm text-gray-600">
                    Notre équipe support est disponible pour répondre à toutes vos questions sur nos abonnements.
                  </p>
                </div>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/pricing" className="flex-1">
                <Button className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all">
                  <ArrowLeft className="w-5 h-5 mr-2" />
                  Retour aux tarifs
                </Button>
              </Link>
              <Link href="/jobs" className="flex-1">
                <Button variant="outline" className="w-full h-14 text-lg font-semibold border-2 hover:bg-gray-50">
                  Continuer avec le plan gratuit
                </Button>
              </Link>
            </div>

            {/* Support contact */}
            <div className="mt-8 pt-8 border-t border-gray-200">
              <p className="text-sm text-gray-600 mb-3">
                Des questions sur nos abonnements ?
              </p>
              <Link href="/help">
                <Button variant="link" className="text-violet-600 hover:text-violet-700 font-medium">
                  Contactez notre support →
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Additional info */}
        <div className="text-center mt-6 space-y-2">
          <p className="text-sm text-gray-600">
            💡 <span className="font-medium">Astuce:</span> Profitez du plan gratuit pour découvrir HuntZen avant de vous abonner
          </p>
        </div>
      </div>
    </div>
  )
}
