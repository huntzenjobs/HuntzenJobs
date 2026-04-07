# Documents Preview & Edit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Preview (HTML iframe) and Edit (inline form + PDF regeneration) to the Documents page for both generated documents and CV profiles.

**Architecture:**
- Preview uses `POST /api/cv-adapter/preview` → renders HTML in a `<Dialog>` with `<iframe srcDoc>`, same as apply-modal.
- Edit opens an inline form dialog to modify `cv_data` fields, then calls `POST /api/cv-adapter/generate-pdf` → uploads to Supabase Storage → `PATCH /api/documents/{id}` to persist the new URL.
- A single `DocumentPreviewDialog` is reused for both profile cards and document cards.

**Tech Stack:** Next.js 14, React, shadcn/ui (Dialog, Sheet, Button), Supabase Storage, FastAPI backend, Tailwind CSS

---

## Context: Key Files

| File | Role |
|------|------|
| `frontend-next/src/app/(dashboard)/documents/page.tsx` | Documents page — has `DocumentCard` and `ProfileCard` components |
| `frontend-next/src/hooks/use-documents.ts` | `UserDocument` type + CRUD hooks |
| `frontend-next/src/components/jobs/apply-modal.tsx` | Reference for preview iframe + PDF generation pattern |
| `backend/src/api/routes/documents.py` | Backend documents CRUD — needs PATCH endpoint |
| `frontend-next/src/components/ui/sheet.tsx` | Sheet component (already exists) |
| `frontend-next/src/components/ui/dialog.tsx` | Dialog component (already exists) |

## API Reference

- `POST /api/cv-adapter/preview` — body: `{ cv_data, template: "ats", language: "fr" }` → returns HTML string
- `POST /api/cv-adapter/generate-pdf` — body: `{ cv_data, template: "ats", language: "fr" }` → returns PDF blob
- `GET /api/documents` — returns documents including `cv_data` field (from `select("*")`)
- `PATCH /api/documents/{id}` — **to create** — body: `{ cv_pdf_url?, cv_data? }`

---

## Task 1: Backend — Add PATCH endpoint to update a document

**Files:**
- Modify: `backend/src/api/routes/documents.py`

**Step 1: Add Pydantic model and PATCH route**

Add after the `DocumentMarkApplied` model (after line ~41):

```python
class DocumentUpdate(BaseModel):
    cv_pdf_url: Optional[str] = None
    cv_data: Optional[dict] = None


@router.patch("/{document_id}", status_code=200)
async def update_document(
    document_id: str,
    body: DocumentUpdate,
    authorization: Optional[str] = Header(None),
):
    user_id = _get_user_id(authorization)
    try:
        update_data = {k: v for k, v in body.model_dump().items() if v is not None}
        if not update_data:
            raise HTTPException(status_code=400, detail="Nothing to update")
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        response = (
            supabase.table("user_documents")
            .update(update_data)
            .eq("id", document_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not response.data:
            raise HTTPException(status_code=404, detail="Document not found")
        return {"document": response.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Documents] Update error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update document")
```

**Step 2: Verify no import is missing**

`datetime` and `timezone` are already imported at the top. `Optional` is already imported from `typing`.

**Step 3: Test the endpoint manually**

```bash
curl -X PATCH http://localhost:8000/api/documents/SOME_DOC_ID \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"cv_data": {"personal_info": {"name": "Test"}}}'
# Expected: {"document": {...}}
```

**Step 4: Commit**

```bash
git add backend/src/api/routes/documents.py
git commit -m "feat(documents): add PATCH endpoint for updating cv_data and pdf_url"
```

---

## Task 2: Frontend — Update `UserDocument` type + `updateDocument` hook

**Files:**
- Modify: `frontend-next/src/hooks/use-documents.ts`

**Step 1: Add `cv_data` to the `UserDocument` interface**

```typescript
export interface UserDocument {
  id: string;
  job_title: string;
  company: string;
  match_score: number | null;
  cv_pdf_url: string | null;
  lm_pdf_url: string | null;
  cv_data: Record<string, unknown>;   // ← ADD THIS
  language: string;
  saved_job_id: string | null;
  job_url: string | null;
  created_at: string;
}
```

**Step 2: Add `updateDocument` function in the `useDocuments` hook**

Add after `deleteDocument`:

