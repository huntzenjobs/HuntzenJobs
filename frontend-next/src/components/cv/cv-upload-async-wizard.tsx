/**
 * CV Upload Async Wizard - Full-featured wizard with Modal Labs
 *
 * Features from old system:
 * - Multi-step wizard (Upload → Type → Results)
 * - File OR Text input
 * - Analysis type choice (Global/Match)
 * - CV History drawer
 * - PDF export
 * - CV Info panel
 * - Framer Motion animations
 *
 * New features:
 * - Async processing with Modal Labs
 * - Real-time progress tracking
 * - Auto-scaling (0 → 1000 workers)
 *
 * @author HuntZen Team
 * @date 2026-01-28
 */

'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, Loader2, CheckCircle2, XCircle, Clock, ArrowLeft, ArrowRight, History } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { useCVAnalysis } from '@/hooks/use-cv-analysis';
import { useSubscriptionApi } from '@/hooks/use-subscription-api';
import { CVHistoryDrawer } from '@/components/cv/cv-history-drawer';
import { WizardSteps } from '@/components/cv/wizard-steps';
import { ResultsAccordion } from '@/components/cv/results-accordion';
import { CVInfoPanel } from '@/components/cv/cv-info-panel';
import { ScoreRing } from '@/components/cv/score-ring';
import { ProcessingSteps } from '@/components/cv/processing-steps';
import { exportCVAnalysisToPDF } from '@/utils/export-cv-pdf';
import type { FeatureType } from '@/hooks/use-freemium-limits';
import type { Suggestion } from '@/components/cv/actionable-suggestions';

// ============================================
// TYPES
// ============================================

interface CVUploadAsyncWizardProps {
  canUse: (feature: FeatureType) => boolean;
  incrementUsage: (feature: FeatureType) => void;
  openPricingModal: (feature?: string) => void;
  hasFeatures: {
    hasCVHistory: boolean;
    hasPDFExport: boolean;
  };
}

type WizardStep = 1 | 2 | 3;
type UploadMethod = 'file' | 'text';
type AnalysisType = 'global' | 'match';

interface WizardState {
  currentStep: WizardStep;
  uploadMethod: UploadMethod;
  file: File | null;
  cvText: string;
  analysisType: AnalysisType | null;
  jobDescription: string;
}

// ============================================
// ANIMATION VARIANTS
// ============================================

const stepVariants = {
  enter: { opacity: 0, x: 100 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -100 }
};

// ============================================
// COMPONENT
// ============================================

