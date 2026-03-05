"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { useAuthenticatedFetch } from "@/hooks/use-authenticated-fetch";
import type { UserDocument } from "@/hooks/use-documents";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";
const SIGNED_URL_EXPIRY = 10 * 365 * 24 * 3600;

interface Experience {
  title: string;
  company: string;
  start_date: string;
  end_date: string;
  description: string;
}

interface PersonalInfo {
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedin?: string;
}

interface EditState {
  personal_info: PersonalInfo;
  summary: string;
  experiences: Experience[];
}

function toEditState(cvData: Record<string, unknown>): EditState {
  const pi = (cvData.personal_info ?? {}) as Record<string, string>;
  const exps = ((cvData.experiences as unknown[]) ?? []) as Record<
    string,
    string
  >[];
  return {
    personal_info: {
      name: pi.name ?? "",
      email: pi.email ?? "",
      phone: pi.phone ?? "",
      location: pi.location ?? "",
      linkedin: pi.linkedin ?? "",
    },
    summary: (cvData.summary as string) ?? "",
    experiences: exps.map((e) => ({
      title: e.title ?? "",
      company: e.company ?? "",
      start_date: e.start_date ?? "",
      end_date: e.end_date ?? "",
      description: e.description ?? "",
    })),
  };
}

interface DocumentEditDialogProps {
  document: UserDocument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  updateDocument: (
    id: string,
    updates: { cv_pdf_url?: string; cv_data?: Record<string, unknown> }
  ) => Promise<UserDocument | null>;
}

