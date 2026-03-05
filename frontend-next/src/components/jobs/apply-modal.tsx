/**
 * ApplyModal - Génère automatiquement un CV adapté + Lettre de motivation
 * pour une offre d'emploi spécifique.
 *
 * Flow A (upload) :
 *   Step 1 → Upload CV + confirmation offre
 *   Step 2 → Génération en cours (appels API backend)
 *   Step 3 → Résultats + téléchargement PDF
 *
 * Flow B (profil sauvegardé) :
 *   Step 1 → Sélection profil sauvegardé (ou création via wizard)
 *   Step 2 → Génération en cours (cv_data sérialisé → /adapt → PDFs)
 *   Step 3 → Résultats + téléchargement PDF
 */

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
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
  User,
  Plus,
  Check,
  RefreshCw,
  Pencil,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Job } from "@/lib/api/huntzen-client";
import { useDocuments } from "@/hooks/use-documents";
import { useCvProfiles, type CvProfile } from "@/hooks/use-cv-profiles";
import { CvBuilderWizard } from "@/components/cv-builder/cv-builder-wizard";
import type { CvData } from "@/components/cv-builder/types";

// ============================================================================
// TYPES
// ============================================================================

interface ApplyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job;
  /** Full job description fetched from external source (may differ from job.description snippet) */
  jobDescription?: string;
  /** Supabase saved_jobs.id — links generated document to the saved job row */
  savedJobId?: string;
  /** Pre-filled result to start in "results" step (e.g. from CV analysis wizard) */
  initialResult?: GenerationResult;
  /** Pre-filled cvData to enable editing without re-generating (e.g. from CV analysis wizard) */
  initialCvData?: Record<string, unknown>;
  /** Initial step to start at (default: "upload") */
  initialStep?: Step;
  /** Pre-filled match score */
  initialMatchScore?: number;
  /** Initial language (default: "fr") */
  initialLanguage?: "fr" | "en";
}

type Step = "upload" | "generating" | "preview" | "results";
type CvSource = "upload" | "profile";

