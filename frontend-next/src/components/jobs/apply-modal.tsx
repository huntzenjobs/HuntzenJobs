/**
 * ApplyModal - Génère automatiquement un CV adapté + Lettre de motivation
 * pour une offre d'emploi spécifique.
 *
 * Flow :
 *   Step 1 → Upload CV + confirmation offre
 *   Step 2 → Génération en cours (appels API backend)
 *   Step 3 → Résultats + téléchargement PDF
 */

"use client";

import { useState, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Upload,
  FileText,
  CheckCircle2,
  Download,
  ExternalLink,
  X,
  Loader2,
  Building,
  MapPin,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Job } from "@/lib/api/huntzen-client";
import { useDocuments } from "@/hooks/use-documents";

// ============================================================================
// TYPES
// ============================================================================

interface ApplyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job;
}

type Step = "upload" | "generating" | "results";

interface GenerationResult {
  cvPdfBlob: Blob;
  lmPdfBlob: Blob;
  matchScore?: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "";

const ACCEPTED_EXTENSIONS = [".pdf", ".docx"];
const MAX_SIZE_MB = 10;

// ============================================================================
// HELPERS
// ============================================================================

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ApplyModal({ open, onOpenChange, job }: ApplyModalProps) {
  const [step, setStep] = useState<Step>("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [language, setLanguage] = useState<"fr" | "en">("fr");
  const [isDragging, setIsDragging] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [generatingLabel, setGeneratingLabel] = useState("");
  const [markedApplied, setMarkedApplied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = useTranslations("applyModal");
  const { saveDocument } = useDocuments();

  // Reset state when modal closes
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setStep("upload");
      setSelectedFile(null);
      setResult(null);
      setGeneratingLabel("");
      setMarkedApplied(false);
    }
    onOpenChange(open);
  };

  // ── File selection ──────────────────────────────────────────────────────────

  const validateFile = (file: File): string | null => {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return `Format non supporté. Utilisez un fichier PDF ou DOCX.`;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return `Fichier trop volumineux (max ${MAX_SIZE_MB} Mo).`;
    }
    return null;
  };

  const handleFileSelect = useCallback((file: File) => {
    const error = validateFile(file);
    if (error) {
      toast.error(error);
      return;
    }
    setSelectedFile(file);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect],
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  // ── Generation ─────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!selectedFile) {
      toast.error("Veuillez sélectionner votre CV avant de continuer.");
      return;
    }

    setStep("generating");