```typescript
const updateDocument = useCallback(
  async (
    documentId: string,
    updates: { cvPdfUrl?: string; cvData?: Record<string, unknown> }
  ): Promise<boolean> => {
    const res = await authenticatedFetch(
      `${BACKEND_URL}/api/documents/${documentId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cv_pdf_url: updates.cvPdfUrl,
          cv_data: updates.cvData,
        }),
      }
    );
    if (!res.ok) return false;
    const data = await res.json();
    setDocuments((prev) =>
      prev.map((d) => (d.id === documentId ? { ...d, ...data.document } : d))
    );
    return true;
  },
  [authenticatedFetch]
);
```

**Step 3: Export `updateDocument` in the return object**

```typescript
return {
  documents,
  loading,
  fetchDocuments,
  saveDocument,
  markApplied,
  deleteDocument,
  updateDocument,  // ← ADD
};
```

**Step 4: Commit**

```bash
git add frontend-next/src/hooks/use-documents.ts
git commit -m "feat(documents): add cv_data to UserDocument type and updateDocument hook"
```

---

## Task 3: Create `DocumentPreviewDialog` component

**Files:**
- Create: `frontend-next/src/components/documents/document-preview-dialog.tsx`

**Step 1: Create the component**

```tsx
"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Pencil } from "lucide-react";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

interface DocumentPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cvData: Record<string, unknown>;
  title: string;
  language?: string;
  onEdit?: () => void; // if provided, shows "Modifier" button
}

export function DocumentPreviewDialog({
  open,
  onOpenChange,
  cvData,
  title,
  language = "fr",
  onEdit,
}: DocumentPreviewDialogProps) {
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !cvData) return;
    setLoading(true);
    fetch(`${BACKEND_URL}/api/cv-adapter/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cv_data: cvData, template: "ats", language }),
    })
      .then((r) => r.text())
      .then(setHtml)
      .catch(() => setHtml("<p>Erreur lors du chargement de l'aperçu.</p>"))
      .finally(() => setLoading(false));
  }, [open, cvData, language]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b flex-row items-center justify-between">
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
          {onEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                onEdit();
              }}
            >
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Modifier
            </Button>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <iframe
              srcDoc={html}
              className="w-full h-full border-0"
              title="CV Preview"
              sandbox="allow-same-origin"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Commit**

```bash
git add frontend-next/src/components/documents/document-preview-dialog.tsx
git commit -m "feat(documents): add DocumentPreviewDialog component with iframe preview"
```

---

## Task 4: Create `DocumentEditDialog` component

**Files:**
- Create: `frontend-next/src/components/documents/document-edit-dialog.tsx`

**Step 1: Create the component**

This mirrors the "preview step" inline editor from `apply-modal.tsx`. It handles personal_info, summary, experiences, skills, education.

```tsx
"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";
const SIGNED_URL_EXPIRY = 10 * 365 * 24 * 3600;

interface DocumentEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  initialCvData: Record<string, unknown>;
  language?: string;
  onSaved: (newCvPdfUrl: string, newCvData: Record<string, unknown>) => void;
}

