'use client'

import { FileText } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { useSubscription } from '@/contexts/subscription-context'
import { UsageCounter } from '@/components/freemium/usage-counter'
import { CVUploadAsyncWizard } from '@/components/cv/cv-upload-async-wizard'

export default function CVAnalysisPage() {
  const { session } = useAuth()

  // Freemium state
  const {
    canUse,
    incrementUsage,
    hasFeature,
    openPricingModal,
  } = useSubscription()

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

      {/* Full Wizard with all features */}
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
    </div>
  )

  // Always show page content (authentication is handled by CVUploadAsyncWizard)
  return pageContent
}
