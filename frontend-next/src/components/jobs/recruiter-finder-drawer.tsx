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
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
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
}

interface FinderResult {
  company: string;
  domain: string;
  email_pattern: string | null;
  recruiters: Contact[];
  tech_team: Contact[];
  all_contacts: Contact[];
  total_found: number;
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
          {contact.confidence > 0 && (
            <span className="text-xs text-gray-400 ml-auto shrink-0">
              {contact.confidence}%
            </span>
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
            Voir le profil LinkedIn
          </a>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function RecruiterFinderDrawer({
  open,
  onOpenChange,
  job,
}: RecruiterFinderDrawerProps) {
  const tJobs = useTranslations("jobs");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FinderResult | null>(null);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    setSearched(true);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      const response = await fetch(`${backendUrl}/api/recruiter-finder/find`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: job.company || "",
          company_website: job.url || "",
          job_title: job.title || "",
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: FinderResult = await response.json();
      setResult(data);
    } catch (err) {
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
            Contacts RH et décideurs chez{" "}
            <span className="font-medium text-gray-700">
              {job.company || "cette entreprise"}
            </span>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Search button */}
          {!searched && (
            <div className="text-center space-y-3">
              <p className="text-sm text-gray-500">
                Identifie automatiquement les recruteurs et décideurs à
                contacter pour ce poste.
              </p>
              <Button
                onClick={handleSearch}
                className="bg-gradient-to-r from-blue-600 to-violet-600 text-white w-full"
                disabled={loading}
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
              <p className="text-sm">Interrogation de Hunter.io…</p>
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
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
