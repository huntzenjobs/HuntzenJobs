/**
 * InsiderFinderDrawer — Find real people to contact at a company via AI + SerpAPI
 *
 * Slide-in drawer triggered from JobDetailsModal footer.
 * Calls POST /api/insider-finder/find (Groq strategy + SerpAPI LinkedIn search).
 * Returns grouped contacts: pair, recruiter, campus.
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Linkedin,
  Loader2,
  SearchX,
  Sparkles,
  Users,
} from "lucide-react";
import type { Job } from "@/lib/api/huntzen-client";

// ============================================================================
// TYPES
// ============================================================================

interface InsiderContact {
  name: string;
  title: string;
  link: string;
  snippet: string;
  category: "pair" | "recruiter" | "campus" | string;
  label: string;
}

interface InsiderResult {
  success: boolean;
  strategy: string;
  insiders: InsiderContact[];
  total_found: number;
}

interface InsiderFinderDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job;
}

// ============================================================================
// HELPERS
// ============================================================================

function extractCity(location: string): string {
  return location?.split(",")[0]?.trim() ?? "";
}

function detectAlternance(title: string): boolean {
  return /alternance|apprentissage|stage/i.test(title ?? "");
}

const CATEGORY_STYLES: Record<
  string,
  { label: string; className: string }
> = {
  pair: { label: "Futur Collègue", className: "bg-teal-100 text-teal-700 hover:bg-teal-100" },
  recruiter: { label: "Recrutement", className: "bg-blue-100 text-blue-700 hover:bg-blue-100" },
  campus: { label: "Campus", className: "bg-orange-100 text-orange-700 hover:bg-orange-100" },
};

function getCategoryStyle(category: string) {
  return (
    CATEGORY_STYLES[category] ?? {
      label: "Contact",
      className: "bg-gray-100 text-gray-600 hover:bg-gray-100",
    }
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function InsiderCard({ contact }: { contact: InsiderContact }) {
  const style = getCategoryStyle(contact.category);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3 hover:border-violet-300 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">
            {contact.name}
          </p>
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
            {contact.title}
          </p>
        </div>
        <Badge className={`shrink-0 text-xs font-medium ${style.className}`}>
          {contact.label || style.label}
        </Badge>
      </div>

      <Button size="sm" variant="outline" className="w-full" asChild>
        <a href={contact.link} target="_blank" rel="noopener noreferrer">
          <Linkedin className="mr-2 h-4 w-4 text-[#0A66C2]" />
          Ouvrir LinkedIn
        </a>
      </Button>
    </div>
  );
}

function InsiderSkeletons() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="border border-gray-200 rounded-lg p-4 space-y-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-8 w-full rounded-md" />
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function InsiderFinderDrawer({
  open,
  onOpenChange,
  job,
}: InsiderFinderDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InsiderResult | null>(null);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    setSearched(true);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      const response = await fetch(`${backendUrl}/api/insider-finder/find`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_title: job.title || "",
          company: job.company || "",
          city: extractCity(job.location),
          is_alternance: detectAlternance(job.title),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: InsiderResult = await response.json();
      setResult(data);
    } catch {
      setResult({ success: false, strategy: "", insiders: [], total_found: 0 });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setResult(null);
      setSearched(false);
    }
    onOpenChange(isOpen);
  };

  const handleReset = () => {
    setResult(null);
    setSearched(false);
  };

  // Group insiders by category for display
  const grouped = result?.insiders.reduce<Record<string, InsiderContact[]>>(
    (acc, contact) => {
      const key = contact.category;
      acc[key] = acc[key] ?? [];
      acc[key].push(contact);
      return acc;
    },
    {}
  );

  const hasResults = (result?.total_found ?? 0) > 0;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-gray-100">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-violet-600" />
            Trouver un insider
          </SheetTitle>
          <SheetDescription className="text-sm text-gray-500">
            Personnes réelles à contacter chez{" "}
            <span className="font-medium text-gray-700">
              {job.company || "cette entreprise"}
            </span>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* ── Idle state ── */}
          {!searched && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 text-center">
                L'IA génère une stratégie de recherche et trouve des profils
                LinkedIn réels à contacter pour ce poste. La recherche prend
                environ 5 à 8 secondes.
              </p>
              <Button
                onClick={handleSearch}
                className="w-full bg-gradient-to-r from-violet-600 to-blue-600 text-white"
                disabled={loading}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Lancer la recherche
              </Button>
            </div>
          )}

          {/* ── Loading state ── */}
          {loading && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
                <span>L'IA analyse la stratégie et cherche les profils…</span>
              </div>
              <InsiderSkeletons />
            </div>
          )}

          {/* ── Results ── */}
          {!loading && searched && result && (
            <>
              {/* AI Strategy bubble */}
              {result.strategy && (
                <div className="bg-violet-50 border border-violet-100 rounded-lg p-3 flex items-start gap-2 text-sm text-violet-800">
                  <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-violet-500" />
                  <p>{result.strategy}</p>
                </div>
              )}

              {/* Empty state */}
              {!hasResults && (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-gray-400">
                  <SearchX className="h-10 w-10" />
                  <p className="text-sm text-center">
                    Aucun profil trouvé pour{" "}
                    <strong>{job.company}</strong>.
                    <br />
                    Essayez de postuler directement sur leur site.
                  </p>
                  <Button variant="outline" size="sm" onClick={handleReset}>
                    Réessayer
                  </Button>
                </div>
              )}

              {/* Grouped results */}
              {hasResults && grouped && (
                <>
                  {["pair", "recruiter", "campus"].map((cat) => {
                    const contacts = grouped[cat];
                    if (!contacts?.length) return null;
                    const style = getCategoryStyle(cat);
                    return (
                      <div key={cat} className="space-y-3">
                        <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                          <Badge className={style.className}>
                            {style.label}
                          </Badge>
                          <span className="text-gray-400 font-normal">
                            {contacts.length} profil
                            {contacts.length > 1 ? "s" : ""}
                          </span>
                        </h4>
                        {contacts.map((c, i) => (
                          <InsiderCard key={`${cat}-${i}`} contact={c} />
                        ))}
                      </div>
                    );
                  })}

                  {/* Other categories not in the predefined list */}
                  {Object.entries(grouped)
                    .filter(([key]) => !["pair", "recruiter", "campus"].includes(key))
                    .map(([cat, contacts]) => {
                      if (!contacts?.length) return null;
                      const style = getCategoryStyle(cat);
                      return (
                        <div key={cat} className="space-y-3">
                          <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <Badge className={style.className}>
                              {style.label}
                            </Badge>
                          </h4>
                          {contacts.map((c, i) => (
                            <InsiderCard key={`${cat}-${i}`} contact={c} />
                          ))}
                        </div>
                      );
                    })}

                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-gray-400"
                    onClick={handleReset}
                  >
                    Nouvelle recherche
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
