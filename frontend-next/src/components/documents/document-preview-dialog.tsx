"use client";

import { useEffect, useState } from "react";
import { Pencil, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuthenticatedFetch } from "@/hooks/use-authenticated-fetch";
import type { UserDocument } from "@/hooks/use-documents";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

interface DocumentPreviewDialogProps {
  document: UserDocument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: () => void;
}

export function DocumentPreviewDialog({
  document,
  open,
  onOpenChange,
  onEdit,
}: DocumentPreviewDialogProps) {
  const { authenticatedFetch } = useAuthenticatedFetch();
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !document) return;
    if (!document.cv_data) {
      setError("Données CV non disponibles pour la prévisualisation.");
      return;
    }

    setLoading(true);
    setError(null);
    setHtml(null);

    authenticatedFetch(`${BACKEND_URL}/api/cv-adapter/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cv_data: document.cv_data,
        template: "ats",
        compact: false,
        language: document.language ?? "fr",
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Erreur ${res.status}`);
        return res.text();
      })
      .then(setHtml)
      .catch((err) => setError(err.message ?? "Erreur de prévisualisation"))
      .finally(() => setLoading(false));
  }, [open, document, authenticatedFetch]);

  // Reset state when dialog closes
  const handleOpenChange = (value: boolean) => {
    if (!value) {
      setHtml(null);
      setError(null);
    }
    onOpenChange(value);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="text-base">
            {document
              ? `${document.job_title} — ${document.company}`
              : "Prévisualisation CV"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center h-full text-sm text-destructive px-6">
              {error}
            </div>
          )}
          {html && !loading && (
            <iframe
              srcDoc={html}
              className="w-full h-full border-0"
              title="CV preview"
              sandbox="allow-same-origin"
            />
          )}
        </div>

        {onEdit && (
          <DialogFooter className="px-6 py-4 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                onEdit();
              }}
            >
              <Pencil className="size-4 mr-2" />
              Modifier
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
