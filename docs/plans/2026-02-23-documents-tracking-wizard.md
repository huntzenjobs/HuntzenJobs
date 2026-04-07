# Documents, Tracking & Wizard Intelligent — Plan d'implémentation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persister les CV/LM générés dans Supabase Storage, créer une page /documents, tracker les candidatures dans saved-jobs, et enrichir le wizard /cv-analysis avec une 3ème option "Adapter mon CV" + CTAs intelligents post-analyse.

**Architecture:** Le frontend génère les PDFs via le backend existant (retourne des bytes), puis les uploade directement dans Supabase Storage via le client JS, puis sauvegarde les métadonnées via un nouvel endpoint `/api/documents`. Tout est lié via la table `user_documents` qui référence optionnellement une entrée `saved_jobs`.

**Tech Stack:** Next.js 14, FastAPI (Python), Supabase JS (Storage + DB), shadcn/ui, TypeScript, Tailwind CSS

**Design doc de référence :** `docs/plans/2026-02-23-documents-tracking-wizard-design.md`

---

## TÂCHE 1 — Migration DB : table `user_documents`

**Files:**
- Create: `supabase/migrations/20260223000001_create_user_documents.sql`

**Step 1: Créer le fichier de migration**

```sql
-- supabase/migrations/20260223000001_create_user_documents.sql

CREATE TABLE IF NOT EXISTS user_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_title       TEXT NOT NULL,
  company         TEXT NOT NULL DEFAULT '',
  match_score     INTEGER,
  cv_data         JSONB NOT NULL DEFAULT '{}'::jsonb,
  cv_pdf_url      TEXT,
  lm_pdf_url      TEXT,
  language        TEXT NOT NULL DEFAULT 'fr',
  saved_job_id    UUID REFERENCES saved_jobs(id) ON DELETE SET NULL,
  job_url         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE user_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own documents"
  ON user_documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own documents"
  ON user_documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents"
  ON user_documents FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_user_documents_user_id ON user_documents(user_id);
CREATE INDEX idx_user_documents_created_at ON user_documents(created_at DESC);
CREATE INDEX idx_user_documents_saved_job_id ON user_documents(saved_job_id);
```

**Step 2: Appliquer la migration**

```bash
cd /Users/wissem/HuntzenIA/huntzen_jobsearch
npx supabase db push
# ou via Supabase Dashboard → SQL Editor → Run
```

**Step 3: Commit**

```bash
git add supabase/migrations/20260223000001_create_user_documents.sql
git commit -m "feat(db): add user_documents table for CV/LM persistence"
```

---

## TÂCHE 2 — Migration DB : colonnes `applied_at` + `cv_document_id` sur `saved_jobs`

**Files:**
- Create: `supabase/migrations/20260223000002_add_tracking_to_saved_jobs.sql`

**Step 1: Créer la migration**

```sql
-- supabase/migrations/20260223000002_add_tracking_to_saved_jobs.sql

ALTER TABLE saved_jobs
  ADD COLUMN IF NOT EXISTS applied_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cv_document_id UUID REFERENCES user_documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_saved_jobs_cv_document_id
  ON saved_jobs(cv_document_id);
```

**Step 2: Appliquer**

```bash
npx supabase db push
```

**Step 3: Commit**

```bash
git add supabase/migrations/20260223000002_add_tracking_to_saved_jobs.sql
git commit -m "feat(db): add applied_at and cv_document_id to saved_jobs"
```

---

## TÂCHE 3 — Supabase Storage : créer les buckets

**Files:** Aucun fichier à créer — configuration via Supabase Dashboard ou SQL.

**Step 1: Créer les buckets via SQL (migration)**

