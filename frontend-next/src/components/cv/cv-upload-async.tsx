/**
 * Async CV Upload Component with Modal Labs integration (S6-6)
 *
 * Features:
 * - Drag & drop file upload
 * - Real-time progress tracking with estimated time
 * - Automatic polling with visual feedback
 * - Error handling with retry capability
 * - Results display with ATS scores
 *
 * @author HuntZen Team
 * @date 2026-01-28
 * @sprint 6 - Ticket S6-6
 */

"use client";

import React, { useState, useCallback } from "react";
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "next/navigation";
import { useCVAnalysis } from "@/hooks/use-cv-analysis";
import { useSubscriptionApi } from "@/hooks/use-subscription-api";
import { type FeatureType, PLAN_LIMITS } from "@/hooks/use-freemium-limits";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

// ============================================
// TYPES
// ============================================

interface CVUploadAsyncProps {
  canUse: (feature: FeatureType) => boolean;
  incrementUsage: (feature: FeatureType) => void;
  openPricingModal: (feature?: string) => void;
}

// ============================================
// COMPONENT
// ============================================

export function CVUploadAsync({
  canUse,
  incrementUsage,
  openPricingModal,
}: CVUploadAsyncProps) {
  const { session, user } = useAuth();
  const router = useRouter();
  const t = useTranslations("cv");

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  // Hook to refetch subscription data after CV upload
  const { refetch: refetchSubscription } = useSubscriptionApi();

  // All hooks must be called before any conditional return (Rules of Hooks)
  const {
    uploadCV,
    status,
    result,
    error,
    isUploading,
    isPolling,
    progress,
    estimatedTimeRemaining,
    elapsedTime,
    reset,
  } = useCVAnalysis(() => {
    // Increment appropriate quota when analysis completes successfully
    const feature: FeatureType = jobDescription ? "matching_score" : "ats_score";
    incrementUsage(feature);
  });

  // ============================================
  // UPLOAD (declared before early return to respect rules-of-hooks)
  // ============================================

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;

    // Check freemium limit (ATS vs Matching)
    const feature: FeatureType = jobDescription ? "matching_score" : "ats_score";
    if (!canUse(feature)) {
      openPricingModal(
        jobDescription ? "matching_scores_per_day" : "ats_scores_per_day",
      );
      return;
    }

    try {
      await uploadCV(selectedFile, jobDescription || undefined, "fr");

      // Force refresh subscription data to get updated usage from backend
      // (Backend increments usage after successful upload, so we fetch fresh data)
      await refetchSubscription();
    } catch (error) {
      console.error("Upload error:", error);
    }
  }, [
    selectedFile,
    jobDescription,
    uploadCV,
    canUse,
    refetchSubscription,
    openPricingModal,
  ]);

  // ============================================
  // RESET
  // ============================================

  const handleReset = () => {
    setSelectedFile(null);
    setJobDescription("");
    reset();
  };

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
            <h4 className="font-bold text-gray-900 mb-4">
              Ce que vous obtenez gratuitement :
            </h4>
            <ul className="space-y-3">
              <li className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <span>
                  <strong>
                    {PLAN_LIMITS.free.ats_scores_per_day} scores ATS gratuits
                  </strong>{" "}
                  par jour
                </span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <span>
                  <strong>
                    {PLAN_LIMITS.free.matching_scores_per_day} matching jobs
                  </strong>{" "}
                  par jour
                </span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <span>
                  <strong>Score ATS détaillé</strong> avec recommandations
                </span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <span>
                  <strong>Analyse de compatibilité</strong> avec offres d'emploi
                </span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <span>
                  <strong>Sauvegarde de vos analyses</strong> et historique
                </span>
              </li>
            </ul>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() =>
                router.push(
                  "/signup?redirectTo=" + encodeURIComponent("/cv-analysis"),
                )
              }
              className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all transform hover:scale-105"
            >
              Créer un compte gratuit
            </button>
            <button
              onClick={() =>
                router.push(
                  "/login?redirectTo=" + encodeURIComponent("/cv-analysis"),
                )
              }
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

  // ============================================
  // FILE SELECTION
  // ============================================

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
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
    if (file && file.name.toLowerCase().endsWith(".pdf")) {
      setSelectedFile(file);
    } else {
      toast.error(t("toasts.pdfOnlyAccepted"));
    }
  };

  // ============================================
  // RENDER: FILE UPLOAD (NO FILE SELECTED)
  // ============================================

  if (!selectedFile && !isUploading && status === "pending" && !result) {
    return (
      <div>
        {/* Drag & Drop Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            border-2 border-dashed rounded-lg p-12 text-center transition-colors
            ${isDragging ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400"}
          `}
        >
          <Upload className="w-16 h-16 mx-auto mb-4 text-gray-400" />
          <p className="text-lg font-medium mb-2">
            Glissez-déposez votre CV ici
          </p>
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

        {/* Job Description (Optional) */}
        <div className="mt-6">
          <label className="block text-sm font-medium mb-2">
            Description du poste (optionnel)
          </label>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder={t("placeholders.pasteJobDescription")}
            className="w-full h-32 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">
            Si fourni, vous obtiendrez également un score de compatibilité avec
            le poste.
          </p>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: FILE SELECTED (READY TO ANALYZE)
  // ============================================

  if (selectedFile && !isUploading && status === "pending" && !result) {
    return (
      <div>
        {/* Selected File Preview */}
        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-8 h-8 text-blue-600" />
              <div>
                <p className="font-semibold text-gray-900">
                  {selectedFile.name}
                </p>
                <p className="text-sm text-gray-600">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>
            <button
              onClick={() => setSelectedFile(null)}
              className="text-sm text-gray-600 hover:text-red-600 underline"
            >
              Changer
            </button>
          </div>
        </div>

        {/* Job Description (Optional) */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">
            Description du poste (optionnel)
          </label>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder={t("placeholders.pasteJobDescription")}
            className="w-full h-32 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">
            Si fourni, vous obtiendrez également un score de compatibilité avec
            le poste.
          </p>
        </div>

        {/* Analyze Button */}
        <div className="flex gap-4">
          <button
            onClick={handleUpload}
            className="flex-1 px-8 py-4 bg-huntzen-blue text-white rounded-lg font-semibold hover:bg-huntzen-blue/90 transition-colors text-lg"
          >
            🚀 Analyser mon CV
          </button>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: UPLOADING / PROCESSING
  // ============================================

  if (isUploading || status === "pending" || status === "processing") {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <FileText className="w-8 h-8 text-blue-600" />
            <div>
              <h3 className="text-lg font-semibold">
                {selectedFile?.name || "CV en cours d'analyse"}
              </h3>
              <p className="text-sm text-gray-500">
                {isUploading ? "Téléchargement..." : "Traitement en cours..."}
              </p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600">Progression</span>
              <span className="font-semibold text-blue-600">{progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className="bg-blue-600 h-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Status Messages */}
          <div className="space-y-3 mb-6">
            <div className="flex items-center gap-2 text-sm">
              {isUploading ? (
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-green-600" />
              )}
              <span>Téléchargement vers Supabase Storage</span>
            </div>

            <div className="flex items-center gap-2 text-sm">
              {status === "pending" ? (
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              ) : status === "processing" ? (
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-green-600" />
              )}
              <span>Extraction du texte</span>
            </div>

            <div className="flex items-center gap-2 text-sm">
              {status === "processing" ? (
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              ) : (
                <Clock className="w-4 h-4 text-gray-400" />
              )}
              <span>Analyse du contenu</span>
            </div>
          </div>

          {/* Time Estimate */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-blue-900">
                  Temps écoulé : {elapsedTime}s
                </p>
                <p className="text-xs text-blue-700">
                  Temps restant estimé : ~{estimatedTimeRemaining}s
                </p>
              </div>
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          </div>

          {/* Info */}
          <p className="text-xs text-gray-500 mt-4 text-center">
            Vous pouvez fermer cette page, les résultats seront sauvegardés.
          </p>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: ERROR
  // ============================================

  if (status === "failed" || error) {
    // Check if error is anonymous rate limit exceeded
    const isAnonymousRateLimitExceeded =
      error === "ANONYMOUS_RATE_LIMIT_EXCEEDED";
    // Check if error is quota exceeded
    const isQuotaExceeded =
      error === "QUOTA_EXCEEDED" || error?.includes("429");

    if (isAnonymousRateLimitExceeded) {
      return (
        <div className="max-w-3xl mx-auto p-6">
          <div className="bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 border-2 border-orange-200 rounded-2xl p-8 shadow-xl">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-orange-500 to-amber-600 rounded-full mb-4 shadow-lg">
                <span className="text-3xl">🔒</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                Limite gratuite atteinte
              </h3>
              <p className="text-gray-600 text-lg">
                Vous avez utilisé votre analyse CV gratuite du jour. Créez un
                compte pour des analyses illimitées !
              </p>
            </div>

            {/* Benefits of signing up */}
            <div className="bg-white rounded-xl p-6 mb-6">
              <h4 className="font-bold text-gray-900 mb-4">
                En créant un compte gratuit :
              </h4>
              <ul className="space-y-3">
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <span>
                    <strong>
                      {PLAN_LIMITS.free.ats_scores_per_day} analyses ATS gratuites
                    </strong>{" "}
                    par jour
                  </span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <span>
                    <strong>
                      {PLAN_LIMITS.free.matching_scores_per_day} scores compatibles
                    </strong>{" "}
                    par jour
                  </span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <span>Sauvegarde de vos analyses</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <span>Accès à toutes les fonctionnalités gratuites</span>
                </li>
              </ul>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => router.push("/signup")}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all transform hover:scale-105"
              >
                Créer un compte gratuit
              </button>
              <button
                onClick={() => router.push("/pricing")}
                className="flex-1 px-6 py-3 bg-white text-gray-700 font-semibold rounded-xl border-2 border-gray-300 hover:border-orange-500 transition-all"
              >
                Voir les plans payants
              </button>
            </div>

            {/* Reset button */}
            <div className="mt-6 text-center">
              <button
                onClick={handleReset}
                className="text-gray-600 hover:text-gray-900 text-sm font-medium"
              >
                ← Retour
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (isQuotaExceeded) {
      return (
        <div className="max-w-3xl mx-auto p-6">
          <div className="bg-gradient-to-br from-violet-50 via-purple-50 to-blue-50 border-2 border-violet-200 rounded-2xl p-8 shadow-xl">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-violet-500 to-purple-600 rounded-full mb-4 shadow-lg">
                <span className="text-3xl">🚀</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                Quota d'analyses gratuit épuisé
              </h3>
              <p className="text-gray-600 text-lg">
                Passez à un plan payant pour continuer vos analyses de CV sans
                limite
              </p>
            </div>

            {/* Plans comparison */}
            <div className="grid md:grid-cols-3 gap-4 mb-6">
              {/* Starter */}
              <div className="bg-white rounded-xl p-5 border-2 border-blue-200 hover:border-blue-400 transition-all hover:shadow-lg">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                    <span className="text-xl">⚡</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900">Starter</h4>
                    <p className="text-sm text-gray-600">8,90€/mois</p>
                  </div>
                </div>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <span>
                      Scores ATS <strong>illimités</strong>
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <span>
                      Scores Matching <strong>illimités</strong>
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <span>Coach IA 20 messages/jour</span>
                  </li>
                </ul>
              </div>

              {/* Pro */}
              <div className="bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl p-5 text-white shadow-xl transform scale-105 relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-400 text-gray-900 text-xs font-bold px-3 py-1 rounded-full">
                  POPULAIRE
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                    <span className="text-xl">✨</span>
                  </div>
                  <div>
                    <h4 className="font-bold">Pro</h4>
                    <p className="text-sm text-white/80">13,90€/mois</p>
                  </div>
                </div>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    <span>
                      Tout Recherche Active + <strong>Coach illimité</strong>
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    <span>
                      <strong>Export PDF</strong> professionnel
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    <span>
                      <strong>Simulations d'entretien</strong> IA
                    </span>
                  </li>
                </ul>
              </div>

              {/* Premium */}
              <div className="bg-white rounded-xl p-5 border-2 border-amber-200 hover:border-amber-400 transition-all hover:shadow-lg">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg flex items-center justify-center">
                    <span className="text-xl">👑</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900">Premium</h4>
                    <p className="text-sm text-gray-600">19,90€/mois</p>
                  </div>
                </div>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <span>
                      Tout Accélérateur + <strong>Historique illimité</strong>
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <span>
                      <strong>Alertes email</strong> instantanées
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex gap-4">
              <button
                onClick={() => openPricingModal("cv_analyses_per_day")}
                className="flex-1 px-8 py-4 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl font-bold text-lg hover:from-violet-600 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                🚀 Voir les plans
              </button>
              <button
                onClick={handleReset}
                className="px-6 py-4 bg-white text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors border-2 border-gray-200"
              >
                Retour
              </button>
            </div>

            {/* Trust indicators */}
            <div className="mt-6 flex items-center justify-center gap-6 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span>Sans engagement</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span>Sans engagement, annulation a tout moment</span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Regular error display
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-8">
          <div className="flex items-center gap-3 mb-4">
            <XCircle className="w-8 h-8 text-red-600" />
            <h3 className="text-lg font-semibold text-red-900">
              Erreur d'analyse
            </h3>
          </div>

          <p className="text-red-700 mb-6">
            {error || "Une erreur est survenue lors de l'analyse du CV"}
          </p>

          <button
            onClick={handleReset}
            className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: COMPLETED (RESULTS)
  // ============================================

  if (status === "completed" && result) {
    const { ats_score, strengths, improvements, job_match_score } = result;

    return (
      <div className="max-w-4xl mx-auto p-6">
        {/* Success Header */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
            <h3 className="text-xl font-bold text-green-900">
              Analyse terminée !
            </h3>
          </div>
        </div>

        {/* ATS Score */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h4 className="text-lg font-semibold mb-4">Score ATS</h4>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <ScoreCard label="Score Global" score={ats_score.overall_score} />
            <ScoreCard label="Formatage" score={ats_score.formatting_score} />
            <ScoreCard label="Mots-clés" score={ats_score.keywords_score} />
            <ScoreCard label="Structure" score={ats_score.structure_score} />
            <ScoreCard label="Lisibilité" score={ats_score.readability_score} />
            {job_match_score && (
              <ScoreCard
                label="Compatibilité Job"
                score={job_match_score}
                highlight
              />
            )}
          </div>
        </div>

        {/* Strengths */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h4 className="text-lg font-semibold mb-4 text-green-700">
            Points forts
          </h4>
          <ul className="space-y-2">
            {strengths.map((strength, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <span>{strength}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Improvements */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h4 className="text-lg font-semibold mb-4 text-orange-700">
            Suggestions d'amélioration
          </h4>
          <ul className="space-y-2">
            {improvements.map((improvement, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-orange-600 mt-0.5 flex-shrink-0">→</span>
                <span>{improvement}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <button
            onClick={handleReset}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Analyser un autre CV
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// ============================================
// SCORE CARD COMPONENT
// ============================================

interface ScoreCardProps {
  label: string;
  score: number;
  highlight?: boolean;
}

function ScoreCard({ label, score, highlight }: ScoreCardProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600 bg-green-100";
    if (score >= 60) return "text-yellow-600 bg-yellow-100";
    return "text-red-600 bg-red-100";
  };

  return (
    <div
      className={`p-4 rounded-lg border ${highlight ? "border-blue-300 bg-blue-50" : "border-gray-200"}`}
    >
      <p className="text-sm text-gray-600 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${getScoreColor(score).split(" ")[0]}`}>
        {score}
      </p>
      <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
        <div
          className={`h-full rounded-full ${getScoreColor(score).split(" ")[1]}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}
