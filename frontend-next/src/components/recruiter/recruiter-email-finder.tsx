"use client";

import { useState } from "react";
import { AlertTriangle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/auth-context";

interface Contact {
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  position?: string;
  confidence?: number;
}

interface RecruiterEmailFinderProps {
  companyName: string;
  companyDomain?: string;
}

export function RecruiterEmailFinder({
  companyName,
  companyDomain,
}: RecruiterEmailFinderProps) {
  const { session } = useAuth();
  const [company, setCompany] = useState(companyName);
  const [results, setResults] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

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
          }),
        },
      );
      if (res.status === 429) {
        setError(
          "Quota atteint (3 recherches/jour en version gratuite). Passez à Pro pour un accès illimité.",
        );
        return;
      }
      if (!res.ok) throw new Error("Erreur de recherche");
      const data = await res.json();
      setResults(data.recruiters || data.all_contacts || []);
      setSearched(true);
    } catch {
      setError("Impossible de contacter le service. Réessayez.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Badge BÊTA + disclaimer */}
      <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
        <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
        <div className="text-xs text-orange-700">
          <span className="font-semibold">BÊTA</span> — Cette fonctionnalité est
          en cours d&apos;amélioration. Les résultats peuvent être incomplets.
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Nom de l'entreprise"
          className="flex-1"
        />
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
          Aucun contact trouvé pour cette entreprise.
        </p>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((contact, i) => (
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
                    {contact.position}
                  </p>
                )}
                {contact.email && (
                  <p className="text-xs font-mono text-blue-600">
                    {contact.email}
                  </p>
                )}
              </div>
              {contact.confidence && (
                <Badge variant="outline" className="text-xs">
                  {contact.confidence}% confiance
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}

      {searched && (
        <p className="text-xs text-muted-foreground border-t pt-3">
          Ces emails proviennent de sources publiques. Respectez le RGPD dans
          vos communications.
        </p>
      )}
    </div>
  );
}