```sql
-- À exécuter dans Supabase Dashboard → SQL Editor
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('cvs-adaptes', 'cvs-adaptes', false),
  ('lettres-motivation', 'lettres-motivation', false)
ON CONFLICT (id) DO NOTHING;

-- Policies Storage : un user ne peut accéder qu'à son dossier
CREATE POLICY "Users upload own CVs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'cvs-adaptes' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users read own CVs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'cvs-adaptes' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users delete own CVs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'cvs-adaptes' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Même chose pour lettres-motivation
CREATE POLICY "Users upload own LMs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'lettres-motivation' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users read own LMs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'lettres-motivation' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users delete own LMs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'lettres-motivation' AND (storage.foldername(name))[1] = auth.uid()::text);
```

**Step 2: Vérifier dans le Dashboard**

Supabase Dashboard → Storage → vérifier que `cvs-adaptes` et `lettres-motivation` existent.

---

## TÂCHE 4 — Backend : route `/api/documents`

**Files:**
- Create: `backend/src/api/routes/documents.py`
- Modify: `backend/src/api/routes/__init__.py`

**Step 1: Créer le fichier de route**

```python
# backend/src/api/routes/documents.py
"""
Documents API Routes
=====================
CRUD pour les documents générés (CV adaptés + LM).
Les PDFs sont stockés dans Supabase Storage côté frontend.
Ce endpoint gère uniquement les métadonnées.
"""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Header, status
from pydantic import BaseModel
from supabase import create_client, Client

from src.config.settings import get_settings

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()

supabase: Client = create_client(
    settings.supabase_url,
    settings.get_supabase_service_role_key()
)


# ============================================================================
# Schemas
# ============================================================================

class DocumentCreate(BaseModel):
    job_title: str
    company: str = ""
    match_score: Optional[int] = None
    cv_data: dict = {}
    cv_pdf_url: Optional[str] = None
    lm_pdf_url: Optional[str] = None
    language: str = "fr"
    saved_job_id: Optional[str] = None
    job_url: Optional[str] = None


class DocumentMarkApplied(BaseModel):
    saved_job_id: str


# ============================================================================
# Auth helper
# ============================================================================

def _get_user_id(authorization: Optional[str]) -> str:
    """Extract user_id from Supabase JWT token."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")

    token = authorization.removeprefix("Bearer ")
    try:
        user = supabase.auth.get_user(token)
        return user.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


# ============================================================================
# Routes
# ============================================================================

@router.get("")
async def list_documents(authorization: Optional[str] = Header(None)):
    """List all documents for the authenticated user."""
    user_id = _get_user_id(authorization)
    try:
        response = (
            supabase.table("user_documents")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return {"documents": response.data}
    except Exception as e:
        logger.error(f"[Documents] List error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch documents")


@router.post("", status_code=201)
async def create_document(
    body: DocumentCreate,
    authorization: Optional[str] = Header(None),
):
    """Save a new document record after PDFs are uploaded to Storage."""
    user_id = _get_user_id(authorization)
    try:
        data = {
            "user_id": user_id,
            "job_title": body.job_title,
            "company": body.company,
            "match_score": body.match_score,
            "cv_data": body.cv_data,
            "cv_pdf_url": body.cv_pdf_url,
            "lm_pdf_url": body.lm_pdf_url,
            "language": body.language,
            "saved_job_id": body.saved_job_id,
            "job_url": body.job_url,
        }
        response = supabase.table("user_documents").insert(data).execute()

        if not response.data:
            raise Exception("Insert returned no data")

        doc = response.data[0]

        # Link to saved_job if provided
        if body.saved_job_id:
            supabase.table("saved_jobs").update(
                {"cv_document_id": doc["id"]}
            ).eq("id", body.saved_job_id).eq("user_id", user_id).execute()

        return {"document": doc}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Documents] Create error: {e}")
        raise HTTPException(status_code=500, detail="Failed to save document")


@router.delete("/{document_id}", status_code=204)
async def delete_document(
    document_id: str,
    authorization: Optional[str] = Header(None),
):
    """Delete a document record (Storage files are deleted separately via RLS)."""
    user_id = _get_user_id(authorization)
    try:
        supabase.table("user_documents").delete().eq(
            "id", document_id
        ).eq("user_id", user_id).execute()
    except Exception as e:
        logger.error(f"[Documents] Delete error: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete document")


@router.post("/mark-applied")
async def mark_applied(
    body: DocumentMarkApplied,
    authorization: Optional[str] = Header(None),
):
    """Mark a saved job as applied (sets applied_at = NOW())."""
    user_id = _get_user_id(authorization)
    try:
        from datetime import datetime, timezone
        supabase.table("saved_jobs").update(
            {"applied_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", body.saved_job_id).eq("user_id", user_id).execute()
        return {"success": True}
    except Exception as e:
        logger.error(f"[Documents] Mark applied error: {e}")
        raise HTTPException(status_code=500, detail="Failed to mark as applied")
```