export function DocumentEditDialog({
  open,
  onOpenChange,
  documentId,
  initialCvData,
  language = "fr",
  onSaved,
}: DocumentEditDialogProps) {
  const [cvData, setCvData] = useState<Record<string, unknown>>(initialCvData);
  const [saving, setSaving] = useState(false);

  // Helper to update nested fields
  const updatePersonalInfo = (field: string, value: string) => {
    setCvData((prev) => ({
      ...prev,
      personal_info: { ...(prev.personal_info as Record<string, unknown> ?? {}), [field]: value },
    }));
  };

  const personalInfo = (cvData.personal_info as Record<string, string>) ?? {};
  const summary = (cvData.summary as string) ?? "";

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1. Generate new PDF
      const pdfRes = await fetch(`${BACKEND_URL}/api/cv-adapter/generate-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cv_data: cvData, template: "ats", language }),
      });
      if (!pdfRes.ok) throw new Error("Erreur génération PDF");
      const pdfBlob = await pdfRes.blob();

      // 2. Upload to Supabase Storage
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Non authentifié");

      const ts = Date.now();
      const path = `${session.user.id}/cv_edited_${ts}.pdf`;
      const { data: upload, error: uploadErr } = await supabase.storage
        .from("cvs-adaptes")
        .upload(path, pdfBlob, { contentType: "application/pdf" });

      if (uploadErr || !upload) throw new Error("Erreur upload PDF");

      const { data: signed } = await supabase.storage
        .from("cvs-adaptes")
        .createSignedUrl(upload.path, SIGNED_URL_EXPIRY);
      const newUrl = signed?.signedUrl ?? "";

      // 3. PATCH document in backend
      const patchRes = await fetch(`${BACKEND_URL}/api/documents/${documentId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ cv_pdf_url: newUrl, cv_data: cvData }),
      });
      if (!patchRes.ok) throw new Error("Erreur sauvegarde");

      onSaved(newUrl, cvData);
      onOpenChange(false);
      toast.success("CV mis à jour !");
    } catch (e) {
      toast.error((e as Error).message || "Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>Modifier le CV adapté</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Personal Info */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Informations personnelles</h3>
            <div className="grid grid-cols-2 gap-3">
              {["name", "title", "email", "phone", "location"].map((field) => (
                <div key={field}>
                  <label className="text-xs text-gray-500 capitalize mb-1 block">{field}</label>
                  <Input
                    value={personalInfo[field] ?? ""}
                    onChange={(e) => updatePersonalInfo(field, e.target.value)}
                    className="text-sm"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Summary */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Résumé</h3>
            <Textarea
              value={summary}
              onChange={(e) => setCvData((p) => ({ ...p, summary: e.target.value }))}
              rows={4}
              className="text-sm resize-none"
            />
          </section>

          {/* Experiences */}
          {Array.isArray(cvData.experiences) && (cvData.experiences as unknown[]).length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Expériences ({(cvData.experiences as unknown[]).length})
              </h3>
              <div className="space-y-4">
                {(cvData.experiences as Record<string, unknown>[]).map((exp, i) => (
                  <div key={i} className="border border-gray-100 rounded-lg p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      {["company", "title", "start_date", "end_date"].map((field) => (
                        <div key={field}>
                          <label className="text-xs text-gray-400 capitalize mb-0.5 block">{field.replace("_", " ")}</label>
                          <Input
                            value={(exp[field] as string) ?? ""}
                            onChange={(e) => {
                              const updated = [...(cvData.experiences as Record<string, unknown>[])];
                              updated[i] = { ...updated[i], [field]: e.target.value };
                              setCvData((p) => ({ ...p, experiences: updated }));
                            }}
                            className="text-xs h-7"
                          />
                        </div>
                      ))}
                    </div>
                    {Array.isArray(exp.bullets) && (
                      <Textarea
                        value={(exp.bullets as string[]).join("\n")}
                        onChange={(e) => {
                          const updated = [...(cvData.experiences as Record<string, unknown>[])];
                          updated[i] = { ...updated[i], bullets: e.target.value.split("\n") };
                          setCvData((p) => ({ ...p, experiences: updated }));
                        }}
                        rows={3}
                        className="text-xs resize-none"
                        placeholder="Un bullet par ligne"
                      />
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-[#00D9FF] text-gray-900 hover:bg-[#00b8d9]">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
            Sauvegarder
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Commit**

```bash
git add frontend-next/src/components/documents/document-edit-dialog.tsx
git commit -m "feat(documents): add DocumentEditDialog with inline cv_data editing and PDF regeneration"
```

---

## Task 5: Wire up Preview + Edit in `documents/page.tsx`

**Files:**
- Modify: `frontend-next/src/app/(dashboard)/documents/page.tsx`

**Step 1: Update imports at the top of the file**

Add these imports:

```tsx
import { DocumentPreviewDialog } from "@/components/documents/document-preview-dialog";
import { DocumentEditDialog } from "@/components/documents/document-edit-dialog";
import { Eye } from "lucide-react";
```

Also update `useDocuments` destructuring to include `updateDocument`:

```tsx
const { documents, loading, fetchDocuments, deleteDocument, updateDocument } = useDocuments();
```

**Step 2: Add state for preview and edit modals in `DocumentsPage`**

```tsx
const [previewDoc, setPreviewDoc] = useState<UserDocument | null>(null);
const [editDoc, setEditDoc] = useState<UserDocument | null>(null);
const [previewProfile, setPreviewProfile] = useState<CvProfile | null>(null);
```

**Step 3: Update `DocumentCard` props and add buttons**

Change the `DocumentCard` call in the JSX from:

```tsx
<DocumentCard
  key={doc.id}
  doc={doc}
  onDelete={() => deleteDocument(doc.id)}
  t={t}
/>
```

To:

```tsx
<DocumentCard
  key={doc.id}
  doc={doc}
  onDelete={() => deleteDocument(doc.id)}
  onPreview={() => setPreviewDoc(doc)}
  onEdit={() => setEditDoc(doc)}
  t={t}
/>
```

**Step 4: Update `ProfileCard` call to add preview**

```tsx
<ProfileCard
  key={profile.id}
  profile={profile}
  onEdit={() => openEditWizard(profile)}
  onDelete={() => handleDeleteProfile(profile.id)}
  onPreview={() => setPreviewProfile(profile)}
/>
```

**Step 5: Add dialogs at the bottom of the return (before closing `</>` tag)**

```tsx
{/* Document Preview Dialog */}
{previewDoc && (
  <DocumentPreviewDialog
    open={!!previewDoc}
    onOpenChange={(v) => !v && setPreviewDoc(null)}
    cvData={previewDoc.cv_data}
    title={`${previewDoc.job_title} · ${previewDoc.company}`}
    language={previewDoc.language}
    onEdit={() => {
      setEditDoc(previewDoc);
      setPreviewDoc(null);
    }}
  />
)}

{/* Document Edit Dialog */}
{editDoc && (
  <DocumentEditDialog
    open={!!editDoc}
    onOpenChange={(v) => !v && setEditDoc(null)}
    documentId={editDoc.id}
    initialCvData={editDoc.cv_data}
    language={editDoc.language}
    onSaved={(newUrl, newCvData) =>
      updateDocument(editDoc.id, { cvPdfUrl: newUrl, cvData: newCvData })
    }
  />
)}

{/* Profile Preview Dialog */}
{previewProfile && (
  <DocumentPreviewDialog
    open={!!previewProfile}
    onOpenChange={(v) => !v && setPreviewProfile(null)}
    cvData={previewProfile.cv_data as unknown as Record<string, unknown>}
    title={previewProfile.name}
  />
)}
```

**Step 6: Update `DocumentCard` component signature and add buttons**

Change the component props interface:

```tsx
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
  onEdit: () => void;
  t: (key: string) => string;
})
```

Add buttons before the download buttons row (inside the card, after the `<p>` date line):

```tsx
<div className="flex items-center gap-1 mb-2">
  <Button variant="ghost" size="sm" className="text-gray-500 hover:text-gray-900 h-7 px-2" onClick={onPreview}>
    <Eye className="h-3.5 w-3.5 mr-1" />
    Aperçu
  </Button>
  <Button variant="ghost" size="sm" className="text-gray-500 hover:text-gray-900 h-7 px-2" onClick={onEdit}>
    <Pencil className="h-3.5 w-3.5 mr-1" />
    Modifier
  </Button>
</div>
```

**Step 7: Update `ProfileCard` component to add preview button**

Change signature:

```tsx
function ProfileCard({
  profile,
  onEdit,
  onDelete,
  onPreview,
}: {
  profile: CvProfile;
  onEdit: () => void;
  onDelete: () => void;
  onPreview: () => void;
})
```

Add preview button before the edit button in ProfileCard:

```tsx
<Button
  variant="ghost"
  size="sm"
  className="text-gray-500 hover:text-gray-900"
  onClick={onPreview}
>
  <Eye className="h-3.5 w-3.5 mr-1.5" />
  Aperçu
</Button>
```

**Step 8: Ensure `Eye` icon is imported (already listed in Task 5 Step 1)**

**Step 9: Commit**

```bash
git add frontend-next/src/app/(dashboard)/documents/page.tsx
git commit -m "feat(documents): wire up preview and edit dialogs for documents and profiles"
```

---

## Task 6: Create the `documents` components directory

**Note:** This is a prerequisite for Tasks 3 and 4. Create the directory:

```bash
mkdir -p frontend-next/src/components/documents
```

---

## Task Order (Correct Sequence)

1. Task 6 (mkdir)
2. Task 1 (backend PATCH endpoint)
3. Task 2 (frontend types + hook)
4. Task 3 (PreviewDialog component)
5. Task 4 (EditDialog component)
6. Task 5 (wire up in page.tsx)

---

## Verification

**End-to-end test:**

1. Go to `/documents` page
2. Click **"Aperçu"** on a generated document → Dialog opens with rendered HTML CV ✅
3. Click **"Modifier"** in the preview dialog → Edit dialog opens pre-filled ✅
4. Edit a name or summary field → click **"Sauvegarder"**
5. Toast "CV mis à jour!" appears ✅
6. Download button now shows the new PDF ✅
7. Click **"Aperçu"** on a profile card → Preview renders (no edit button) ✅
8. Click **"Modifier"** directly on a document → Edit dialog opens immediately ✅

**Edge cases:**
- Empty `cv_data` (old documents) → Preview shows empty iframe without crashing
- API error on save → toast error shown, dialog stays open
