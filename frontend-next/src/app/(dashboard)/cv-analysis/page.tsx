"use client";

import { FileText, Loader2, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/auth-context";
import { useSubscription } from "@/contexts/subscription-context";
import { UsageCounter } from "@/components/freemium/usage-counter";
import { CVUploadAsyncWizard } from "@/components/cv/cv-upload-async-wizard";
import { ErrorBoundary } from "@/components/error-boundary";
import { Card } from "@/components/ui/card";

export default function CVAnalysisPage() {
  const { session, loading } = useAuth();

  // Freemium state
  const { canUse, incrementUsage, hasFeature, openPricingModal } =
    useSubscription();

  // Skeleton pendant vérification auth
  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <Loader2 className="w-12 h-12 animate-spin text-[#00D9FF] mb-4" />
          <p className="text-slate-600">Chargement de votre espace...</p>
        </div>
      </div>
    );
  }

  // Main page content
  const pageContent = (
    <div className="space-y-6">
      {/* Hero Header - HuntZen Style */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-start justify-between gap-4 bg-gradient-to-br from-white to-slate-50 p-8 rounded-2xl border border-slate-200 shadow-sm"
      >
        <div className="flex-1">
          <div className="flex items-center gap-4 mb-3">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#00D9FF] to-[#00C4EA] flex items-center justify-center shadow-lg shadow-[#00D9FF]/30"
            >
              <FileText className="w-7 h-7 text-white" />
            </motion.div>
            <h1 className="text-4xl font-black text-slate-900">Analyse CV</h1>
          </div>
          <p className="text-base text-slate-700 leading-relaxed max-w-3xl">
            Optimisez votre CV pour maximiser vos chances de décrocher un
            entretien. Obtenez une analyse détaillée et des recommandations
            personnalisées.
          </p>
        </div>

        {/* Usage Counter - only shown when authenticated */}
        {session && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            <UsageCounter feature="cv_analysis" />
          </motion.div>
        )}
      </motion.div>

      {/* Full Wizard with all features - Wrapped with ErrorBoundary */}
      <ErrorBoundary
        fallback={
          <Card className="p-8 bg-red-50 border-red-200">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-900 mb-2 text-center">
              Erreur lors du chargement de l'analyse CV
            </h3>
            <p className="text-slate-600 text-center">
              Une erreur s'est produite. Veuillez rafraîchir la page.
            </p>
          </Card>
        }
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm"
        >
          <CVUploadAsyncWizard
            canUse={canUse}
            incrementUsage={incrementUsage}
            openPricingModal={openPricingModal}
            hasFeatures={{
              hasCVHistory: hasFeature("has_cv_history"),
              hasPDFExport: hasFeature("has_pdf_export"),
            }}
          />
        </motion.div>
      </ErrorBoundary>
    </div>
  );

  // Always show page content (authentication is handled by CVUploadAsyncWizard)
  return pageContent;
}