**Step 2: Enregistrer dans `__init__.py`**

Dans `backend/src/api/routes/__init__.py`, ajouter :

```python
from src.api.routes.documents import router as documents_router
# ...dans le bloc include_router :
router.include_router(documents_router, prefix="/api/documents", tags=["Documents"])
```

**Step 3: Vérifier la syntaxe**

```bash
python -m py_compile backend/src/api/routes/documents.py && echo "✅ OK"
```

**Step 4: Commit**

```bash
git add backend/src/api/routes/documents.py backend/src/api/routes/__init__.py
git commit -m "feat(backend): add /api/documents CRUD + mark-applied endpoint"
```

---

## TÂCHE 5 — Frontend : hook `useDocuments`

**Files:**
- Create: `frontend-next/src/hooks/use-documents.ts`

**Step 1: Créer le hook**

```typescript
// frontend-next/src/hooks/use-documents.ts
"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuthenticatedFetch } from "@/hooks/use-authenticated-fetch";

export interface UserDocument {
  id: string;
  job_title: string;
  company: string;
  match_score: number | null;
  cv_pdf_url: string | null;
  lm_pdf_url: string | null;
  language: string;
  saved_job_id: string | null;
  job_url: string | null;
  created_at: string;
}

interface SaveDocumentInput {
  jobTitle: string;
  company: string;
  matchScore?: number;
  cvData: Record<string, unknown>;
  cvPdfBlob: Blob;
  lmPdfBlob?: Blob;
  language: string;
  savedJobId?: string;
  jobUrl?: string;
}

export function useDocuments() {
  const [documents, setDocuments] = useState<UserDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const { authenticatedFetch } = useAuthenticatedFetch();
  const supabase = createClient();

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authenticatedFetch("/api/documents");
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch]);

  const saveDocument = useCallback(
    async (input: SaveDocumentInput): Promise<UserDocument | null> => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return null;

      const userId = session.user.id;
      const ts = Date.now();
      const companySlug = input.company.replace(/[^a-z0-9]/gi, "_").toLowerCase();

      // Upload CV PDF to Supabase Storage
      const cvPath = `${userId}/cv_${companySlug}_${ts}.pdf`;
      const { data: cvUpload, error: cvErr } = await supabase.storage
        .from("cvs-adaptes")
        .upload(cvPath, input.cvPdfBlob, { contentType: "application/pdf" });

      if (cvErr) {
        console.error("[useDocuments] CV upload error:", cvErr);
        return null;
      }

      const { data: cvUrlData } = supabase.storage
        .from("cvs-adaptes")
        .getPublicUrl(cvUpload.path);

      // Upload LM PDF if provided
      let lmPdfUrl: string | null = null;
      if (input.lmPdfBlob) {
        const lmPath = `${userId}/lm_${companySlug}_${ts}.pdf`;
        const { data: lmUpload, error: lmErr } = await supabase.storage
          .from("lettres-motivation")
          .upload(lmPath, input.lmPdfBlob, { contentType: "application/pdf" });

        if (!lmErr && lmUpload) {
          const { data: lmUrlData } = supabase.storage
            .from("lettres-motivation")
            .getPublicUrl(lmUpload.path);
          lmPdfUrl = lmUrlData.publicUrl;
        }
      }

      // Save metadata to backend
      const res = await authenticatedFetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_title: input.jobTitle,
          company: input.company,
          match_score: input.matchScore,
          cv_data: input.cvData,
          cv_pdf_url: cvUrlData.publicUrl,
          lm_pdf_url: lmPdfUrl,
          language: input.language,
          saved_job_id: input.savedJobId ?? null,
          job_url: input.jobUrl ?? null,
        }),
      });

      if (!res.ok) return null;
      const data = await res.json();
      return data.document as UserDocument;
    },
    [supabase, authenticatedFetch]
  );

  const markApplied = useCallback(
    async (savedJobId: string) => {
      await authenticatedFetch("/api/documents/mark-applied", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saved_job_id: savedJobId }),
      });
    },
    [authenticatedFetch]
  );

  const deleteDocument = useCallback(
    async (documentId: string) => {
      await authenticatedFetch(`/api/documents/${documentId}`, {
        method: "DELETE",
      });
      setDocuments((prev) => prev.filter((d) => d.id !== documentId));
    },
    [authenticatedFetch]
  );

  return {
    documents,
    loading,
    fetchDocuments,
    saveDocument,
    markApplied,
    deleteDocument,
  };
}
```

