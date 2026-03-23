/**
 * RecruiterFinderDrawer - Discover recruiter contacts at a company via Hunter.io
 *
 * Slide-in drawer triggered from JobDetailsModal footer.
 * Calls POST /api/recruiter-finder/find and displays HR + tech contacts.
 */

"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Mail,
  Linkedin,
  Copy,
  CheckCheck,
  Loader2,
  SearchX,
  AtSign,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/auth-context";
import type { Job } from "@/lib/api/huntzen-client";

// ============================================================================
// TYPES
// ============================================================================

interface Contact {
  name: string;
  email: string;
  position: string | null;
  department: string | null;
  seniority: string | null;
  confidence: number;
  linkedin: string | null;
  role: "hr" | "tech" | "other";
  source: "apollo" | "hunter";
  email_verified: boolean;
}

interface FinderResult {
  company: string;
  domain: string;
  email_pattern: string | null;
  recruiters: Contact[];
  tech_team: Contact[];
  all_contacts: Contact[];
  total_found: number;
  source: "apollo" | "hunter";
}

interface RecruiterFinderDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job;
}

// ============================================================================
// HELPERS
// ============================================================================

function CopyEmailButton({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  const tJobs = useTranslations("jobs");

  const handleCopy = async () => {
    await navigator.clipboard.writeText(email);
    setCopied(true);
    toast.success(tJobs("toasts.emailCopied"));
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="ml-1 inline-flex items-center text-gray-400 hover:text-blue-600 transition-colors"
      title="Copier l'email"
    >
      {copied ? (
        <CheckCheck className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function ContactCard({ contact }: { contact: Contact }) {
  const tJobs = useTranslations("jobs");
  const roleBadge =
    contact.role === "hr"
      ? { label: "RH / Recruteur", className: "bg-blue-100 text-blue-700" }
      : contact.role === "tech"
        ? { label: "Tech", className: "bg-violet-100 text-violet-700" }
        : { label: "Autre", className: "bg-gray-100 text-gray-600" };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2 hover:border-blue-300 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-900 text-sm">{contact.name}</p>
          {contact.position && (
            <p className="text-xs text-gray-500 mt-0.5">{contact.position}</p>
          )}
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${roleBadge.className}`}
        >
          {roleBadge.label}
        </span>
      </div>

      {contact.email && (
        <div className="flex items-center gap-1.5 text-sm min-w-0">
          <Mail className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          <a
            href={`mailto:${contact.email}`}
            className="text-blue-600 hover:underline truncate min-w-0"
          >
            {contact.email}
          </a>
          <CopyEmailButton email={contact.email} />
          {/* Email verification badge */}
          {contact.email_verified ? (
            <span className="inline-flex items-center gap-0.5 text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full font-medium shrink-0">
              <ShieldCheck className="h-3 w-3" />
              {tJobs("recruiterEmailVerified")}
            </span>
          ) : (
            contact.email && (
              <span className="inline-flex items-center gap-0.5 text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full font-medium shrink-0">
                <ShieldAlert className="h-3 w-3" />
                {tJobs("recruiterEmailGuessed")}
              </span>
            )
          )}
        </div>
      )}

      {contact.linkedin && (
        <div className="flex items-center gap-1.5 text-sm">
          <Linkedin className="h-3.5 w-3.5 text-[#0A66C2] shrink-0" />
          <a
            href={contact.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#0A66C2] hover:underline text-xs"
          >
            {tJobs("recruiterViewLinkedin")}
          </a>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

// Source names that should NOT be used as company names
const SOURCE_NAMES = new Set([
  "adzuna",
  "huntzen",
  "serpapi",
  "remoteok",
  "remote ok",
  "france travail",
  "indeed",
  "linkedin",
  "google jobs",
  "glassdoor",
  "monster",
  "apec",
  "pole emploi",
]);

function cleanCompanyName(company: string): string {
  if (!company) return "";
  const lower = company.toLowerCase().trim();
  if (SOURCE_NAMES.has(lower)) return "";
  return company.trim();
}

export function RecruiterFinderDrawer({
  open,
  onOpenChange,
  job,
}: RecruiterFinderDrawerProps) {
  const tJobs = useTranslations("jobs");
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FinderResult | null>(null);
  const [searched, setSearched] = useState(false);
  const [quotaError, setQuotaError] = useState(false);
  const [companyName, setCompanyName] = useState(cleanCompanyName(job.company));

  const handleSearch = async () => {
    if (!session?.access_token) {
      toast.error("Connectez-vous pour utiliser cette fonctionnalité");
      return;
    }
    setLoading(true);
    setSearched(true);
    setQuotaError(false);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      const response = await fetch(`${backendUrl}/api/recruiter-finder/find`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          company_name: companyName,
          job_title: job.title || "",
        }),
      });

      if (response.status === 429) {
        setQuotaError(true);
        toast.error(tJobs("toasts.quotaReached"));
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: FinderResult = await response.json();
      setResult(data);
    } catch {
      toast.error(tJobs("toasts.contactsLoadError"));
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  // Reset state when drawer closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setResult(null);
      setSearched(false);
      setCompanyName(cleanCompanyName(job.company));
    }
    onOpenChange(isOpen);
  };

  const hasRecruiters = (result?.recruiters?.length ?? 0) > 0;
  const hasTech = (result?.tech_team?.length ?? 0) > 0;
  const hasAny = (result?.total_found ?? 0) > 0;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-gray-100">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-blue-600" />
            Trouver le recruteur
          </SheetTitle>
          <SheetDescription className="text-sm text-gray-500">
            {tJobs("recruiterFinderSubtitle")}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Badge BÊTA */}
          <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
            <div className="text-xs text-orange-700">
              <span className="font-semibold">BÊTA</span> —{" "}
              {tJobs("recruiterFinderBeta")}
            </div>
          </div>

          {/* Company name input + search button */}
          {!searched && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">
                  {tJobs("recruiterCompanyLabel")}
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder={tJobs("recruiterCompanyPlaceholder")}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <p className="text-sm text-gray-500">
                {tJobs("recruiterFinderDescription")}
              </p>
              <Button
                onClick={handleSearch}
                className="bg-gradient-to-r from-blue-600 to-violet-600 text-white w-full"
                disabled={loading || !companyName.trim()}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Recherche en cours…
                  </>
                ) : (
                  <>
                    <Users className="mr-2 h-4 w-4" />
                    Lancer la recherche
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-gray-500">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-sm">{tJobs("recruiterSearching")}</p>
            </div>
          )}

          {/* Results */}
          {!loading && searched && result && (
            <>
              {/* Email pattern hint */}
              {result.email_pattern && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex items-center gap-2 text-sm text-blue-800">
                  <AtSign className="h-4 w-4 shrink-0" />
                  <span>
                    Pattern email :{" "}
                    <span className="font-mono font-semibold">
                      {result.email_pattern}
                    </span>
                  </span>
                </div>
              )}

              {/* No results */}
              {!hasAny && (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-gray-400">
                  <SearchX className="h-10 w-10" />
                  <p className="text-sm text-center">
                    Aucun contact trouvé pour <strong>{result.company}</strong>.
                    <br />
                    Essayez de postuler directement sur leur site.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearched(false);
                      setResult(null);
                    }}
                  >
                    Réessayer
                  </Button>
                </div>
              )}

              {/* Recruiters / HR */}
              {hasRecruiters && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                      RH / Recruteurs
                    </Badge>
                    <span className="text-gray-400 font-normal">
                      {result.recruiters.length} contact
                      {result.recruiters.length > 1 ? "s" : ""}
                    </span>
                  </h4>
                  {result.recruiters.map((c, i) => (
                    <ContactCard key={`hr-${i}`} contact={c} />
                  ))}
                </div>
              )}

              {/* Tech team */}
              {hasTech && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Badge className="bg-violet-100 text-violet-700 hover:bg-violet-100">
                      Équipe Tech
                    </Badge>
                    <span className="text-gray-400 font-normal">
                      {result.tech_team.length} contact
                      {result.tech_team.length > 1 ? "s" : ""}
                    </span>
                  </h4>
                  {result.tech_team.map((c, i) => (
                    <ContactCard key={`tech-${i}`} contact={c} />
                  ))}
                </div>
              )}

              {/* Other contacts (if any and no HR/tech) */}
              {hasAny && !hasRecruiters && !hasTech && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-gray-700">
                    Contacts trouvés
                  </h4>
                  {result.all_contacts.map((c, i) => (
                    <ContactCard key={`other-${i}`} contact={c} />
                  ))}
                </div>
              )}

              {/* Search again */}
              {hasAny && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-gray-400"
                  onClick={() => {
                    setSearched(false);
                    setResult(null);
                  }}
                >
                  Nouvelle recherche
                </Button>
              )}

              {/* RGPD Disclaimer */}
              <p className="text-xs text-muted-foreground border-t pt-3">
                {tJobs("recruiterFinderRgpd")}
              </p>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