export function CVUploadAsyncWizard({
  canUse,
  incrementUsage,
  openPricingModal,
  hasFeatures
}: CVUploadAsyncWizardProps) {
  const { session, user, loading } = useAuth();
  const router = useRouter();

  // ============================================
  // LOADING CHECK - Skeleton pendant vérification auth
  // ============================================

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
          <p className="text-gray-600">Vérification de votre session...</p>
        </div>
      </div>
    );
  }

  // ============================================
  // AUTH CHECK - Force authentication for CV analysis
  // ============================================

  if (!session || !user) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 border-2 border-blue-200 rounded-2xl p-8 shadow-xl">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full mb-4 shadow-lg">
              <span className="text-3xl">🎯</span>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">
              Créez un compte gratuit pour analyser votre CV
            </h3>
            <p className="text-gray-600 text-lg">
              Bénéficiez d'une analyse professionnelle de votre CV avec notre IA
            </p>
          </div>

          {/* Benefits */}
          <div className="bg-white rounded-xl p-6 mb-6">
            <h4 className="font-bold text-gray-900 mb-4">Ce que vous obtenez gratuitement :</h4>
            <ul className="space-y-3">
              <li className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <span><strong>1 analyse CV gratuite</strong> par jour</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <span><strong>Score ATS détaillé</strong> avec recommandations</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <span><strong>Analyse de compatibilité</strong> avec offres d'emploi</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <span><strong>Sauvegarde de vos analyses</strong> et historique</span>
              </li>
            </ul>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => router.push('/signup?redirectTo=' + encodeURIComponent('/cv-analysis'))}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all transform hover:scale-105"
            >
              Créer un compte gratuit
            </button>
            <button
              onClick={() => router.push('/login?redirectTo=' + encodeURIComponent('/cv-analysis'))}
              className="flex-1 px-6 py-3 bg-white text-gray-700 font-semibold rounded-xl border-2 border-gray-300 hover:border-blue-500 transition-all"
            >
              J'ai déjà un compte
            </button>
          </div>

          {/* Trust indicators */}
          <div className="mt-6 flex items-center justify-center gap-6 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span>Gratuit sans CB</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span>Inscription en 30 secondes</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // History from API (Supabase)
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadedHistoryResult, setLoadedHistoryResult] = useState<any>(null);

  // Wizard state
  const [wizardState, setWizardState] = useState<WizardState>({
    currentStep: 1,
    uploadMethod: 'file',
    file: null,
    cvText: '',
    analysisType: null,
    jobDescription: '',
  });

  const [isDragging, setIsDragging] = useState(false);

  // CV Analysis hook
  const {
    uploadCV,
    uploadCVText,
    status,
    result,
    error,
    isUploading,
    isPolling,
    progress,
    estimatedTimeRemaining,
    elapsedTime,
    reset: resetAnalysis,
  } = useCVAnalysis();

  // Hook to refetch subscription data after CV upload
  const { refetch: refetchSubscription } = useSubscriptionApi();

  // ============================================
  // LOAD HISTORY FROM API
  // ============================================

  useEffect(() => {
    if (hasFeatures.hasCVHistory) {
      const loadHistory = async () => {
        try {
          // Get token from Supabase (optional - only for authenticated users)
          const { createClient } = await import('@/lib/supabase/client');
          const supabase = createClient();
          const { data: { session } } = await supabase.auth.getSession();

          if (!session?.access_token) {
            // Not authenticated - skip history loading
            return;
          }

          const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/cv-analysis/list`, {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          });

          if (response.ok) {
            const data = await response.json();
            // Parse dates from API (string → Date)
            const parsedAnalyses = (data.analyses || []).map((item: any) => ({
              ...item,
              analyzedAt: item.analyzedAt ? new Date(item.analyzedAt) : new Date(),
            }));
            setHistory(parsedAnalyses);
          }
        } catch (error) {
          console.error('Failed to load CV history:', error);
        }
      };

      loadHistory();
    }
  }, [hasFeatures.hasCVHistory]);

  // Reload history when analysis completes
  useEffect(() => {
    if (status === 'completed' && hasFeatures.hasCVHistory) {
      const reloadHistory = async () => {
        try {
          // Get token from Supabase
          const { createClient } = await import('@/lib/supabase/client');
          const supabase = createClient();
          const { data: { session } } = await supabase.auth.getSession();

          if (!session?.access_token) return;

          const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/cv-analysis/list`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` },
          });

          if (response.ok) {
            const data = await response.json();
            // Parse dates from API (string → Date)
            const parsedAnalyses = (data.analyses || []).map((item: any) => ({
              ...item,
              analyzedAt: item.analyzedAt ? new Date(item.analyzedAt) : new Date(),
            }));
            setHistory(parsedAnalyses);
          }
        } catch (error) {
          console.error('Failed to reload CV history:', error);
        }
      };

      reloadHistory();
    }
  }, [status, hasFeatures.hasCVHistory]);

  // ============================================
  // STEP 1: FILE/TEXT HANDLERS
  // ============================================

  const handleMethodChange = (method: UploadMethod) => {
    setWizardState(prev => ({ ...prev, uploadMethod: method, file: null, cvText: '' }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setWizardState(prev => ({ ...prev, file }));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file && file.name.toLowerCase().endsWith('.pdf')) {
      setWizardState(prev => ({ ...prev, file }));
    } else {
      alert('Seuls les fichiers PDF sont acceptés');
    }
  };

  const handleTextChange = (text: string) => {
    setWizardState(prev => ({ ...prev, cvText: text }));
  };

  const canGoToStep2 =
    (wizardState.uploadMethod === 'file' && wizardState.file !== null) ||
    (wizardState.uploadMethod === 'text' && wizardState.cvText.trim().length > 100);

  const handleStep1Next = () => {
    if (canGoToStep2) {
      setWizardState(prev => ({ ...prev, currentStep: 2 }));
    }
  };

  // ============================================
  // STEP 2: ANALYSIS TYPE HANDLERS
  // ============================================

  const handleAnalysisTypeChange = (type: AnalysisType) => {
    setWizardState(prev => ({ ...prev, analysisType: type }));
  };

  const handleJobDescriptionChange = (text: string) => {
    setWizardState(prev => ({ ...prev, jobDescription: text }));
  };

  const canAnalyze =
    wizardState.analysisType !== null &&
    (wizardState.analysisType === 'global' || wizardState.jobDescription.trim().length > 20);

  const handleStep2Back = () => {
    setWizardState(prev => ({ ...prev, currentStep: 1 }));
  };

  const handleStep2Analyze = async () => {
    if (!canAnalyze) return;

    // Check freemium limit
    if (!canUse('cv_analysis')) {
      openPricingModal('cv_analyses_per_day');
      return;
    }

    // Move to step 3
    setWizardState(prev => ({ ...prev, currentStep: 3 }));

    try {
      const jobDesc = wizardState.analysisType === 'match' ? wizardState.jobDescription : undefined;

      if (wizardState.uploadMethod === 'file' && wizardState.file) {
        // PDF mode
        await uploadCV(wizardState.file, jobDesc, 'fr');
        // Force refresh subscription data to get updated usage from backend
        await refetchSubscription();
      } else if (wizardState.uploadMethod === 'text' && wizardState.cvText) {
        // Text mode
        await uploadCVText(wizardState.cvText, jobDesc, 'fr');
        // Force refresh subscription data to get updated usage from backend
        await refetchSubscription();
      } else {
        throw new Error('Veuillez fournir un fichier PDF ou du texte de CV');
      }
    } catch (err) {
      console.error('Analysis error:', err);
    }
  };

  // ============================================
  // STEP 3: RESULTS HANDLERS
  // ============================================

  const handleReset = () => {
    setWizardState({
      currentStep: 1,
      uploadMethod: 'file',
      file: null,
      cvText: '',
      analysisType: null,
      jobDescription: '',
    });
    resetAnalysis();
    setLoadedHistoryResult(null);
  };

  const handleLoadFromHistory = async (analysis: any) => {
    try {
      // Get token from Supabase (optional)
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      // Fetch full result from API
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/cv-analysis/status/${analysis.cv_id}`, {
        headers,
      });

      if (!response.ok) {
        throw new Error('Failed to load analysis');
      }

      const data = await response.json();

      if (data.status === 'completed' && data.result) {
        // Set loaded result and navigate to step 3
        setLoadedHistoryResult(data.result);
        setWizardState({
          currentStep: 3,
          uploadMethod: 'file',
          file: null,
          cvText: '',
          analysisType: 'global',
          jobDescription: '',
        });
        setShowHistory(false);
      } else {
        alert(`Cette analyse n'est pas encore terminée (status: ${data.status})`);
      }
    } catch (error) {
      console.error('Failed to load from history:', error);
      alert('Erreur lors du chargement de l\'analyse');
    }
  };

  // ============================================
  // RENDER: STEP 1 - UPLOAD
  // ============================================

  const renderStep1 = () => (
    <motion.div
      key="step1"
      variants={stepVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.3 }}
    >
      {/* Method Choice */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => handleMethodChange('file')}
          className={`flex-1 p-4 rounded-lg border-2 transition-all ${
            wizardState.uploadMethod === 'file'
              ? 'border-huntzen-blue bg-blue-50'
              : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <FileText className="w-8 h-8 mx-auto mb-2 text-huntzen-blue" />
          <p className="font-semibold">Fichier PDF</p>
          <p className="text-xs text-gray-600">Recommandé</p>
        </button>

        <button
          onClick={() => handleMethodChange('text')}
          className={`flex-1 p-4 rounded-lg border-2 transition-all ${
            wizardState.uploadMethod === 'text'
              ? 'border-huntzen-blue bg-blue-50'
              : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <FileText className="w-8 h-8 mx-auto mb-2 text-huntzen-blue" />
          <p className="font-semibold">Texte collé</p>
          <p className="text-xs text-gray-600">Rapide</p>
        </button>
      </div>

      {/* File Upload */}
      {wizardState.uploadMethod === 'file' && (
        <>
          {!wizardState.file ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`
                border-2 border-dashed rounded-lg p-12 text-center transition-colors
                ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
              `}
            >
              <Upload className="w-16 h-16 mx-auto mb-4 text-gray-400" />
              <p className="text-lg font-medium mb-2">Glissez-déposez votre CV ici</p>
              <p className="text-gray-500 mb-4">ou</p>
              <label className="inline-block">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <span className="px-6 py-3 bg-huntzen-blue text-white rounded-lg cursor-pointer hover:bg-huntzen-blue/90 transition-colors">
                  Sélectionner un fichier PDF
                </span>
              </label>
            </div>
          ) : (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="w-8 h-8 text-blue-600" />
                  <div>
                    <p className="font-semibold text-gray-900">{wizardState.file.name}</p>
                    <p className="text-sm text-gray-600">
                      {(wizardState.file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setWizardState(prev => ({ ...prev, file: null }))}
                  className="text-sm text-gray-600 hover:text-red-600 underline"
                >
                  Changer
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Text Upload */}
      {wizardState.uploadMethod === 'text' && (
        <div>
          <textarea
            value={wizardState.cvText}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="Collez le contenu de votre CV ici (minimum 100 caractères)..."
            className="w-full h-64 p-4 bg-white text-gray-900 placeholder:text-gray-400 border-2 border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-2">
            {wizardState.cvText.length} caractères (minimum 100)
          </p>
        </div>
      )}

      {/* Next Button */}
      <div className="flex justify-end mt-6">
        <button
          onClick={handleStep1Next}
          disabled={!canGoToStep2}
          className={`px-8 py-3 rounded-lg font-semibold flex items-center gap-2 transition-all ${
            canGoToStep2
              ? 'bg-huntzen-blue text-white hover:bg-huntzen-blue/90'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          Suivant
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </motion.div>
  );

  // ============================================
  // RENDER: STEP 2 - ANALYSIS TYPE
  // ============================================

  const renderStep2 = () => (
    <motion.div
      key="step2"
      variants={stepVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.3 }}
    >
      <h3 className="text-xl font-bold mb-6">Choisissez le type d'analyse</h3>

      {/* Analysis Type Choice */}
      <div className="space-y-4 mb-6">
        <button
          onClick={() => handleAnalysisTypeChange('global')}
          className={`w-full p-6 rounded-lg border-2 text-left transition-all ${
            wizardState.analysisType === 'global'
              ? 'border-huntzen-blue bg-blue-50'
              : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <p className="font-bold text-lg mb-2">📊 Analyse globale (ATS)</p>
          <p className="text-sm text-gray-600">
            Score ATS complet avec analyse du format, structure, mots-clés et lisibilité
          </p>
        </button>

        <button
          onClick={() => handleAnalysisTypeChange('match')}
          className={`w-full p-6 rounded-lg border-2 text-left transition-all ${
            wizardState.analysisType === 'match'
              ? 'border-huntzen-blue bg-blue-50'
              : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <p className="font-bold text-lg mb-2">🎯 Matching avec offre d'emploi</p>
          <p className="text-sm text-gray-600">
            Score de compatibilité avec une offre d'emploi spécifique
          </p>
        </button>
      </div>

      {/* Job Description (if match selected) */}
      {wizardState.analysisType === 'match' && (
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">
            Description du poste <span className="text-red-500">*</span>
          </label>
          <textarea
            value={wizardState.jobDescription}
            onChange={(e) => handleJobDescriptionChange(e.target.value)}
            placeholder="Collez la description du poste ici..."
            className="w-full h-32 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">
            Minimum 20 caractères ({wizardState.jobDescription.length}/20)
          </p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <button
          onClick={handleStep2Back}
          className="px-8 py-3 border-2 border-gray-300 rounded-lg font-semibold flex items-center gap-2 hover:bg-gray-50 transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
          Retour
        </button>

        <button
          onClick={handleStep2Analyze}
          disabled={!canAnalyze}
          className={`px-8 py-3 rounded-lg font-semibold flex items-center gap-2 transition-all ${
            canAnalyze
              ? 'bg-huntzen-blue text-white hover:bg-huntzen-blue/90'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          🚀 Analyser
        </button>
      </div>
    </motion.div>
  );

  // ============================================
  // RENDER: STEP 3 - RESULTS/PROCESSING
  // ============================================

  const renderStep3 = () => {
    // Processing - New visual steps with percentage
    if (isUploading || status === 'pending' || status === 'processing') {
      return (
        <motion.div
          key="step3-processing"
          variants={stepVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.3 }}
          className="py-12"
        >
          {/* Header with Percentage */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-3 mb-3">
              <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
              <div className="text-5xl font-black text-blue-600">{progress}%</div>
            </div>
            <h3 className="text-2xl font-bold mb-2">Analyse en cours...</h3>
            <p className="text-gray-600">
              {isUploading ? 'Téléchargement vers Supabase Storage...' : 'Traitement en cours avec notre IA'}
            </p>
          </div>

          {/* Visual Steps Component */}
          <div className="max-w-2xl mx-auto">
            <ProcessingSteps status={status} elapsedTime={elapsedTime} />
          </div>

          {/* Global Progress Bar */}
          <div className="max-w-md mx-auto mt-6">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </motion.div>
      );
    }

    // Error
    if (status === 'failed' || error) {
      return (
        <motion.div
          key="step3-error"
          variants={stepVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.3 }}
          className="text-center py-12"
        >
          <XCircle className="w-16 h-16 text-red-600 mx-auto mb-6" />
          <h3 className="text-2xl font-bold text-red-900 mb-2">Erreur d'analyse</h3>
          <p className="text-red-700 mb-8">{error || 'Une erreur est survenue'}</p>

          <button
            onClick={handleReset}
            className="px-8 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-all"
          >
            Réessayer
          </button>
        </motion.div>
      );
    }

    // Results (either from new analysis or loaded from history)
    const displayResult = loadedHistoryResult || result;

    if ((status === 'completed' && result) || loadedHistoryResult) {
      const transformedSuggestions: Suggestion[] = (displayResult.improvements || []).map((text: string) => ({
        text,
        impact: 5,
        category: 'other' as const,
        actionable: true
      }));

      return (
        <motion.div
          key="step3-results"
          variants={stepVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.3 }}
        >
          {/* Success Header */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
              <div>
                <h3 className="text-xl font-bold text-green-900">
                  {loadedHistoryResult ? 'Analyse depuis l\'historique' : 'Analyse terminée !'}
                </h3>
                <p className="text-green-700 text-sm">
                  {loadedHistoryResult
                    ? 'Résultats précédemment générés'
                    : `Traité en ${displayResult.processing_time_seconds || elapsedTime} secondes avec Modal Labs`
                  }
                </p>
              </div>
            </div>
          </div>

          {/* Score Ring */}
          <div className="flex justify-center mb-8">
            <ScoreRing score={displayResult.ats_score.overall_score} size={200} />
          </div>

          {/* Results Accordion */}
          <ResultsAccordion
            breakdown={[
              { label: 'Format', value: displayResult.ats_score.formatting_score, max: 100 },
              { label: 'Mots-clés', value: displayResult.ats_score.keywords_score, max: 100 },
              { label: 'Structure', value: displayResult.ats_score.structure_score, max: 100 },
              { label: 'Lisibilité', value: displayResult.ats_score.readability_score, max: 100 },
            ]}
            strengths={displayResult.strengths}
            weaknesses={displayResult.improvements}
            suggestions={transformedSuggestions}
            currentScore={displayResult.ats_score.overall_score}
          />

          {/* CV Info Panel */}
          {displayResult.cv_info && (
            <div className="mt-8">
              <CVInfoPanel cvInfo={displayResult.cv_info} />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-4 mt-8">
            <button
              onClick={handleReset}
              className="flex-1 px-6 py-3 bg-huntzen-blue text-white rounded-lg font-semibold hover:bg-huntzen-blue/90 transition-all"
            >
              Analyser un autre CV
            </button>

            {hasFeatures.hasPDFExport && (
              <button
                onClick={async () => {
                  try {
                    await exportCVAnalysisToPDF(displayResult);
                  } catch (error) {
                    alert('Erreur lors de l\'export PDF');
                    console.error(error);
                  }
                }}
                className="px-6 py-3 border-2 border-huntzen-blue text-huntzen-blue rounded-lg font-semibold hover:bg-blue-50 transition-all"
              >
                📄 Exporter PDF
              </button>
            )}
          </div>
        </motion.div>
      );
    }

    return null;
  };

  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <div>
      {/* Header with History Button */}
      <div className="flex justify-between items-center mb-6">
        <WizardSteps currentStep={wizardState.currentStep} />

        {hasFeatures.hasCVHistory && (
          <button
            onClick={() => setShowHistory(true)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all"
          >
            <History className="w-4 h-4" />
            <span className="text-sm font-medium">Historique ({history.length})</span>
          </button>
        )}
      </div>

      {/* Steps with AnimatePresence */}
      <AnimatePresence mode="wait">
        {wizardState.currentStep === 1 && renderStep1()}
        {wizardState.currentStep === 2 && renderStep2()}
        {wizardState.currentStep === 3 && renderStep3()}
      </AnimatePresence>

      {/* History Drawer */}
      {hasFeatures.hasCVHistory && (
        <CVHistoryDrawer
          open={showHistory}
          onOpenChange={setShowHistory}
          history={history}
          onSelectAnalysis={handleLoadFromHistory}
        />
      )}
    </div>
  );
}