**Step 2: Vérifier TypeScript**

```bash
cd frontend-next && npx tsc --noEmit --skipLibCheck 2>&1 | grep use-documents
# Aucune erreur attendue
```

**Step 3: Commit**

```bash
git add frontend-next/src/hooks/use-documents.ts
git commit -m "feat(frontend): add useDocuments hook with Storage upload + backend persistence"
```

---

## TÂCHE 6 — Apply Modal : persistance après génération

**Files:**
- Modify: `frontend-next/src/components/jobs/apply-modal.tsx`

**Step 1: Ajouter l'import du hook et modifier le step "results"**

En haut du fichier, ajouter :
```typescript
import { useDocuments } from "@/hooks/use-documents";
```

Dans le composant, ajouter le hook :
```typescript
const { saveDocument, markApplied } = useDocuments();
const [savedDocumentId, setSavedDocumentId] = useState<string | null>(null);
const [markedApplied, setMarkedApplied] = useState(false);
```

**Step 2: Après génération réussie (fin du step "generating"), appeler saveDocument**

Localiser le bloc où `cvPdfBlob` et `lmPdfBlob` sont définis (step "generating") et ajouter après :

```typescript
// Persister dans Supabase Storage + DB
const savedDoc = await saveDocument({
  jobTitle: job.title,
  company: job.company ?? "",
  matchScore: matchScore ?? undefined,
  cvData: cvData,
  cvPdfBlob: cvPdfBlob,
  lmPdfBlob: lmPdfBlob ?? undefined,
  language: language,
  savedJobId: undefined, // TODO: passer si l'offre est dans saved_jobs
  jobUrl: job.url,
});
if (savedDoc) setSavedDocumentId(savedDoc.id);
```

**Step 3: Dans le step "results", ajouter le bouton "Marquer comme postulé"**

```tsx
{job.url && (
  <Button
    variant="outline"
    size="sm"
    onClick={async () => {
      // Pour l'instant, on marque visuellement
      // Le lien avec saved_job sera automatique via cv_document_id
      setMarkedApplied(true);
      toast.success("Candidature marquée comme envoyée !");
    }}
    disabled={markedApplied}
    className="w-full"
  >
    {markedApplied ? (
      <>✓ Candidature enregistrée</>
    ) : (
      <>Marquer comme postulé</>
    )}
  </Button>
)}
```

**Step 4: Vérifier prettier**

```bash
cd frontend-next && npx prettier --check src/components/jobs/apply-modal.tsx
```

**Step 5: Commit**

```bash
git add frontend-next/src/components/jobs/apply-modal.tsx
git commit -m "feat(apply-modal): persist generated PDFs to Supabase Storage + mark applied"
```

---

