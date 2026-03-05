"use client";

import { useEffect, useState } from "react";
import {
  FolderOpen,
  Download,
  ExternalLink,
  Trash2,
  Search,
  User,
  Plus,
  Pencil,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocuments, type UserDocument } from "@/hooks/use-documents";
import { useCvProfiles, type CvProfile } from "@/hooks/use-cv-profiles";
import { CvBuilderWizard } from "@/components/cv-builder/cv-builder-wizard";
import type { CvData } from "@/components/cv-builder/types";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { DocumentPreviewDialog } from "@/components/documents/document-preview-dialog";
import { DocumentEditDialog } from "@/components/documents/document-edit-dialog";

type Filter = "all" | "cv-only" | "cv-lm";

export default function DocumentsPage() {
  const t = useTranslations("dashboard.documents");
  const { documents, loading, fetchDocuments, deleteDocument, updateDocument } =
    useDocuments();
  const {
    profiles,
    loading: profilesLoading,
    fetchProfiles,
    saveProfile,
    updateProfile,
    deleteProfile,
  } = useCvProfiles();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<CvProfile | null>(null);
  const [previewDoc, setPreviewDoc] = useState<UserDocument | null>(null);
  const [editDoc, setEditDoc] = useState<UserDocument | null>(null);

  const FILTER_LABELS: Record<Filter, string> = {
    all: t("filterAll"),
    "cv-only": t("filterCvOnly"),
    "cv-lm": t("filterCvAndCoverLetter"),
  };

  useEffect(() => {
    fetchDocuments();
    fetchProfiles();
  }, [fetchDocuments, fetchProfiles]);

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

  const handleWizardSave = async (name: string, data: CvData) => {
    if (editingProfile) {
      await updateProfile(editingProfile.id, name, data);
      toast.success("Profil mis à jour !");
    } else {
      const saved = await saveProfile(name, data);
      if (saved) {
        toast.success("Profil sauvegardé !");
      } else {
        toast.error("Erreur lors de la sauvegarde du profil.");
      }
    }
    setEditingProfile(null);
  };

  const handleDeleteProfile = async (id: string) => {
    await deleteProfile(id);
    toast.success("Profil supprimé.");
  };

  const openEditWizard = (profile: CvProfile) => {
    setEditingProfile(profile);
    setWizardOpen(true);
  };

  const openNewWizard = () => {
    setEditingProfile(null);
    setWizardOpen(true);
  };

  return (
    <>
      <div className="p-6 max-w-3xl mx-auto space-y-8">
        {/* ── Section Profils CV ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <User className="h-5 w-5 text-[#00D9FF]" />
                Mes profils CV
              </h2>
              <p className="text-gray-500 text-xs mt-0.5">
                Réutilisez votre profil pour générer des documents adaptés à
                chaque offre
              </p>
            </div>
            <Button
              size="sm"
              onClick={openNewWizard}
              className="bg-[#00D9FF] text-gray-900 hover:bg-[#00b8d9]"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Créer un profil
            </Button>
          </div>

          {profilesLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : profiles.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center">
              <User className="h-10 w-10 mx-auto mb-3 text-gray-300" />
              <p className="text-sm font-medium text-gray-500 mb-1">
                Aucun profil CV créé
              </p>
              <p className="text-xs text-gray-400 mb-4">
                Créez votre profil une fois et utilisez-le pour toutes vos
                candidatures sans re-uploader votre CV
              </p>
              <Button variant="outline" size="sm" onClick={openNewWizard}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Créer mon premier profil
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {profiles.map((profile) => (
                <ProfileCard
                  key={profile.id}
                  profile={profile}
                  onEdit={() => openEditWizard(profile)}
                  onDelete={() => handleDeleteProfile(profile.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Divider ── */}
        <div className="border-t border-gray-100" />

        {/* ── Section Documents générés ── */}
        <section>
          <div className="mb-4">
            <h2 className="text-lg font-bold text-gray-900">{t("title")}</h2>
            <p className="text-gray-500 text-sm mt-1">
              {t("subtitle")}
              {documents.length > 0 && (
                <span className="ml-1 text-gray-400">({documents.length})</span>
              )}
            </p>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t("searchPlaceholder")}
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
            <EmptyState hasDocuments={documents.length > 0} t={t} />
          ) : (
            <div className="space-y-3">
              {filtered.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  onDelete={() => deleteDocument(doc.id)}
                  onPreview={() => setPreviewDoc(doc)}
                  onEdit={doc.cv_data ? () => setEditDoc(doc) : undefined}
                  t={t}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Document Preview */}
      <DocumentPreviewDialog
        document={previewDoc}
        open={!!previewDoc}
        onOpenChange={(v) => !v && setPreviewDoc(null)}
        onEdit={
          previewDoc?.cv_data
            ? () => {
                setEditDoc(previewDoc);
                setPreviewDoc(null);
              }
            : undefined
        }
      />

      {/* Document Edit */}
      <DocumentEditDialog
        document={editDoc}
        open={!!editDoc}
        onOpenChange={(v) => !v && setEditDoc(null)}
        updateDocument={updateDocument}
      />

      {/* CV Builder Wizard */}
      <CvBuilderWizard
        open={wizardOpen}
        onOpenChange={(v) => {
          setWizardOpen(v);
          if (!v) setEditingProfile(null);
        }}
        initialData={
          editingProfile
            ? (editingProfile.cv_data as unknown as Partial<CvData>)
            : undefined
        }
        initialName={editingProfile?.name}
        onSave={handleWizardSave}
      />
    </>
  );
}

