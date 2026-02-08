'use client'

import { FileText, Loader2, AlertCircle } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { useSubscription } from '@/contexts/subscription-context'
import { UsageCounter } from '@/components/freemium/usage-counter'
import { CVUploadAsyncWizard } from '@/components/cv/cv-upload-async-wizard'
import { ErrorBoundary } from '@/components/error-boundary'
import { Card } from '@/components/ui/card'

export default function CVAnalysisPage() {
  const { session, loading } = useAuth()

  // Freemium state
  const {
    canUse,
    incrementUsage,
    hasFeature,
    openPricingModal,
  } = useSubscription()

  // Skeleton pendant vérification auth
  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
          <p className="text-gray-600">Chargement de votre espace...</p>
        </div>
      </div>
    )
  }

  // Main page content
  const pageContent = (
    <div className="space-y-6">
      {/* Hero Header - HuntZen Style */}
      <div className="flex items-start justify-between gap-4 bg-white p-8 rounded-2xl border-2 border-gray-200 shadow-sm">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-huntzen-blue flex items-center justify-center">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-4xl font-black text-gray-900">Analyse CV</h1>
          </div>
          <p className="text-lg text-gray-600">
            Optimisez votre CV pour maximiser vos chances de décrocher un entretien
          </p>
        </div>

        {/* Usage Counter - only shown when authenticated */}
        {session && <UsageCounter feature="cv_analysis" />}
      </div>

      {/* Full Wizard with all features - Wrapped with ErrorBoundary */}
      <ErrorBoundary fallback={
        <Card className="p-8 bg-red-50 border-red-200">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2 text-center">
            Erreur lors du chargement de l'analyse CV
          </h3>
          <p className="text-gray-600 text-center">
            Une erreur s'est produite. Veuillez rafraîchir la page.
          </p>
        </Card>
      }>
        <div className="bg-white p-8 rounded-2xl border-2 border-gray-200 shadow-sm">
          <CVUploadAsyncWizard
            canUse={canUse}
            incrementUsage={incrementUsage}
            openPricingModal={openPricingModal}
            hasFeatures={{
              hasCVHistory: hasFeature('has_cv_history'),
              hasPDFExport: hasFeature('has_pdf_export')
            }}
          />
        </div>
      </ErrorBoundary>
    </div>
  )

  // Always show page content (authentication is handled by CVUploadAsyncWizard)
  return pageContent
}