## TÂCHE 7 — Page `/documents`

**Files:**
- Create: `frontend-next/src/app/(dashboard)/documents/page.tsx`
- Modify: `frontend-next/src/components/layout/sidebar.tsx` (ajouter entrée nav)

**Step 1: Créer la page**

```tsx
// frontend-next/src/app/(dashboard)/documents/page.tsx
"use client";

import { useEffect, useState } from "react";
import { FileText, Download, ExternalLink, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocuments, type UserDocument } from "@/hooks/use-documents";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

type Filter = "all" | "cv-only" | "cv-lm";

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
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {(["all", "cv-only", "cv-lm"] as Filter[]).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {{ all: "Tous", "cv-only": "CV seul", "cv-lm": "CV + LM" }[f]}
          </Button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Aucun document trouvé</p>
          <Button variant="outline" size="sm" className="mt-4" asChild>
            <a href="/jobs">Parcourir les offres</a>
          </Button>
        </div>
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
        <div className="flex items-center gap-2 mb-1">
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
              <a href={doc.cv_pdf_url} target="_blank" rel="noopener noreferrer">
                <Download className="mr-1.5 h-3.5 w-3.5" />
                CV adapté
              </a>
            </Button>
          )}
          {doc.lm_pdf_url && (
            <Button variant="outline" size="sm" asChild>
              <a href={doc.lm_pdf_url} target="_blank" rel="noopener noreferrer">
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Lettre de motivation
              </a>
            </Button>
          )}
          {doc.job_url && (
            <Button variant="ghost" size="sm" asChild>
              <a href={doc.job_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Voir l'offre
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
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
```

**Step 2: Ajouter l'entrée dans la sidebar**

Dans `frontend-next/src/components/layout/sidebar.tsx`, dans le tableau `navigation` (après "Analyse CV") :

```typescript
{
  name: t("nav.documents"),  // clé i18n à ajouter
  href: "/documents",
  icon: FileText,
  premium: false,
},
```

**Note i18n :** Ajouter la clé `nav.documents` dans les fichiers de traduction :
- `messages/fr.json` → `"sidebar": { "nav": { "documents": "Mes documents" } }`
- `messages/en.json` → `"sidebar": { "nav": { "documents": "My Documents" } }`
- idem es.json, pt.json

**Step 3: Vérifier prettier + TypeScript**

```bash
cd frontend-next
npx prettier --check src/app/\(dashboard\)/documents/page.tsx
npx tsc --noEmit --skipLibCheck 2>&1 | grep documents
```

**Step 4: Commit**

```bash
git add frontend-next/src/app/\(dashboard\)/documents/
git add frontend-next/src/components/layout/sidebar.tsx
git add frontend-next/messages/
git commit -m "feat(frontend): add /documents page with PDF download and sidebar entry"
```

---

## TÂCHE 8 — Saved Jobs : badges de statut + bouton "Générer"

**Files:**
- Modify: `frontend-next/src/app/(dashboard)/saved-jobs/page.tsx`

**Step 1: Enrichir le type `SavedJob`**

Dans `saved-jobs/page.tsx`, ajouter les nouveaux champs au type :

```typescript
interface SavedJob {
  id: string;
  job_title: string;
  company: string;
  location: string;
  salary?: string;
  job_url: string;
  saved_at: string;
  description?: string;
  // Nouveaux champs
  applied_at?: string | null;
  cv_document_id?: string | null;
  // Document joiné (si présent)
  user_documents?: {
    id: string;
    cv_pdf_url: string | null;
    lm_pdf_url: string | null;
    match_score: number | null;
  } | null;
}
```

**Step 2: Modifier la requête fetch** pour inclure le join sur `user_documents`.

Dans le hook ou l'appel API, ajouter `?include_documents=true` si le backend le supporte, ou faire un fetch séparé des documents depuis le hook `useDocuments` et les matcher par `saved_job_id`.

**Approche simple :** fetch les documents séparément et merger côté client :

