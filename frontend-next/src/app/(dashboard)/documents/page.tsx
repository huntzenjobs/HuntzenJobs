"use client";

import { useEffect, useState } from "react";
import {
  FolderOpen,
  Download,
  ExternalLink,
  Trash2,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocuments, type UserDocument } from "@/hooks/use-documents";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

type Filter = "all" | "cv-only" | "cv-lm";

const FILTER_LABELS: Record<Filter, string> = {
  all: "Tous",
  "cv-only": "CV seul",
  "cv-lm": "CV + LM",
};

export default function DocumentsPage() {
  const { documents, loading, fetchDocuments, deleteDocument } = useDocuments();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const filtered = documents.filter((doc) => {
    const matchSearch =
      doc.job_title.toLowerCase().includes(search.toLowerCase()) ||
      doc.company.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === "all" ||
      (filter === "cv-only" && !doc.lm_pdf_url) ||
      (filter === "cv-lm" && !!doc.lm_pdf_url);
    return matchSearch && matchFilter;
  });

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Mes documents</h1>
        <p className="text-gray-500 text-sm mt-1">
          CV adaptés et lettres de motivation générés
          {documents.length > 0 && (
            <span className="ml-1 text-gray-400">({documents.length})</span>
          )}
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Rechercher par poste ou entreprise..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          {(["all", "cv-only", "cv-lm"] as Filter[]).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
            >
              {FILTER_LABELS[f]}
            </Button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState hasDocuments={documents.length > 0} />
      ) : (
        <div className="space-y-3">
          {filtered.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              onDelete={() => deleteDocument(doc.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ hasDocuments }: { hasDocuments: boolean }) {
  return (
    <div className="text-center py-16 text-gray-400">
      <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
      <p className="text-sm font-medium text-gray-500 mb-1">
        {hasDocuments ? "Aucun document trouvé" : "Aucun document généré"}
      </p>
      <p className="text-xs text-gray-400 mb-4">
        {hasDocuments
          ? "Essayez d'autres termes de recherche"
          : "Générez un CV adapté depuis une offre d'emploi"}
      </p>
      {!hasDocuments && (
        <Button variant="outline" size="sm" asChild>
          <a href="/jobs">Parcourir les offres</a>
        </Button>
      )}
    </div>
  );
}

function DocumentCard({
  doc,
  onDelete,
}: {
  doc: UserDocument;
  onDelete: () => void;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-start justify-between gap-4 hover:border-gray-300 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <p className="font-semibold text-gray-900 text-sm truncate">
            {doc.job_title}
          </p>
          {doc.match_score != null && (
            <Badge variant="secondary" className="shrink-0 text-xs">
              {doc.match_score}% match
            </Badge>
          )}
        </div>
        <p className="text-xs text-gray-500 mb-3">
          {doc.company || "Entreprise non précisée"} ·{" "}
          {format(new Date(doc.created_at), "d MMM yyyy", { locale: fr })}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {doc.cv_pdf_url && (
            <Button variant="outline" size="sm" asChild>
              <a
                href={doc.cv_pdf_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                CV adapté
              </a>
            </Button>
          )}
          {doc.lm_pdf_url && (
            <Button variant="outline" size="sm" asChild>
              <a
                href={doc.lm_pdf_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Lettre de motivation
              </a>
            </Button>
          )}
          {doc.job_url && (
            <Button variant="ghost" size="sm" asChild>
              <a
                href={doc.job_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500"
              >
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Voir l&apos;offre
              </a>
            </Button>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="text-gray-300 hover:text-red-500 hover:bg-red-50 shrink-0"
        onClick={onDelete}
        title="Supprimer"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