export interface GenerationResult {
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

/**
 * Serialize cv_data profile to readable text for the /adapt endpoint.
 * The LLM can process this structured text format as a CV.
 */
function cvDataToText(cv: CvData): string {
  const lines: string[] = [];
  const p = cv.personal_info;

  lines.push(`Nom : ${p.name}`);
  if (p.title) lines.push(`Titre : ${p.title}`);
  if (p.email) lines.push(`Email : ${p.email}`);
  if (p.phone) lines.push(`Téléphone : ${p.phone}`);
  if (p.location) lines.push(`Localisation : ${p.location}`);
  if (p.linkedin) lines.push(`LinkedIn : ${p.linkedin}`);

  if (cv.summary) {
    lines.push(`\nRésumé professionnel :\n${cv.summary}`);
  }

  if (cv.experiences.length > 0) {
    lines.push("\nExpériences professionnelles :");
    for (const exp of cv.experiences) {
      const dates = exp.current
        ? `${exp.start_date} — présent`
        : `${exp.start_date}${exp.end_date ? ` — ${exp.end_date}` : ""}`;
      lines.push(`\n${exp.title} chez ${exp.company} (${dates})`);
      if (exp.location) lines.push(`Lieu : ${exp.location}`);
      if (exp.description) lines.push(exp.description);
    }
  }

  if (cv.education.length > 0) {
    lines.push("\nFormation :");
    for (const edu of cv.education) {
      lines.push(
        `${edu.degree}${edu.field ? ` en ${edu.field}` : ""} — ${edu.institution}${edu.year ? ` (${edu.year})` : ""}`,
      );
    }
  }

  if (cv.skills) {
    if (cv.skills.technical?.length) {
      lines.push(
        `\nCompétences techniques : ${cv.skills.technical.join(", ")}`,
      );
    }
    if (cv.skills.soft?.length) {
      lines.push(`Soft skills : ${cv.skills.soft.join(", ")}`);
    }
    if (cv.skills.languages?.length) {
      lines.push(
        `Langues : ${cv.skills.languages.map((l) => `${l.language} (${l.level})`).join(", ")}`,
      );
    }
  }

  if (cv.certifications?.length) {
    lines.push(
      `\nCertifications : ${cv.certifications.map((c) => c.name).join(", ")}`,
    );
  }

  return lines.join("\n");
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ApplyModal({
  open,
  onOpenChange,
  job,
  jobDescription,
  savedJobId,
  initialResult,
  initialCvData,
  initialStep,
  initialMatchScore,
  initialLanguage,
}: ApplyModalProps) {
  const [step, setStep] = useState<Step>(initialStep ?? "upload");
  const [cvSource, setCvSource] = useState<CvSource>("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<CvProfile | null>(
    null,
  );
  const [wizardOpen, setWizardOpen] = useState(false);
  const [language, setLanguage] = useState<"fr" | "en">(
    initialLanguage ?? "fr",
  );
  const [isDragging, setIsDragging] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(
    initialResult ?? null,
  );
  const [generatingLabel, setGeneratingLabel] = useState("");
  const [markedApplied, setMarkedApplied] = useState(false);
  const [pendingCvData, setPendingCvData] = useState<Record<
    string,
    unknown
  > | null>(initialCvData ?? null);
  const [pendingMatchScore, setPendingMatchScore] = useState<
    number | undefined
  >(initialMatchScore);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = useTranslations("applyModal");
  const { saveDocument } = useDocuments();
  const {
    profiles,
    loading: profilesLoading,
    fetchProfiles,
    saveProfile,
  } = useCvProfiles();

  // Load profiles when switching to profile tab
  useEffect(() => {
    if (cvSource === "profile" && profiles.length === 0) {
      fetchProfiles();
    }
  }, [cvSource, profiles.length, fetchProfiles]);

  // Reset state when modal closes
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setStep("upload");
      setSelectedFile(null);
      setSelectedProfile(null);
      setCvSource("upload");
      setResult(null);
      setGeneratingLabel("");
      setMarkedApplied(false);
      setPendingCvData(null);
      setPendingMatchScore(undefined);
      setPreviewHtml("");
      setPreviewLoading(false);
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

  // ── Generation from uploaded file ───────────────────────────────────────────

  const generateFromFile = async () => {
    if (!selectedFile) return;

    setStep("generating");

    try {
      setGeneratingLabel(t("processingStep1"));

      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append(
        "job_description",
        jobDescription || job.description || job.title,
      );
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

      if (!cvData) throw new Error("Impossible d'extraire les données du CV");

      setPendingCvData(cvData);
      setPendingMatchScore(matchScore);
      await generatePdfsAndSave(cvData, matchScore);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Une erreur est survenue";
      toast.error(message);
      setStep("upload");
      setGeneratingLabel("");
    }
  };

  // ── Generation from saved profile ───────────────────────────────────────────

  const generateFromProfile = async () => {
    if (!selectedProfile) return;

    setStep("generating");

    try {
      setGeneratingLabel("Adaptation de votre profil au poste...");

      // Serialize cv_data to text for the /adapt endpoint
      const cvText = cvDataToText(selectedProfile.cv_data as unknown as CvData);

      const adaptFormData = new FormData();
      adaptFormData.append("cv_text", cvText);
      adaptFormData.append(
        "job_description",
        jobDescription || job.description || job.title,
      );
      adaptFormData.append("language", language);
      adaptFormData.append("template", "ats");

      const adaptResponse = await fetch(`${BACKEND_URL}/api/cv-adapter/adapt`, {
        method: "POST",
        body: adaptFormData,
      });

      if (!adaptResponse.ok) {
        const err = await adaptResponse.json().catch(() => ({}));
        throw new Error(err.detail || "Erreur lors de l'adaptation du CV");
      }

      const adaptData = await adaptResponse.json();
      const cvData = adaptData.cv_data;
      const matchScore = adaptData.match_score;

      if (!cvData) throw new Error("Impossible d'adapter le profil");

      setPendingCvData(cvData);
      setPendingMatchScore(matchScore);
      await generatePdfsAndSave(cvData, matchScore);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Une erreur est survenue";
      toast.error(message);
      setStep("upload");
      setGeneratingLabel("");
    }
  };

  // ── Shared PDF generation + save ────────────────────────────────────────────

  const generatePdfsAndSave = async (
    cvData: Record<string, unknown>,
    matchScore?: number,
  ) => {
    setGeneratingLabel(t("processingStep2"));

    const [cvPdfResponse, lmPdfResponse] = await Promise.all([
      fetch(`${BACKEND_URL}/api/cv-adapter/generate-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cv_data: cvData, template: "ats", language }),
      }),
      fetch(`${BACKEND_URL}/api/cv-adapter/generate-cover-letter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cv_data: cvData,
          job_description: jobDescription || job.description || job.title,
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
        err.detail || "Erreur lors de la génération de la lettre de motivation",
      );
    }

    const [cvPdfBlob, lmPdfBlob] = await Promise.all([
      cvPdfResponse.blob(),
      lmPdfResponse.blob(),
    ]);

    setResult({ cvPdfBlob, lmPdfBlob, matchScore });
    setStep("results");

    saveDocument({
      jobTitle: job.title,
      company: job.company ?? "",
      matchScore: matchScore != null ? Math.round(matchScore * 100) : undefined,
      cvData: cvData as Record<string, unknown>,
      cvPdfBlob,
      lmPdfBlob,
      language,
      jobUrl: job.url ?? undefined,
      savedJobId: savedJobId ?? undefined,
    }).catch(() => {});
  };

  // ── Main generate handler ────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (cvSource === "upload") {
      if (!selectedFile) {
        toast.error("Veuillez sélectionner votre CV avant de continuer.");
        return;
      }
      await generateFromFile();
    } else {
      if (!selectedProfile) {
        toast.error("Veuillez sélectionner un profil sauvegardé.");
        return;
      }
      await generateFromProfile();
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

  // ── Preview HTML fetch ─────────────────────────────────────────────────────

  const fetchPreviewHtml = async (data: Record<string, unknown>) => {
    setPreviewLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/cv-adapter/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cv_data: data, template: "ats", language }),
      });
      if (res.ok) setPreviewHtml(await res.text());
      else toast.error("Impossible de charger la prévisualisation");
    } catch {
      toast.error("Erreur lors de la prévisualisation");
    } finally {
      setPreviewLoading(false);
    }
  };

  // ── CV Builder wizard save ─────────────────────────────────────────────────

  const handleWizardSave = async (name: string, data: CvData) => {
    const saved = await saveProfile(name, data);
    if (saved) {
      setSelectedProfile(saved);
      toast.success("Profil sauvegardé !");
    } else {
      toast.error("Erreur lors de la sauvegarde du profil.");
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const canGenerate =
    cvSource === "upload" ? !!selectedFile : !!selectedProfile;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          style={
            step === "preview"
              ? {
                  width: "min(92vw, 1400px)",
                  height: "min(88vh, 1000px)",
                  maxWidth: "unset",
                  maxHeight: "unset",
                  resize: "both",
                  overflow: "auto",
                  minWidth: "min(92vw, 520px)",
                  minHeight: "400px",
                }
              : {
                  width: "min(95vw, 640px)",
                  maxWidth: "unset",
                  maxHeight: "90vh",
                  overflowY: "auto",
                }
          }
          className="bg-white"
        >
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

          {/* ── STEP 1 : Source selection ── */}
          {step === "upload" && (
            <div className="space-y-4">
              {/* Source tabs */}
              <div className="flex rounded-lg border border-slate-200 p-1 gap-1">
                <button
                  onClick={() => setCvSource("upload")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 md:gap-2 rounded-md px-2 md:px-3 py-2.5 text-xs md:text-sm font-medium transition-colors min-h-[44px]",
                    cvSource === "upload"
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100",
                  )}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Importer un fichier
                </button>
                <button
                  onClick={() => setCvSource("profile")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 md:gap-2 rounded-md px-2 md:px-3 py-2.5 text-xs md:text-sm font-medium transition-colors min-h-[44px]",
                    cvSource === "profile"
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100",
                  )}
                >
                  <User className="h-3.5 w-3.5" />
                  Profil sauvegardé
                </button>
              </div>

              {/* Upload zone */}
              {cvSource === "upload" && (
                <div
                  className={cn(
                    "relative rounded-xl border-2 border-dashed p-4 md:p-6 text-center cursor-pointer transition-colors",
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
              )}

              {/* Profile selection */}
              {cvSource === "profile" && (
                <div className="space-y-2">
                  {profilesLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                    </div>
                  ) : profiles.length === 0 ? (
                    <div className="rounded-xl border-2 border-dashed border-slate-200 p-4 md:p-6 text-center">
                      <User className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-600 font-medium mb-1">
                        Aucun profil sauvegardé
                      </p>
                      <p className="text-xs text-slate-400 mb-4">
                        Créez votre profil CV une fois, utilisez-le pour toutes
                        vos candidatures
                      </p>
                      <Button
                        size="sm"
                        onClick={() => setWizardOpen(true)}
                        className="bg-[#00D9FF] text-gray-900 hover:bg-[#00b8d9]"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                        Créer mon profil CV
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                        {profiles.map((profile) => (
                          <button
                            key={profile.id}
                            onClick={() =>
                              setSelectedProfile(
                                selectedProfile?.id === profile.id
                                  ? null
                                  : profile,
                              )
                            }
                            className={cn(
                              "w-full text-left rounded-lg border p-3 transition-colors",
                              selectedProfile?.id === profile.id
                                ? "border-[#00D9FF] bg-[#00D9FF]/5"
                                : "border-slate-200 hover:border-slate-300 bg-white",
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <div className="min-w-0">
                                <p className="font-medium text-sm text-slate-900 truncate">
                                  {profile.name}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {profile.cv_data?.personal_info?.name || ""}
                                </p>
                              </div>
                              {selectedProfile?.id === profile.id && (
                                <div className="shrink-0 ml-2 rounded-full bg-[#00D9FF] p-0.5">
                                  <Check className="h-3 w-3 text-gray-900" />
                                </div>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full border-dashed text-xs"
                        onClick={() => setWizardOpen(true)}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                        Créer un nouveau profil
                      </Button>
                    </>
                  )}
                </div>
              )}

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
                disabled={!canGenerate}
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

          {/* ── STEP 3 : Preview & Edit ── */}
          {step === "preview" && pendingCvData && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left: editable form */}
                <div className="space-y-2 max-h-[320px] md:max-h-[calc(88vh-220px)] overflow-y-auto pr-1">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Modifier le contenu
                  </p>
                  <Accordion
                    type="multiple"
                    defaultValue={["personal", "summary", "experiences"]}
                  >
                    {/* Personal info */}
                    <AccordionItem value="personal">
                      <AccordionTrigger className="text-sm font-medium py-2">
                        Informations personnelles
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2">
                          {(
                            [
                              { key: "name", label: "Nom complet" },
                              { key: "title", label: "Titre / Poste visé" },
                              { key: "phone", label: "Téléphone" },
                              { key: "email", label: "Email" },
                              { key: "location", label: "Ville / Pays" },
                              { key: "linkedin", label: "LinkedIn" },
                              { key: "github", label: "GitHub" },
                            ] as { key: string; label: string }[]
                          ).map(({ key, label }) => (
                            <div key={key}>
                              <label className="text-xs text-slate-500">
                                {label}
                              </label>
                              <input
                                className="w-full border border-slate-200 rounded px-2 py-1 text-sm mt-0.5"
                                value={
                                  ((pendingCvData as any)?.personal_info?.[
                                    key
                                  ] as string) ?? ""
                                }
                                onChange={(e) =>
                                  setPendingCvData((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          personal_info: {
                                            ...(prev.personal_info as any),
                                            [key]: e.target.value,
                                          },
                                        }
                                      : prev,
                                  )
                                }
                              />
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    {/* Summary */}
                    <AccordionItem value="summary">
                      <AccordionTrigger className="text-sm font-medium py-2">
                        Résumé / Profil
                      </AccordionTrigger>
                      <AccordionContent>
                        <textarea
                          className="w-full border border-slate-200 rounded px-2 py-1 text-sm min-h-[80px] resize-y"
                          value={
                            ((pendingCvData as any)?.summary as string) ?? ""
                          }
                          onChange={(e) =>
                            setPendingCvData((prev) =>
                              prev
                                ? { ...prev, summary: e.target.value }
                                : prev,
                            )
                          }
                        />
                      </AccordionContent>
                    </AccordionItem>

                    {/* Experiences */}
                    {Array.isArray((pendingCvData as any)?.experiences) && (
                      <AccordionItem value="experiences">
                        <AccordionTrigger className="text-sm font-medium py-2">
                          Expériences (
                          {(pendingCvData as any).experiences.length})
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3">
                            {((pendingCvData as any).experiences as any[]).map(
                              (exp, i) => (
                                <div
                                  key={i}
                                  className="rounded border border-slate-100 p-2 space-y-2"
                                >
                                  <div className="grid grid-cols-2 gap-2">
                                    {(
                                      [
                                        { key: "title", label: "Poste" },
                                        { key: "company", label: "Entreprise" },
                                        { key: "start_date", label: "Début" },
                                        { key: "end_date", label: "Fin" },
                                      ] as { key: string; label: string }[]
                                    ).map(({ key, label }) => (
                                      <div key={key}>
                                        <label className="text-xs text-slate-500">
                                          {label}
                                        </label>
                                        <input
                                          className="w-full border border-slate-200 rounded px-2 py-1 text-xs mt-0.5"
                                          value={(exp[key] as string) ?? ""}
                                          onChange={(e) =>
                                            setPendingCvData((prev) => {
                                              if (!prev) return prev;
                                              const exps = [
                                                ...(prev.experiences as any[]),
                                              ];
                                              exps[i] = {
                                                ...exps[i],
                                                [key]: e.target.value,
                                              };
                                              return {
                                                ...prev,
                                                experiences: exps,
                                              };
                                            })
                                          }
                                        />
                                      </div>
                                    ))}
                                  </div>
                                  <div>
                                    <label className="text-xs text-slate-500">
                                      Points clés (une ligne par bullet)
                                    </label>
                                    <textarea
                                      className="w-full border border-slate-200 rounded px-2 py-1 text-xs min-h-[60px] resize-y mt-0.5"
                                      value={
                                        Array.isArray(exp.bullets)
                                          ? (exp.bullets as string[]).join("\n")
                                          : ""
                                      }
                                      onChange={(e) =>
                                        setPendingCvData((prev) => {
                                          if (!prev) return prev;
                                          const exps = [
                                            ...(prev.experiences as any[]),
                                          ];
                                          exps[i] = {
                                            ...exps[i],
                                            bullets: e.target.value
                                              .split("\n")
                                              .filter(Boolean),
                                          };
                                          return { ...prev, experiences: exps };
                                        })
                                      }
                                    />
                                  </div>
                                </div>
                              ),
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )}

                    {/* Skills */}
                    {(pendingCvData as any)?.skills &&
                      typeof (pendingCvData as any).skills === "object" && (
                        <AccordionItem value="skills">
                          <AccordionTrigger className="text-sm font-medium py-2">
                            Compétences
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-2">
                              {Object.entries(
                                (pendingCvData as any).skills as Record<
                                  string,
                                  unknown
                                >,
                              ).map(([cat, vals]) => (
                                <div key={cat}>
                                  <label className="text-xs text-slate-500 capitalize">
                                    {cat}
                                  </label>
                                  <textarea
                                    className="w-full border border-slate-200 rounded px-2 py-1 text-xs min-h-[40px] resize-y mt-0.5"
                                    value={
                                      Array.isArray(vals)
                                        ? (vals as string[]).join("\n")
                                        : String(vals ?? "")
                                    }
                                    onChange={(e) =>
                                      setPendingCvData((prev) => {
                                        if (!prev) return prev;
                                        return {
                                          ...prev,
                                          skills: {
                                            ...(prev.skills as any),
                                            [cat]: e.target.value
                                              .split("\n")
                                              .filter(Boolean),
                                          },
                                        };
                                      })
                                    }
                                  />
                                </div>
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      )}

                    {/* Education */}
                    {Array.isArray((pendingCvData as any)?.education) && (
                      <AccordionItem value="education">
                        <AccordionTrigger className="text-sm font-medium py-2">
                          Formation
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3">
                            {((pendingCvData as any).education as any[]).map(
                              (edu, i) => (
                                <div
                                  key={i}
                                  className="rounded border border-slate-100 p-2 space-y-2"
                                >
                                  {(
                                    [
                                      { key: "degree", label: "Diplôme" },
                                      { key: "school", label: "École" },
                                      { key: "year", label: "Année" },
                                      { key: "details", label: "Détails" },
                                    ] as { key: string; label: string }[]
                                  ).map(({ key, label }) => (
                                    <div key={key}>
                                      <label className="text-xs text-slate-500">
                                        {label}
                                      </label>
                                      <input
                                        className="w-full border border-slate-200 rounded px-2 py-1 text-xs mt-0.5"
                                        value={(edu[key] as string) ?? ""}
                                        onChange={(e) =>
                                          setPendingCvData((prev) => {
                                            if (!prev) return prev;
                                            const edus = [
                                              ...(prev.education as any[]),
                                            ];
                                            edus[i] = {
                                              ...edus[i],
                                              [key]: e.target.value,
                                            };
                                            return { ...prev, education: edus };
                                          })
                                        }
                                      />
                                    </div>
                                  ))}
                                </div>
                              ),
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )}
                  </Accordion>
                </div>

                {/* Right: iframe preview */}
                <div className="relative rounded-lg border border-slate-200 overflow-hidden bg-white h-[320px] md:h-[calc(88vh-220px)] min-h-[320px]">
                  {previewLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
                      <Loader2 className="h-6 w-6 animate-spin text-[#00D9FF]" />
                    </div>
                  )}
                  {previewHtml ? (
                    <iframe
                      srcDoc={previewHtml}
                      className="w-full h-full border-none"
                      title="Prévisualisation CV"
                      sandbox="allow-same-origin"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                      <FileText className="h-8 w-8" />
                      <p className="text-sm">
                        Actualisez pour voir la prévisualisation
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-slate-500"
                  onClick={() => setStep("results")}
                >
                  ← Retour aux résultats
                </Button>
                <div className="flex-1" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    pendingCvData && fetchPreviewHtml(pendingCvData)
                  }
                  disabled={previewLoading}
                >
                  <RefreshCw
                    className={cn(
                      "h-3.5 w-3.5 mr-1.5",
                      previewLoading && "animate-spin",
                    )}
                  />
                  Actualiser la prévisualisation
                </Button>
                <Button
                  size="sm"
                  className="bg-gradient-to-r from-[#00D9FF] to-blue-600 text-white font-semibold"
                  onClick={async () => {
                    if (!pendingCvData) return;
                    setStep("generating");
                    setGeneratingLabel("Génération des PDFs...");
                    try {
                      await generatePdfsAndSave(
                        pendingCvData,
                        pendingMatchScore,
                      );
                    } catch (err) {
                      const message =
                        err instanceof Error
                          ? err.message
                          : "Une erreur est survenue";
                      toast.error(message);
                      setStep("preview");
                      setGeneratingLabel("");
                    }
                  }}
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Générer les PDFs
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 4 : Results ── */}
          {step === "results" && result && (
            <div className="space-y-4">
              {/* Match score */}
              {result.matchScore != null && !isNaN(result.matchScore) && (
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
                {/* CV */}
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    className="flex-1 border-[#0D1F3C] text-[#0D1F3C] hover:bg-[#0D1F3C] hover:text-white transition-colors"
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
                    size="lg"
                    className="shrink-0 border-[#0D1F3C] text-[#0D1F3C] hover:bg-amber-50 hover:border-amber-400 hover:text-amber-600 transition-colors px-3"
                    title="Modifier le contenu du CV adapté avant de télécharger"
                    onClick={() => {
                      if (pendingCvData) {
                        fetchPreviewHtml(pendingCvData);
                        setStep("preview");
                      }
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>

                {/* Lettre de motivation */}
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    className="flex-1 border-[#0D1F3C] text-[#0D1F3C] hover:bg-[#0D1F3C] hover:text-white transition-colors"
                    size="lg"
                    onClick={handleDownloadLM}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    {t("downloadCoverLetter")}
                    <Badge variant="secondary" className="ml-auto text-xs">
                      PDF
                    </Badge>
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="shrink-0 border-[#0D1F3C] text-[#0D1F3C] hover:bg-amber-50 hover:border-amber-400 hover:text-amber-600 transition-colors px-3"
                    title="Modifier le CV adapté — la lettre de motivation sera regénérée automatiquement"
                    onClick={() => {
                      if (pendingCvData) {
                        fetchPreviewHtml(pendingCvData);
                        setStep("preview");
                      }
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>

                {/* Info édition */}
                <p className="text-xs text-slate-400 text-center pt-1">
                  ✏️ Modifier le CV adapté regénère automatiquement la lettre de
                  motivation
                </p>
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

      {/* CV Builder Wizard (outside main dialog to avoid nesting) */}
      <CvBuilderWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onSave={handleWizardSave}
      />
    </>
  );
}