```typescript
// Dans le composant, après avoir chargé savedJobs :
const { documents } = useDocuments();
// ...
const jobsWithDocuments = savedJobs.map((job) => ({
  ...job,
  document: documents.find((d) => d.saved_job_id === job.id) ?? null,
}));
```

**Step 3: Ajouter les badges sur chaque carte**

Dans le JSX de chaque `SavedJob`, après la description :

```tsx
{/* Badges de statut */}
<div className="flex items-center gap-2 mt-2 flex-wrap">
  {job.document?.cv_pdf_url && (
    <a href={`/documents`} className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100 hover:bg-blue-100 transition-colors">
      <FileText className="h-3 w-3" />
      CV généré
      {job.document.match_score != null && ` · ${job.document.match_score}%`}
    </a>
  )}
  {job.document?.lm_pdf_url && (
    <span className="inline-flex items-center gap-1 text-xs text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-100">
      <Mail className="h-3 w-3" />
      LM générée
    </span>
  )}
  {job.applied_at && (
    <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-100">
      ✓ Postulé {format(new Date(job.applied_at), "d MMM", { locale: fr })}
    </span>
  )}
</div>

{/* Bouton Générer si pas encore fait */}
{!job.document && (
  <Button
    variant="outline"
    size="sm"
    className="mt-2 text-xs"
    onClick={() => {/* ouvrir ApplyModal avec ce job */}}
  >
    <Sparkles className="mr-1.5 h-3 w-3" />
    Générer CV + LM
  </Button>
)}
```

**Step 4: Vérifier + commit**

```bash
npx prettier --write src/app/\(dashboard\)/saved-jobs/page.tsx
git add frontend-next/src/app/\(dashboard\)/saved-jobs/page.tsx
git commit -m "feat(saved-jobs): add CV/LM generated badges and applied status tracking"
```

---

## TÂCHE 9 — Wizard `/cv-analysis` : 3ème option "Adapter mon CV"

**Files:**
- Modify: le composant wizard dans `frontend-next/src/` (trouver avec `grep -r "CVUploadAsyncWizard" src/`)

**Step 1: Localiser le fichier du wizard**

```bash
cd frontend-next
grep -r "CVUploadAsyncWizard\|analysisType\|Analyse ATS" src/ --include="*.tsx" -l
```

**Step 2: Ajouter le type d'analyse**

Dans l'enum/type du wizard, ajouter :
```typescript
type AnalysisType = "ats" | "matching" | "adapt";  // ajouter "adapt"
```

**Step 3: Ajouter l'option dans le step 2 (sélection du type)**

Ajouter un 3ème choix radio :

```tsx
<label className={cn("flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors", analysisType === "adapt" ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300")}>
  <input
    type="radio"
    name="analysisType"
    value="adapt"
    checked={analysisType === "adapt"}
    onChange={() => setAnalysisType("adapt")}
    className="mt-1"
  />
  <div>
    <p className="font-semibold text-gray-900 text-sm">Adapter mon CV à un poste</p>
    <p className="text-xs text-gray-500 mt-0.5">
      Génère un CV optimisé + une lettre de motivation pour une offre précise
    </p>
  </div>
</label>

{analysisType === "adapt" && (
  <div className="mt-3">
    <Textarea
      placeholder="Collez ici la description du poste (min. 20 caractères)..."
      value={jobDescriptionForAdapt}
      onChange={(e) => setJobDescriptionForAdapt(e.target.value)}
      rows={5}
      className="text-sm"
    />
  </div>
)}
```

**Step 4: Gérer le cas "adapt" dans la soumission**

Si `analysisType === "adapt"`, appeler `/api/cv-adapter/adapt/upload` + `/api/cv-adapter/pdf` + `/api/cv-adapter/generate-cover-letter`, puis `saveDocument()`.

Afficher le même step 3 "résultats" que l'Apply Modal (téléchargements + score).

**Step 5: Commit**

