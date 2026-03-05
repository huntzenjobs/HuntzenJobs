/**
 * JobDetailsModal - Modal affichant tous les détails d'une offre d'emploi
 * Inspiré du frontend PHP existant
 */

"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  X,
  Building,
  MapPin,
  Briefcase,
  ExternalLink,
  Clock,
  DollarSign,
  Users,
  Sparkles,
  Info,
  FileText,
  Mail,
  Download,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Job } from "@/lib/api/huntzen-client";
import { formatJobSource } from "@/lib/utils/job-source-formatter";
import DOMPurify from "dompurify";
import { useFullJobDescription } from "@/hooks/use-full-job-description";
import { Skeleton } from "@/components/ui/skeleton";
import { useSubscription } from "@/contexts/subscription-context";
import { useAuthenticatedFetch } from "@/hooks/use-authenticated-fetch";
import { ApplyModal } from "./apply-modal";
import { InsiderFinderDrawer } from "./insider-finder-drawer";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "";
// ============================================================================
// TYPES
// ============================================================================

interface JobDetailsModalProps {
  job: Job | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function JobDetailsModal({
  job,
  open,
  onOpenChange,
}: JobDetailsModalProps) {
  const [applyModalOpen, setApplyModalOpen] = React.useState(false);
  const [insiderDrawerOpen, setInsiderDrawerOpen] = React.useState(false);

  const t = useTranslations("jobDetails");

  // All hooks must be called before any conditional return (Rules of Hooks)
  const { canUse, openPricingModal } = useSubscription();
  const { authenticatedFetch } = useAuthenticatedFetch();
  const { description: fullDescription, loading: loadingDescription } =
    useFullJobDescription(job?.url, job?.source);

  // Track job view when modal opens — must be before early return (Rules of Hooks)
  React.useEffect(() => {
    if (!open || !job) return;

    const trackView = async () => {
      try {
        // Use authenticatedFetch to automatically include auth token if user is logged in
        const response = await authenticatedFetch(
          `${BACKEND_URL}/api/jobs/track-view`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ job_id: job.id || job.url }),
          },
        );

        // Parse body once — a Response body can only be consumed once
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          // Handle quota exceeded (429) - show upgrade modal
          if (
            response.status === 429 &&
            data.detail?.error === "quota_exceeded"
          ) {
            console.warn("Job view quota exceeded");
            openPricingModal("job_view");
            onOpenChange(false); // Close the modal
          }
          return;
        }

        if (
          data.success &&
          data.remaining !== undefined &&
          data.remaining >= 0
        ) {
          console.log(`Job view tracked. Remaining views: ${data.remaining}`);

          // Warn user when approaching limit (2 views left)
          if (data.remaining <= 2 && data.remaining > 0) {
            console.warn(
              `Warning: Only ${data.remaining} job views remaining today`,
            );
          }
        }
      } catch (error) {
        // Fail silently - don't block user from viewing job if tracking fails
        console.error("Failed to track job view:", error);
      }
    };

    trackView();
  }, [open, job, openPricingModal, onOpenChange, authenticatedFetch]);

  if (!job) return null;

  // Format source for display
  const displaySource = formatJobSource(job.source);

  // Use full description if available, fallback to job.description
  const displayDescription = fullDescription || job.description;

  // Sanitize HTML to prevent XSS
  const sanitizedDescription = DOMPurify.sanitize(displayDescription || "", {
    ALLOWED_TAGS: [
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "p",
      "br",
      "strong",
      "em",
      "u",
      "ul",
      "ol",
      "li",
      "a",
      "span",
      "div",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "class"],
  });

  return (
    <>
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Portal>
          {/* Overlay */}
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

          {/* Modal Content - Large Width */}
          <DialogPrimitive.Content
            className={cn(
              "fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]",
              "w-full max-w-[95vw] md:max-w-4xl lg:max-w-5xl xl:max-w-6xl max-h-[95vh]",
              "bg-white rounded-lg shadow-xl flex flex-col",
              "overflow-hidden",
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
              "data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]",
              "data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
            )}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-violet-600 text-white p-4 md:p-6 relative flex-shrink-0">
              <DialogPrimitive.Close className="absolute right-4 top-4 rounded-full p-2 bg-white/10 hover:bg-white/20 transition-colors">
                <X className="h-5 w-5" />
                <span className="sr-only">{t("close")}</span>
              </DialogPrimitive.Close>

              <div className="pr-12">
                <DialogPrimitive.Title className="text-lg md:text-2xl font-bold mb-2">
                  {job.title}
                </DialogPrimitive.Title>
                <div className="flex flex-wrap items-center gap-2 md:gap-3 text-white/90">
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4" />
                    <span className="font-medium">
                      {job.company || t("companyUnspecified")}
                    </span>
                  </div>
                  {job.location && (
                    <>
                      <span>•</span>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        <span>{job.location}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Body - Scrollable with 2-column layout */}
            <div className="overflow-y-auto flex-1 p-4 md:p-8">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-8">
                {/* Left Column - Main Info (2/3 width) */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Truncated description notice */}
                  {job.description_truncated &&
                    !fullDescription &&
                    !loadingDescription &&
                    job.url && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-600">
                        <AlertTriangle className="h-4 w-4 text-slate-400 shrink-0" />
                        <span>{t("truncatedDescription")}</span>
                      </div>
                    )}

                  {/* Description */}
                  {(job.description || displayDescription) && (
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <Briefcase className="h-6 w-6 text-blue-600" />
                        {t("jobDescription")}
                      </h3>
                      <div className="bg-gray-50 p-5 rounded-lg border border-gray-200">
                        {loadingDescription ? (
                          <div className="space-y-3">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-5/6" />
                            <Skeleton className="h-4 w-4/6" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-3/4" />
                          </div>
                        ) : (
                          <div
                            className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-headings:font-bold prose-p:text-gray-700 prose-p:leading-relaxed prose-a:text-blue-600 prose-a:hover:underline prose-ul:list-disc prose-ol:list-decimal"
                            dangerouslySetInnerHTML={{
                              __html: sanitizedDescription,
                            }}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Recruiter Info (if available) */}
                  {(job as any).recruiter_name && (
                    <div className="border-t border-gray-200 pt-6">
                      <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <Users className="h-6 w-6 text-blue-600" />
                        Contact recruteur
                      </h3>
                      <div className="bg-blue-50 p-5 rounded-lg border border-blue-200">
                        <p className="font-semibold text-gray-900 mb-3 text-lg">
                          {(job as any).recruiter_name}
                        </p>
                        {(job as any).recruiter_email && (
                          <p className="text-sm text-gray-600 mb-2">
                            <span className="font-semibold">Email:</span>{" "}
                            <a
                              href={`mailto:${(job as any).recruiter_email}`}
                              className="text-blue-600 hover:underline"
                            >
                              {(job as any).recruiter_email}
                            </a>
                          </p>
                        )}
                        {(job as any).recruiter_phone && (
                          <p className="text-sm text-gray-600">
                            <span className="font-semibold">Téléphone:</span>{" "}
                            <a
                              href={`tel:${(job as any).recruiter_phone}`}
                              className="text-blue-600 hover:underline"
                            >
                              {(job as any).recruiter_phone}
                            </a>
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Column - Quick Info (1/3 width) */}
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">
                    {t("keyInfo")}
                  </h3>

                  {/* Salary */}
                  {job.salary && (
                    <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                      <div className="flex items-center gap-2 text-sm text-green-700 mb-2">
                        <DollarSign className="h-5 w-5" />
                        <span className="font-semibold">{t("salary")}</span>
                      </div>
                      <p className="text-green-900 font-bold text-lg">
                        {job.salary}
                      </p>
                    </div>
                  )}

                  {/* Company */}
                  {job.company && (
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                        <Building className="h-5 w-5" />
                        <span className="font-semibold">{t("company")}</span>
                      </div>
                      <p className="text-gray-900 font-medium">{job.company}</p>
                    </div>
                  )}

                  {/* Location */}
                  {job.location && (
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                        <MapPin className="h-5 w-5" />
                        <span className="font-semibold">{t("location")}</span>
                      </div>
                      <p className="text-gray-900 font-medium">
                        {job.location}
                      </p>
                    </div>
                  )}

                  {/* Posted Date */}
                  {job.posted_date && (
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                        <Clock className="h-5 w-5" />
                        <span className="font-semibold">{t("postedDate")}</span>
                      </div>
                      <p className="text-gray-900 font-medium">
                        {job.posted_date}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 p-4 md:p-6 bg-gray-50 flex-shrink-0">
              {/* Ligne 1 : actions secondaires — s'empilent sur mobile */}
              <div className="flex flex-wrap gap-2 mb-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 sm:flex-none border-violet-200 text-violet-700 hover:bg-violet-50 hover:border-violet-300"
                  onClick={() => setInsiderDrawerOpen(true)}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {t("findInternalContact")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 sm:flex-none"
                  onClick={() => onOpenChange(false)}
                >
                  {t("close")}
                </Button>
                {job.url && (
                  <Button
                    asChild
                    variant={job.url_is_direct ? "default" : "outline"}
                    size="sm"
                    className={
                      job.url_is_direct
                        ? "flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white"
                        : "flex-1 sm:flex-none"
                    }
                  >
                    <a href={job.url} target="_blank" rel="noopener noreferrer">
                      {job.url_is_direct
                        ? "Postuler directement"
                        : t("viewOffer")}
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                )}
              </div>
              {/* Ligne 2 : CTA principal pleine largeur */}
              {job.url && (
                <div className="flex items-center gap-1">
                  <Button
                    size="lg"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                    onClick={() => {
                      if (!canUse("cv_analysis")) {
                        openPricingModal("cv_analysis");
                        return;
                      }
                      setApplyModalOpen(true);
                    }}
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    {t("generateDocuments")}
                  </Button>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        aria-label="Comment ça fonctionne ?"
                      >
                        <Info className="h-4 w-4" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="top"
                      align="end"
                      className="w-[min(18rem,calc(100vw-2rem))] p-4"
                    >
                      <p className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                        CV &amp; lettre adaptés à ce poste
                      </p>
                      <ol className="space-y-2 text-sm text-gray-600">
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center mt-0.5">
                            1
                          </span>
                          Uploadez votre CV (PDF ou Word)
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center mt-0.5">
                            2
                          </span>
                          Votre CV est réécrit pour correspondre à cette offre
                          précise
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center mt-0.5">
                            3
                          </span>
                          Une lettre de motivation personnalisée est générée
                          automatiquement
                        </li>
                      </ol>
                      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-400">
                        <Download className="h-3.5 w-3.5 shrink-0" />
                        Vous téléchargez les deux documents en PDF
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Apply Modal — CV adapté + LM automatique */}
      {job && (
        <ApplyModal
          open={applyModalOpen}
          onOpenChange={setApplyModalOpen}
          job={job}
          jobDescription={fullDescription || job.description}
        />
      )}

      {/* Insider Finder — trouve des contacts internes LinkedIn */}
      {job && (
        <InsiderFinderDrawer
          open={insiderDrawerOpen}
          onOpenChange={setInsiderDrawerOpen}
          job={job}
        />
      )}
    </>
  );
}
