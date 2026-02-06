'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { FileText } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { useSubscription } from '@/contexts/subscription-context'
import { UsageCounter } from '@/components/freemium/usage-counter'
import { CVUploadAsyncWizard } from '@/components/cv/cv-upload-async-wizard'

export default function CVAnalysisPage() {
  const { session, loading } = useAuth()
  const router = useRouter()

  // Redirect to signup if not authenticated
  useEffect(() => {
    if (!loading && !session) {
      router.push('/signup?redirect=/cv-analysis&message=auth_required')
    }
  }, [session, loading, router])

  // Freemium state
  const {
    canUse,
    incrementUsage,
    hasFeature,
    openPricingModal,
  } = useSubscription()

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
          <p className="mt-4 text-gray-600">Chargement...</p>
        </div>
      </div>
    )
  }

  // If no session, don't render anything (redirect in progress)
  if (!session) {
    return null
  }

  return (
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

        {/* Usage Counter */}
        <UsageCounter feature="cv_analysis" />
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
}