    try {
      // Step 1 — Adapter le CV au poste (retourne cv_data JSON)
      setGeneratingLabel(t("processingStep1"));

      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("job_description", job.description || job.title);
      formData.append("language", language);
      formData.append("output_format", "json");

      const adaptResponse = await fetch(
        `${BACKEND_URL}/api/cv-adapter/adapt/upload`,
        { method: "POST", body: formData },
      );

      if (!adaptResponse.ok) {
        const err = await adaptResponse.json().catch(() => ({}));
        throw new Error(err.detail || "Erreur lors de l'adaptation du CV");
      }

      const adaptData = await adaptResponse.json();
      const cvData = adaptData.cv_data;
      const matchScore = adaptData.match_score;

      if (!cvData) {
        throw new Error("Impossible d'extraire les données du CV");
      }

      // Step 2 — Générer CV PDF + LM PDF en parallèle
      setGeneratingLabel(t("processingStep2"));

      const [cvPdfResponse, lmPdfResponse] = await Promise.all([
        // CV adapté en PDF
        fetch(`${BACKEND_URL}/api/cv-adapter/pdf`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cv_data: cvData,
            template: "ats",
            language,
          }),
        }),
        // Lettre de motivation en PDF
        fetch(`${BACKEND_URL}/api/cv-adapter/generate-cover-letter`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cv_data: cvData,
            job_description: job.description || job.title,
            language,
            company_name: job.company || "",
          }),
        }),
      ]);

      if (!cvPdfResponse.ok) {
        const err = await cvPdfResponse.json().catch(() => ({}));
        throw new Error(err.detail || "Erreur lors de la génération du CV PDF");
      }
      if (!lmPdfResponse.ok) {
        const err = await lmPdfResponse.json().catch(() => ({}));
        throw new Error(
          err.detail ||
            "Erreur lors de la génération de la lettre de motivation",
        );
      }

      const [cvPdfBlob, lmPdfBlob] = await Promise.all([
        cvPdfResponse.blob(),
        lmPdfResponse.blob(),
      ]);

      setResult({ cvPdfBlob, lmPdfBlob, matchScore });
      setStep("results");

      // Persist PDFs to Supabase Storage in background (non-blocking)
      saveDocument({
        jobTitle: job.title,
        company: job.company ?? "",
        matchScore:
          matchScore != null ? Math.round(matchScore * 100) : undefined,
        cvData: cvData as Record<string, unknown>,
        cvPdfBlob,
        lmPdfBlob,
        language,
        jobUrl: job.url ?? undefined,
      }).catch(() => {
        // Silent fail — PDFs are still downloadable locally
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Une erreur est survenue";
      toast.error(message);
      setStep("upload");
      setGeneratingLabel("");
    }
  };

  // ── Download handlers ──────────────────────────────────────────────────────

  const handleDownloadCV = () => {
    if (!result) return;
    const companySlug = (job.company || "offre").replace(/[^a-zA-Z0-9]/g, "_");
    downloadBlob(result.cvPdfBlob, `CV_adapté_${companySlug}.pdf`);
  };

  const handleDownloadLM = () => {
    if (!result) return;
    const companySlug = (job.company || "offre").replace(/[^a-zA-Z0-9]/g, "_");
    downloadBlob(result.lmPdfBlob, `Lettre_Motivation_${companySlug}.pdf`);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900">
            <Sparkles className="h-5 w-5 text-[#00D9FF]" />
            {t("title")}
          </DialogTitle>
          <DialogDescription className="text-slate-500">
            Génération automatique de votre CV adapté + lettre de motivation
          </DialogDescription>
        </DialogHeader>

        {/* Job summary */}
        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
          <p className="font-semibold text-slate-900 text-sm line-clamp-1">
            {job.title}
          </p>
          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
            {job.company && (
              <span className="flex items-center gap-1">
                <Building className="h-3 w-3" />
                {job.company}
              </span>
            )}
            {job.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {job.location}
              </span>
            )}
          </div>
        </div>

        {/* ── STEP 1 : Upload ── */}
        {step === "upload" && (
          <div className="space-y-4">
            {/* Upload zone */}
            <div
              className={cn(
                "relative rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors",
                isDragging
                  ? "border-[#00D9FF] bg-[#00D9FF]/5"
                  : selectedFile
                    ? "border-green-400 bg-green-50"
                    : "border-slate-200 hover:border-[#00D9FF]/50 hover:bg-slate-50",
              )}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx"
                className="hidden"
                onChange={handleInputChange}
              />

              {selectedFile ? (
                <div className="flex items-center justify-center gap-3">
                  <FileText className="h-8 w-8 text-green-500 flex-shrink-0" />
                  <div className="text-left">
                    <p className="font-medium text-slate-900 text-sm">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {(selectedFile.size / 1024 / 1024).toFixed(1)} Mo
                    </p>
                  </div>
                  <button
                    className="ml-auto p-1 rounded-full hover:bg-slate-200 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                    }}
                  >
                    <X className="h-4 w-4 text-slate-500" />
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-8 w-8 text-slate-300 mx-auto" />
                  <p className="text-sm font-medium text-slate-700">
                    {t("uploadInstruction")}
                  </p>
                  <p className="text-xs text-slate-400">
                    PDF ou DOCX · Max {MAX_SIZE_MB} Mo
                  </p>
                </div>
              )}
            </div>

            {/* Language selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">
                {t("selectLanguage")}
              </span>
              <button
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                  language === "fr"
                    ? "bg-[#0D1F3C] text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                )}
                onClick={() => setLanguage("fr")}
              >
                {t("languageFr")}
              </button>
              <button
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                  language === "en"
                    ? "bg-[#0D1F3C] text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                )}
                onClick={() => setLanguage("en")}
              >
                {t("languageEn")}
              </button>
            </div>

            <Button
              className="w-full bg-gradient-to-r from-[#00D9FF] to-blue-600 hover:from-[#00D9FF]/90 hover:to-blue-700 text-white font-semibold"
              size="lg"
              onClick={handleGenerate}
              disabled={!selectedFile}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {t("generateButton")}
            </Button>

            <p className="text-center text-xs text-slate-400">
              L'IA adapte votre CV aux mots-clés du poste et rédige une lettre
              personnalisée
            </p>
          </div>
        )}

        {/* ── STEP 2 : Generating ── */}
        {step === "generating" && (
          <div className="flex flex-col items-center gap-6 py-8">
            <div className="relative">
              <div className="h-16 w-16 rounded-full border-4 border-slate-100 border-t-[#00D9FF] animate-spin" />
              <Sparkles className="absolute inset-0 m-auto h-6 w-6 text-[#00D9FF]" />
            </div>
            <div className="text-center space-y-1">
              <p className="font-semibold text-slate-900">
                Génération en cours...
              </p>
              <p className="text-sm text-slate-500">{generatingLabel}</p>
            </div>
            <div className="w-full space-y-2">
              {[
                t("processingStep1"),
                t("processingStep2"),
                t("processingStep3"),
                t("processingStep4"),
              ].map((label, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs text-slate-500"
                >
                  <Loader2 className="h-3 w-3 animate-spin text-[#00D9FF]" />
                  {label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP 3 : Results ── */}
        {step === "results" && result && (
          <div className="space-y-4">
            {/* Match score */}
            {result.matchScore !== undefined && (
              <div className="flex items-center gap-3 rounded-lg bg-green-50 border border-green-200 p-3">
                <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-800">
                    Score de matching : {Math.round(result.matchScore * 100)}%
                  </p>
                  <p className="text-xs text-green-600">
                    Votre CV a été optimisé pour cette offre
                  </p>
                </div>
              </div>
            )}

            {/* Download buttons */}
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full border-[#0D1F3C] text-[#0D1F3C] hover:bg-[#0D1F3C] hover:text-white transition-colors"
                size="lg"
                onClick={handleDownloadCV}
              >
                <Download className="mr-2 h-4 w-4" />
                {t("downloadCv")}
                <Badge variant="secondary" className="ml-auto text-xs">
                  PDF
                </Badge>
              </Button>

              <Button
                variant="outline"
                className="w-full border-[#0D1F3C] text-[#0D1F3C] hover:bg-[#0D1F3C] hover:text-white transition-colors"
                size="lg"
                onClick={handleDownloadLM}
              >
                <Download className="mr-2 h-4 w-4" />
                {t("downloadCoverLetter")}
                <Badge variant="secondary" className="ml-auto text-xs">
                  PDF
                </Badge>
              </Button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-100" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-3 text-xs text-slate-400">
                  puis
                </span>
              </div>
            </div>

            {/* External apply link */}
            {job.url && (
              <Button
                asChild
                className="w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700"
                size="lg"
              >
                <a href={job.url} target="_blank" rel="noopener noreferrer">
                  Postuler sur le site de l'offre
                  <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            )}

            {/* Mark as applied */}
            <Button
              variant="outline"
              size="sm"
              className="w-full text-sm"
              disabled={markedApplied}
              onClick={() => {
                setMarkedApplied(true);
                toast.success("Candidature marquée comme envoyée !");
              }}
            >
              {markedApplied ? (
                <>
                  <CheckCircle2 className="mr-2 h-3.5 w-3.5 text-green-500" />
                  Candidature enregistrée
                </>
              ) : (
                "Marquer comme postulé"
              )}
            </Button>

            {/* Retry */}
            <button
              className="w-full text-xs text-slate-400 hover:text-slate-600 text-center transition-colors"
              onClick={() => {
                setStep("upload");
                setResult(null);
              }}
            >
              {t("retryButton")}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
