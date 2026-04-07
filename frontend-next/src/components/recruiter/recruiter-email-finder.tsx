"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/auth-context";
import { PLAN_LIMITS } from "@/hooks/use-freemium-limits";
import { Bookmark, Loader2, Search, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface Contact {
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  position?: string;
  confidence?: number;
  linkedin_url?: string | null;
}

interface RecruiterEmailFinderProps {
  companyName: string;
  companyDomain?: string;
}

function formatPositionText(position?: string | null): string {
  if (!position) return "";

  const segments = position
    .split("·")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  const filtered = segments.filter(
    (segment) => !/formation\s*:/i.test(segment),
  );

  return (filtered.length > 0 ? filtered : segments).join(" · ");
}

export function RecruiterEmailFinder({
  companyName,
  companyDomain,
}: RecruiterEmailFinderProps) {
  const { session } = useAuth();
  const t = useTranslations("dashboard.recruiterContact.finder");
  const [company, setCompany] = useState(companyName);
  const [city, setCity] = useState("");
  const [results, setResults] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [savedContacts, setSavedContacts] = useState<any[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const buildContactKey = (contact: {
    email?: string | null;
    linkedin_url?: string | null;
    // Some backends use `linkedin` instead of `linkedin_url`
    linkedin?: string | null;
    company?: string | null;
  }) => {
    const email = (contact.email || "").toLowerCase().trim();
    const linkedin = (contact.linkedin_url || (contact as any).linkedin || "")
      .toLowerCase()
      .trim();
    const companyKey = (contact.company || company).toLowerCase().trim();
    const identifier = email || linkedin;
    if (!identifier || !companyKey) {
      return "";
    }
    return `${identifier}|${companyKey}`;
  };

  // Reset state when companyName prop changes (different job selected)
  useEffect(() => {
    setCompany(companyName);
    setResults([]);
    setSearched(false);
    setError(null);
  }, [companyName]);

  const handleSearch = async () => {
    if (!session?.access_token || !company.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/recruiter-finder/find`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            company_name: company,
            company_domain: companyDomain,
            city: city || "",
          }),
        },
      );
      if (res.status === 429) {
        setError(
          t("quotaReached", { count: PLAN_LIMITS.free.job_searches_per_day }),
        );
        return;
      }
      if (!res.ok) throw new Error("Erreur de recherche");
      const data = await res.json();
      const recruiters = Array.isArray(data.recruiters) ? data.recruiters : [];
      const allContacts = Array.isArray(data.all_contacts)
        ? data.all_contacts
        : [];

      // If validation rejected all recruiters (company mismatch, etc.)
      // but we still have raw LinkedIn contacts, fall back to them.
      const baseResults: Contact[] = (
        recruiters.length > 0 ? recruiters : allContacts
      ) as Contact[];

      setResults(baseResults);
      setSearched(true);
    } catch {
      setError("Impossible de contacter le service. Réessayez.");
    } finally {
      setLoading(false);
    }
  };

  const fetchSavedContacts = async () => {
    if (!session?.access_token) return;
    setLoadingSaved(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/saved-recruiters`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      );
      if (!res.ok) return;
      const data = await res.json();
      setSavedContacts(Array.isArray(data.contacts) ? data.contacts : []);
    } catch {
      // ignore errors for saved contacts fetch
    } finally {
      setLoadingSaved(false);
    }
  };

  useEffect(() => {
    if (session?.access_token) {
      fetchSavedContacts();
    }
  }, [session?.access_token]);

  const handleSaveContact = async (contact: Contact) => {
    if (!session?.access_token) {
      setError(t("loginRequired"));
      return;
    }

    const keyEmail = contact.email || "";
    const displayName =
      contact.name ||
      [contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
      "";

    const payload = {
      name: displayName || null,
      email: keyEmail || null,
      position: contact.position || null,
      company,
      linkedin_url: contact.linkedin_url ?? (contact as any).linkedin ?? null,
      source: "recruiter_finder",
    };

    const savingKey = buildContactKey({
      email: keyEmail || null,
      linkedin_url: contact.linkedin_url ?? null,
      linkedin: (contact as any).linkedin,
      company,
    });
    setSavingId(savingKey || null);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/saved-recruiters`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) return;
      const data = await res.json();
      const saved = data.contact;
      if (saved) {
        setSavedContacts((prev) => {
          const existingIdx = prev.findIndex((c) => c.id === saved.id);
          if (existingIdx >= 0) {
            const copy = [...prev];
            copy[existingIdx] = saved;
            return copy;
          }
          return [saved, ...prev];
        });
      }
    } finally {
      setSavingId(null);
    }
  };

  const handleDeleteSaved = async (id: string) => {
    if (!session?.access_token) return;
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/saved-recruiters/${id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      );
      if (!res.ok) return;
      setSavedContacts((prev) => prev.filter((c) => c.id !== id));
    } catch {
      // ignore delete error for now
    }
  };

  const savedKeys = new Set(
    savedContacts.map((c) => buildContactKey(c)).filter(Boolean),
  );

  return (
    <Tabs defaultValue="search" className="space-y-4">
      <TabsList>
        <TabsTrigger value="search">{t("searchTab")}</TabsTrigger>
        <TabsTrigger value="saved">{t("savedTab")}</TabsTrigger>
      </TabsList>

      <TabsContent value="search" className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex flex-1 gap-2">
            <Input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder={t("companyPlaceholder")}
              className="flex-1"
            />
          </div>
          <Button onClick={handleSearch} disabled={loading || !company.trim()}>
            <Search className="w-4 h-4 mr-2" />
            {loading ? "Recherche..." : "Rechercher"}
          </Button>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}

        {searched && results.length === 0 && !error && (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t("noResults")}
          </p>
        )}

        {results.length > 0 && (
          <div className="space-y-2">
            {results.map((contact, i) => {
              const key = buildContactKey({
                email: contact.email,
                linkedin_url: contact.linkedin_url,
                linkedin: (contact as any).linkedin,
                company,
              });
              const isSaved = savedKeys.has(key);
              const isSavingThis = savingId === key;

              return (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 bg-white border rounded-lg"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {contact.name ||
                        [contact.first_name, contact.last_name]
                          .filter(Boolean)
                          .join(" ") ||
                        "—"}
                    </p>
                    {contact.position && (
                      <p className="text-xs text-muted-foreground">
                        {formatPositionText(contact.position)}
                      </p>
                    )}
                    {contact.email && (
                      <p className="text-xs font-mono text-blue-600">
                        {contact.email}
                      </p>
                    )}
                    {(contact.linkedin_url || (contact as any).linkedin) && (
                      <a
                        href={
                          (contact.linkedin_url || (contact as any).linkedin) ??
                          "#"
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-600 underline break-all"
                      >
                        LinkedIn
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={isSaved ? "outline" : "secondary"}
                      size="sm"
                      className="gap-1"
                      onClick={() => handleSaveContact(contact)}
                      disabled={isSaved || isSavingThis}
                    >
                      {isSavingThis ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Bookmark className="w-3 h-3" />
                      )}
                      <span className="text-xs">
                        {isSaved ? t("saved") : t("save")}
                      </span>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {searched && (
          <p className="text-xs text-muted-foreground border-t pt-3">
            Ces emails proviennent de sources publiques. Respectez le RGPD dans
            vos communications.
          </p>
        )}
      </TabsContent>

      <TabsContent value="saved" className="space-y-4">
        {!session?.access_token && (
          <p className="text-sm text-muted-foreground">{t("loginRequired")}</p>
        )}

        {session?.access_token && (
          <>
            {loadingSaved ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t("loadingSaved")}</span>
              </div>
            ) : savedContacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("savedEmpty")}</p>
            ) : (
              <div className="space-y-2">
                {savedContacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="flex items-center justify-between p-3 bg-white border rounded-lg"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {contact.name || "—"}
                      </p>
                      {contact.position && (
                        <p className="text-xs text-muted-foreground">
                          {formatPositionText(contact.position)}
                        </p>
                      )}
                      {contact.email && (
                        <p className="text-xs font-mono text-blue-600">
                          {contact.email}
                        </p>
                      )}
                      {contact.company && (
                        <p className="text-xs text-muted-foreground">
                          {contact.company}
                        </p>
                      )}
                      {(contact.linkedin_url || (contact as any).linkedin) && (
                        <a
                          href={
                            (contact.linkedin_url ||
                              (contact as any).linkedin) ??
                            "#"
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-blue-600 underline break-all"
                        >
                          LinkedIn
                        </a>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteSaved(contact.id)}
                      title={t("remove")}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </TabsContent>
    </Tabs>
  );
}