export function DocumentEditDialog({
  document,
  open,
  onOpenChange,
  updateDocument,
}: DocumentEditDialogProps) {
  const { authenticatedFetch } = useAuthenticatedFetch();
  const [state, setState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && document?.cv_data) {
      setState(toEditState(document.cv_data));
      setError(null);
    }
  }, [open, document]);

  const updatePI = (field: keyof PersonalInfo, value: string) => {
    setState((prev) =>
      prev
        ? { ...prev, personal_info: { ...prev.personal_info, [field]: value } }
        : prev
    );
  };

  const updateExp = (
    index: number,
    field: keyof Experience,
    value: string
  ) => {
    setState((prev) => {
      if (!prev) return prev;
      const exps = prev.experiences.map((e, i) =>
        i === index ? { ...e, [field]: value } : e
      );
      return { ...prev, experiences: exps };
    });
  };

  const addExp = () => {
    setState((prev) =>
      prev
        ? {
            ...prev,
            experiences: [
              ...prev.experiences,
              {
                title: "",
                company: "",
                start_date: "",
                end_date: "",
                description: "",
              },
            ],
          }
        : prev
    );
  };

  const removeExp = (index: number) => {
    setState((prev) =>
      prev
        ? {
            ...prev,
            experiences: prev.experiences.filter((_, i) => i !== index),
          }
        : prev
    );
  };

  const handleSave = async () => {
    if (!document || !state) return;
    setSaving(true);
    setError(null);

    try {
      // Merge edits back into full cv_data
      const updatedCvData: Record<string, unknown> = {
        ...(document.cv_data ?? {}),
        personal_info: { ...(document.cv_data?.personal_info ?? {}), ...state.personal_info },
        summary: state.summary,
        experiences: state.experiences,
      };

      // 1. Generate new PDF
      const pdfRes = await authenticatedFetch(
        `${BACKEND_URL}/api/cv-adapter/generate-pdf`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cv_data: updatedCvData,
            template: "ats",
            language: document.language ?? "fr",
          }),
        }
      );
      if (!pdfRes.ok) throw new Error("Échec de la génération du PDF");
      const pdfBlob = await pdfRes.blob();

      // 2. Upload to Supabase Storage
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Session expirée");

      const userId = session.user.id;
      const companySlug = document.company
        .replace(/[^a-z0-9]/gi, "_")
        .toLowerCase()
        .slice(0, 40);
      const cvPath = `${userId}/cv_${companySlug}_${Date.now()}_edit.pdf`;

      const { data: uploaded, error: uploadErr } = await supabase.storage
        .from("cvs-adaptes")
        .upload(cvPath, pdfBlob, { contentType: "application/pdf" });

      if (uploadErr || !uploaded)
        throw new Error("Échec de l'upload du PDF");

      const { data: signed } = await supabase.storage
        .from("cvs-adaptes")
        .createSignedUrl(uploaded.path, SIGNED_URL_EXPIRY);

      const cvPdfUrl = signed?.signedUrl ?? null;

      // 3. PATCH backend
      await updateDocument(document.id, {
        cv_data: updatedCvData,
        ...(cvPdfUrl ? { cv_pdf_url: cvPdfUrl } : {}),
      });

      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  if (!document?.cv_data || !state) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Modifier le CV</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-4">
            Données CV non disponibles pour l&apos;édition.
          </p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="text-base">
            Modifier — {document.job_title} @ {document.company}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Personal Info */}
          <section>
            <h3 className="text-sm font-semibold mb-3">Informations personnelles</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label htmlFor="pi-name" className="text-xs">Nom complet</Label>
                <Input
                  id="pi-name"
                  value={state.personal_info.name}
                  onChange={(e) => updatePI("name", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="pi-email" className="text-xs">Email</Label>
                <Input
                  id="pi-email"
                  type="email"
                  value={state.personal_info.email}
                  onChange={(e) => updatePI("email", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="pi-phone" className="text-xs">Téléphone</Label>
                <Input
                  id="pi-phone"
                  value={state.personal_info.phone}
                  onChange={(e) => updatePI("phone", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="pi-location" className="text-xs">Localisation</Label>
                <Input
                  id="pi-location"
                  value={state.personal_info.location}
                  onChange={(e) => updatePI("location", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="pi-linkedin" className="text-xs">LinkedIn</Label>
                <Input
                  id="pi-linkedin"
                  value={state.personal_info.linkedin ?? ""}
                  onChange={(e) => updatePI("linkedin", e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          </section>

          {/* Summary */}
          <section>
            <h3 className="text-sm font-semibold mb-3">Résumé professionnel</h3>
            <Textarea
              value={state.summary}
              onChange={(e) =>
                setState((prev) =>
                  prev ? { ...prev, summary: e.target.value } : prev
                )
              }
              rows={4}
            />
          </section>

          {/* Experiences */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Expériences</h3>
              <Button variant="outline" size="sm" onClick={addExp}>
                <Plus className="size-3 mr-1" />
                Ajouter
              </Button>
            </div>
            <div className="space-y-4">
              {state.experiences.map((exp, i) => (
                <div key={i} className="border rounded-lg p-3 space-y-2 relative">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 size-6 text-muted-foreground hover:text-destructive"
                    onClick={() => removeExp(i)}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                  <div className="grid grid-cols-2 gap-2 pr-8">
                    <div>
                      <Label className="text-xs">Poste</Label>
                      <Input
                        value={exp.title}
                        onChange={(e) => updateExp(i, "title", e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Entreprise</Label>
                      <Input
                        value={exp.company}
                        onChange={(e) =>
                          updateExp(i, "company", e.target.value)
                        }
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Début</Label>
                      <Input
                        value={exp.start_date}
                        onChange={(e) =>
                          updateExp(i, "start_date", e.target.value)
                        }
                        className="mt-1"
                        placeholder="Ex: 2022-01"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Fin</Label>
                      <Input
                        value={exp.end_date}
                        onChange={(e) =>
                          updateExp(i, "end_date", e.target.value)
                        }
                        className="mt-1"
                        placeholder="Ex: 2024-06 ou Présent"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Description</Label>
                    <Textarea
                      value={exp.description}
                      onChange={(e) =>
                        updateExp(i, "description", e.target.value)
                      }
                      rows={3}
                      className="mt-1"
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {error && (
          <p className="px-6 py-2 text-xs text-destructive border-t">{error}</p>
        )}

        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="size-4 mr-2 animate-spin" />}
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