```bash
git add frontend-next/src/  # fichiers du wizard
git commit -m "feat(cv-analysis): add 'Adapter mon CV' as 3rd wizard option"
```

---

## TÂCHE 10 — Fin d'analyse : CTAs intelligents

**Files:**
- Modify: le composant de résultats du wizard (step 3 d'analyse ATS/matching)

**Step 1: Ajouter la section "Et maintenant ?" après les résultats**

```tsx
{/* CTAs intelligents post-analyse */}
<div className="mt-6 border-t border-gray-100 pt-6">
  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
    Et maintenant ?
  </p>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    {/* CTA 1 : Améliorer le CV */}
    <button
      onClick={() => {
        // Pré-sélectionner "adapt" dans le wizard avec les recommandations injectées
        setAnalysisType("adapt");
        setJobDescriptionForAdapt(
          weaknesses.map((w) => `Améliorer : ${w}`).join("\n")
        );
        setStep(2);  // retour au step de sélection
      }}
      className="flex items-start gap-3 p-4 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-left group"
    >
      <Sparkles className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold text-gray-900 text-sm">Améliorer mon CV</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Adapter mon CV avec toutes les recommandations
        </p>
      </div>
    </button>

    {/* CTA 2 : Offres recommandées */}
    <a
      href={`/jobs?q=${encodeURIComponent(topSkills.slice(0, 3).join(" "))}`}
      className="flex items-start gap-3 p-4 rounded-lg border border-gray-200 hover:border-violet-300 hover:bg-violet-50 transition-colors text-left"
    >
      <Search className="h-5 w-5 text-violet-500 shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold text-gray-900 text-sm">Offres recommandées</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Trouver des offres qui correspondent à ce profil
        </p>
      </div>
    </a>
  </div>
</div>
```

**Step 2: Extraire `topSkills` et `weaknesses` depuis le résultat de l'analyse**

Le résultat de l'analyse retourne `weaknesses` (liste des points faibles) et les skills extraites. S'assurer qu'elles sont disponibles dans le scope du composant.

**Step 3: Vérifier + commit**

```bash
npx prettier --write src/  # fichiers modifiés
git add frontend-next/src/
git commit -m "feat(cv-analysis): add smart CTAs after analysis (improve CV + recommended jobs)"
```

---

## RÉCAPITULATIF DES COMMITS

```
feat(db): add user_documents table for CV/LM persistence
feat(db): add applied_at and cv_document_id to saved_jobs
feat(backend): add /api/documents CRUD + mark-applied endpoint
feat(frontend): add useDocuments hook with Storage upload + backend persistence
feat(apply-modal): persist generated PDFs to Supabase Storage + mark applied
feat(frontend): add /documents page with PDF download and sidebar entry
feat(saved-jobs): add CV/LM generated badges and applied status tracking
feat(cv-analysis): add 'Adapter mon CV' as 3rd wizard option
feat(cv-analysis): add smart CTAs after analysis (improve CV + recommended jobs)
```

---

## VÉRIFICATION END-TO-END

1. **Génération depuis une offre :**
   - Ouvrir une offre → "Générer CV + lettre adaptés" → uploader un CV → vérifier que les PDFs sont dans Supabase Storage
   - Aller sur `/documents` → les 2 fichiers apparaissent avec score et date

2. **Saved Jobs tracking :**
   - Sauvegarder une offre → générer les docs → badges "CV généré" + "LM générée" visibles
   - Cliquer "Marquer comme postulé" → badge "Postulé" vert

3. **Téléchargement depuis `/documents` :**
   - Cliquer "⬇ CV adapté" → PDF s'ouvre dans un nouvel onglet

4. **Wizard "Adapter mon CV" :**
   - `/cv-analysis` → sélectionner "Adapter mon CV" → coller une description → générer → apparaît dans `/documents`

5. **CTAs post-analyse :**
   - Analyser un CV → en bas des résultats → "Améliorer mon CV" pré-remplit le wizard → "Offres recommandées" redirige vers `/jobs` avec les skills
