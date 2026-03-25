/**
 * ContactFinderDrawer - Unified contact discovery drawer
 *
 * Replaces RecruiterFinderDrawer + InsiderFinderDrawer.
 * Calls POST /api/contact-finder/find (unified endpoint).
 */

"use client";

import { useState, useEffect, useCallback } from "react";
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
  Linkedin,
  Copy,
  CheckCheck,
  Loader2,
  SearchX,
  Sparkles,
  ExternalLink,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";
import type { Job } from "@/lib/api/huntzen-client";

// ============================================================================
// TYPES
// ============================================================================

interface Contact {
  name: string;
  position: string | null;
  email: string | null;
  email_verified: boolean;
  linkedin_url: string | null;
  confidence: number;
  category: string;
  source: string;
}

interface FinderResult {
  company: string;
  domain: string | null;
  email_pattern: string | null;
  contacts: Contact[];
  total_found: number;
  sources_used: string[];
  linkedin_company_url: string;
  strategy: string | null;
  cached: boolean;
  cached_at: string | null;
}

interface ContactFinderDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job;
}

// ============================================================================
// CONSTANTS
// ============================================================================

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

const CATEGORY_STYLES: Record<string, string> = {
  hr: "bg-blue-100 text-blue-700",
  pair: "bg-teal-100 text-teal-700",
  campus: "bg-orange-100 text-orange-700",
  tech: "bg-violet-100 text-violet-700",
  other: "bg-gray-100 text-gray-600",
};

// ============================================================================
// HELPERS
// ============================================================================

function cleanCompanyName(company: string): string {
  if (!company) return "";
  if (SOURCE_NAMES.has(company.toLowerCase().trim())) return "";
  return company.trim();
}

function extractCity(location: string): string {
  return location?.split(",")[0]?.trim() ?? "";
}

