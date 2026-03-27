/**
 * WizardContainer - Core wizard engine for CV analysis
 * Manages: state, navigation, Framer Motion transitions, API integration
 */

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WizardSteps } from "@/components/cv/wizard-steps";
import { Step1Upload } from "@/components/cv/wizard/step1-upload";
import { Step2AnalysisType } from "@/components/cv/wizard/step2-analysis-type";
import { Step3Results } from "@/components/cv/wizard/step3-results";
import { CVHistoryDrawer } from "@/components/cv/cv-history-drawer";
import { useCVHistory } from "@/hooks/use-cv-history";
// Dynamic import: @react-pdf/renderer est lourd (~200KB), chargé uniquement au clic export
const lazyExportCVAnalysisToPDF = () =>
  import("@/utils/export-cv-pdf").then((mod) => mod.exportCVAnalysisToPDF);
import type { CVAnalysisResult } from "@/hooks/use-cv-history";
import type { Suggestion } from "@/components/cv/actionable-suggestions";
import type { BreakdownItem } from "@/components/cv/score-breakdown-v2";
import type { CvInfo } from "@/components/cv/cv-info-panel";
import { cn } from "@/lib/utils";

// ============================================================================
// TYPES
// ============================================================================

interface WizardContainerProps {
  onAnalyze: (
    file: File | null,
    cvText: string,
    jobOffer: string,
  ) => Promise<{
    score: number;
    breakdown: BreakdownItem[];
    strengths: string[];
    weaknesses: string[];
    suggestions: (string | Suggestion)[];
    rawAnalysis?: string;
    cv_info?: CvInfo;
  }>;
  onOpenPricingModal: (feature: string) => void;
  hasFeatures: {
    hasCVHistory: boolean;
    hasPDFExport: boolean;
  };
  className?: string;
}

interface WizardState {
  currentStep: 1 | 2 | 3;
  uploadMethod: "file" | "text";
  file: File | null;
  cvText: string;
  analysisType: "global" | "match" | null;
  jobOffer: string;
  loading: boolean;
  result: CVAnalysisResult | null;
  error: string | null;
}

// ============================================================================
// ANIMATION VARIANTS
// ============================================================================

const stepVariants = {
  enter: { opacity: 0, x: 100 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -100 },
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function WizardContainer({
  onAnalyze,
  onOpenPricingModal,
  hasFeatures,
  className,
}: WizardContainerProps) {
  const { history, saveAnalysis } = useCVHistory();
  const [showHistory, setShowHistory] = useState(false);

  const [wizardState, setWizardState] = useState<WizardState>({
    currentStep: 1,
    uploadMethod: "file",
    file: null,
    cvText: "",
    analysisType: null,
    jobOffer: "",
    loading: false,
    result: null,
    error: null,
  });

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleStep1Next = () => {
    setWizardState((prev) => ({ ...prev, currentStep: 2 }));
  };

  const handleStep2Back = () => {
    setWizardState((prev) => ({ ...prev, currentStep: 1 }));
  };

  const handleStep2Next = async () => {
    // Move to step 3 and start loading
    setWizardState((prev) => ({
      ...prev,
      currentStep: 3,
      loading: true,
      error: null,
    }));

    try {
      // Call API
      const response = await onAnalyze(
        wizardState.file,
        wizardState.cvText,
        wizardState.jobOffer,
      );

      // Transform suggestions
      const transformedSuggestions: Suggestion[] = (
        response.suggestions || []
      ).map((suggestion: string | Suggestion): Suggestion => {
        if (typeof suggestion === "string") {
          return {
            text: suggestion,
            impact: 5,
            category: "other",
            actionable: true,
          };
        }
        return {
          text: suggestion.text || "",
          impact: suggestion.impact || 5,
          category: suggestion.category || "other",
          actionable: suggestion.actionable !== false,
        };
      });

      // Create analysis data (without id and analyzedAt - saveAnalysis will add them)
      const analysisData = {
        fileName: wizardState.file?.name || "CV (texte collé)",
        score: response.score,
        breakdown: response.breakdown,
        strengths: response.strengths,
        weaknesses: response.weaknesses,
        suggestions: transformedSuggestions,
        rawAnalysis: response.rawAnalysis,
        cv_info: response.cv_info,
      };

      // Save to history (returns complete CVAnalysisResult with id and analyzedAt)
      const savedAnalysis = saveAnalysis(analysisData);

      // Update state
      setWizardState((prev) => ({
        ...prev,
        loading: false,
        result: savedAnalysis,
      }));
    } catch (error) {
      console.error("Analysis error:", error);
      setWizardState((prev) => ({
        ...prev,
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : "Une erreur est survenue lors de l'analyse",
      }));
    }
  };

  const handleReset = () => {
    setWizardState({
      currentStep: 1,
      uploadMethod: "file",
      file: null,
      cvText: "",
      analysisType: null,
      jobOffer: "",
      loading: false,
      result: null,
      error: null,
    });
  };

  const handleLoadFromHistory = (analysis: CVAnalysisResult) => {
    setWizardState((prev) => ({
      ...prev,
      currentStep: 3,
      result: analysis,
      loading: false,
      error: null,
    }));
    setShowHistory(false);
  };

  const handleExportPDF = async () => {
    if (!wizardState.result) return;
    const fileName = wizardState.file?.name
      ? `cv-analysis-${wizardState.file.name.replace(/\.[^.]+$/, "")}.pdf`
      : undefined;
    const exportCVAnalysisToPDF = await lazyExportCVAnalysisToPDF();
    await exportCVAnalysisToPDF(wizardState.result, fileName);
  };

  // ============================================================================
  // RENDER STEP
  // ============================================================================

  const renderCurrentStep = () => {
    switch (wizardState.currentStep) {
      case 1:
        return (
          <Step1Upload
            uploadMethod={wizardState.uploadMethod}
            file={wizardState.file}
            cvText={wizardState.cvText}
            onUploadMethodChange={(method) =>
              setWizardState((prev) => ({ ...prev, uploadMethod: method }))
            }
            onFileChange={(file) =>
              setWizardState((prev) => ({ ...prev, file }))
            }
            onTextChange={(text) =>
              setWizardState((prev) => ({ ...prev, cvText: text }))
            }
            onShowHistory={() => setShowHistory(true)}
            onNext={handleStep1Next}
            historyCount={history.length}
          />
        );

      case 2:
        return (
          <Step2AnalysisType
            analysisType={wizardState.analysisType}
            jobOffer={wizardState.jobOffer}
            onAnalysisTypeChange={(type) =>
              setWizardState((prev) => ({ ...prev, analysisType: type }))
            }
            onJobOfferChange={(text) =>
              setWizardState((prev) => ({ ...prev, jobOffer: text }))
            }
            onBack={handleStep2Back}
            onNext={handleStep2Next}
          />
        );

      case 3:
        return (
          <Step3Results
            loading={wizardState.loading}
            result={wizardState.result}
            error={wizardState.error}
            history={history}
            hasFeatures={hasFeatures}
            onReset={handleReset}
            onExportPDF={handleExportPDF}
            onOpenPricingModal={onOpenPricingModal}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className={cn("space-y-8", className)}>
      {/* Wizard Steps Indicator */}
      <WizardSteps currentStep={wizardState.currentStep} />

      {/* Step Content with Animations */}
      <div className="relative min-h-[400px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={wizardState.currentStep}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            {renderCurrentStep()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* History Drawer */}
      <CVHistoryDrawer
        open={showHistory}
        onOpenChange={setShowHistory}
        history={history}
        onSelectAnalysis={handleLoadFromHistory}
      />
    </div>
  );
}