// ── ProfileCard ──────────────────────────────────────────────────────────────

function ProfileCard({
  profile,
  onEdit,
  onDelete,
}: {
  profile: CvProfile;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const name = profile.cv_data?.personal_info?.name;
  const title = profile.cv_data?.personal_info?.title;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between gap-4 hover:border-gray-300 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-9 w-9 rounded-full bg-[#00D9FF]/10 flex items-center justify-center shrink-0">
          <User className="h-4 w-4 text-[#00D9FF]" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">
            {profile.name}
          </p>
          <p className="text-xs text-gray-500 truncate">
            {name && title
              ? `${name} · ${title}`
              : name || title || "Profil CV"}
            {" · "}
            Modifié le{" "}
            {format(new Date(profile.updated_at), "d MMM yyyy", { locale: fr })}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-500 hover:text-gray-900"
          onClick={onEdit}
        >
          <Pencil className="h-3.5 w-3.5 mr-1.5" />
          Modifier
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-gray-300 hover:text-red-500 hover:bg-red-50"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({
  hasDocuments,
  t,
}: {
  hasDocuments: boolean;
  t: (key: string) => string;
}) {
  return (
    <div className="text-center py-16 text-gray-400">
      <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
      <p className="text-sm font-medium text-gray-500 mb-1">
        {t("emptyStateTitle")}
      </p>
      <p className="text-xs text-gray-400 mb-4">{t("emptyStateSubtitle")}</p>
      {!hasDocuments && (
        <Button variant="outline" size="sm" asChild>
          <a href="/jobs">Parcourir les offres</a>
        </Button>
      )}
    </div>
  );
}

// ── DocumentCard ─────────────────────────────────────────────────────────────

function DocumentCard({
  doc,
  onDelete,
  onPreview,
  onEdit,
  t,
}: {
  doc: UserDocument;
  onDelete: () => void;
  onPreview: () => void;
  onEdit?: () => void;
  t: (key: string) => string;
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
          {doc.company || "Entreprise non précisée"} · {t("generatedOn")}{" "}
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
                {t("cvLabel")}
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
                {t("coverLetterLabel")}
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
      <div className="flex items-center gap-1 shrink-0">
        {doc.cv_data && (
          <Button
            variant="ghost"
            size="icon"
            className="text-gray-400 hover:text-[#00D9FF]"
            onClick={onPreview}
            title="Prévisualiser"
          >
            <Eye className="h-4 w-4" />
          </Button>
        )}
        {onEdit && (
          <Button
            variant="ghost"
            size="icon"
            className="text-gray-400 hover:text-gray-900"
            onClick={onEdit}
            title="Modifier"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="text-gray-300 hover:text-red-500 hover:bg-red-50"
          onClick={onDelete}
          title={t("deleteButton")}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