function detectAlternance(title: string): boolean {
  return /alternance|apprentissage|stage/i.test(title ?? "");
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function CopyEmailButton({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  const t = useTranslations("contactFinder");

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(email);
    setCopied(true);
    toast.success(t("emailCopied"));
    setTimeout(() => setCopied(false), 2000);
  }, [email, t]);

  return (
    <button
      onClick={handleCopy}
      className="ml-1 inline-flex items-center text-gray-400 hover:text-blue-600 transition-colors"
      aria-label={t("copyEmail", { email })}
    >
      {copied ? (
        <CheckCheck className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const color =
    confidence >= 80
      ? "text-green-600"
      : confidence >= 50
        ? "text-orange-500"
        : "text-gray-400";
  return <span className={cn("text-xs", color)}>{confidence}%</span>;
}

function ContactCard({ contact }: { contact: Contact }) {
  const t = useTranslations("contactFinder");
  const categoryClass =
    CATEGORY_STYLES[contact.category] ?? CATEGORY_STYLES.other;
  const categoryLabel = t(
    `category.${contact.category}` as Parameters<typeof t>[0],
  );

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2 hover:border-blue-300 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">
            {contact.name}
          </p>
          {contact.position && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
              {contact.position}
            </p>
          )}
        </div>
        <span
          className={cn(
            "text-xs px-2 py-0.5 rounded-full font-medium shrink-0",
            categoryClass,
          )}
        >
          {categoryLabel}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {contact.linkedin_url && (
          <a
            href={contact.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[#0A66C2] hover:underline"
          >
            <Linkedin className="h-3.5 w-3.5" />
            LinkedIn
          </a>
        )}

        {contact.email && contact.email_verified && (
          <span className="inline-flex items-center gap-1 text-xs text-gray-600">
            <ShieldCheck className="h-3 w-3 text-green-500" />
            <Mail className="h-3 w-3" />
            {contact.email}
            <CopyEmailButton email={contact.email} />
          </span>
        )}

        {contact.confidence > 0 && (
          <ConfidenceBadge confidence={contact.confidence} />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ContactFinderDrawer({
  open,
  onOpenChange,
  job,
}: ContactFinderDrawerProps) {
  const t = useTranslations("contactFinder");
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FinderResult | null>(null);
  const [searched, setSearched] = useState(false);
  const [quotaError, setQuotaError] = useState(false);
  const [companyName, setCompanyName] = useState(cleanCompanyName(job.company));

  useEffect(() => {
    setCompanyName(cleanCompanyName(job.company));
    setResult(null);
    setSearched(false);
    setQuotaError(false);
  }, [job.id]);

  const handleSearch = useCallback(async () => {
    if (!session?.access_token) {
      toast.error(t("errorAuth"));
      return;
    }
    setLoading(true);
    setSearched(true);
    setQuotaError(false);

    try {
      const backendUrl =
        process.env.NEXT_PUBLIC_BACKEND_URL ||
        process.env.NEXT_PUBLIC_API_URL ||
        "";
      const response = await fetch(`${backendUrl}/api/contact-finder/find`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          company_name: companyName,
          job_title: job.title || null,
          city: extractCity(job.location) || null,
          is_alternance: detectAlternance(job.title),
        }),
      });

      if (response.status === 429) {
        setQuotaError(true);
        setSearched(false);
        toast.error(t("quotaReached"));
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: FinderResult = await response.json();
      setResult(data);
    } catch {
      toast.error(t("errorGeneric"));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [session, companyName, job, t]);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        setResult(null);
        setSearched(false);
        setCompanyName(cleanCompanyName(job.company));
      }
      onOpenChange(isOpen);
    },
    [job.company, onOpenChange],
  );

  const handleReset = useCallback(() => {
    setResult(null);
    setSearched(false);
    setQuotaError(false);
  }, []);

  const grouped = result?.contacts.reduce<Record<string, Contact[]>>(
    (acc, contact) => {
      const key = contact.category;
      acc[key] = acc[key] ?? [];
      acc[key].push(contact);
      return acc;
    },
    {},
  );

  const hasResults = (result?.total_found ?? 0) > 0;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-gray-100">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-blue-600" />
            {t("title")}
          </SheetTitle>
          <SheetDescription className="text-sm text-gray-500">
            {t("subtitle")}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Search form */}
          {!searched && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">
                  {t("companyLabel")}
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder={t("companyPlaceholder")}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {quotaError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {t("quotaReached")}
                </div>
              )}
              <Button
                onClick={handleSearch}
                className="bg-gradient-to-r from-blue-600 to-violet-600 text-white w-full"
                disabled={loading || !companyName.trim() || quotaError}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("searching")}
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {t("searchButton")}
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-gray-500">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-sm">{t("searching")}</p>
            </div>
          )}

          {/* Results */}
          {!loading && searched && result && (
            <>
              {result.cached && result.cached_at && (
                <div className="text-xs text-gray-400 text-center">
                  {t("cachedBadge", { date: result.cached_at })}
                </div>
              )}

              {result.strategy && (
                <div className="bg-violet-50 border border-violet-100 rounded-lg p-3 flex items-start gap-2 text-sm text-violet-800">
                  <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-violet-500" />
                  <p>{result.strategy}</p>
                </div>
              )}

              {hasResults && grouped && (
                <>
                  {["hr", "pair", "campus", "tech", "other"].map((cat) => {
                    const contacts = grouped[cat];
                    if (!contacts?.length) return null;
                    const categoryClass =
                      CATEGORY_STYLES[cat] ?? CATEGORY_STYLES.other;
                    return (
                      <div key={cat} className="space-y-3">
                        <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                          <Badge
                            className={cn(categoryClass, "hover:opacity-90")}
                          >
                            {t(`category.${cat}` as Parameters<typeof t>[0])}
                          </Badge>
                          <span className="text-gray-400 font-normal">
                            {contacts.length} profil
                            {contacts.length > 1 ? "s" : ""}
                          </span>
                        </h4>
                        {contacts.map((c, i) => (
                          <ContactCard key={`${cat}-${i}`} contact={c} />
                        ))}
                      </div>
                    );
                  })}
                </>
              )}

              {!hasResults && (
                <div className="flex flex-col items-center justify-center py-6 gap-3 text-gray-400">
                  <SearchX className="h-10 w-10" />
                  <p className="text-sm text-center">
                    {t("noResultsFallback", { company: result.company })}
                  </p>
                </div>
              )}

              {/* LinkedIn company page - ALWAYS visible */}
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium text-blue-900">
                  {t("linkedinPageTitle")}
                </p>
                <p className="text-xs text-blue-700">
                  {t("linkedinPageSubtitle", { company: result.company })}
                </p>
                <Button size="sm" variant="outline" className="w-full" asChild>
                  <a
                    href={result.linkedin_company_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    {t("linkedinPageButton")}
                  </a>
                </Button>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 text-gray-400"
                  onClick={handleReset}
                >
                  {t("newSearch")}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground border-t pt-3">
                {t("rgpdDisclaimer")}
              </p>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
