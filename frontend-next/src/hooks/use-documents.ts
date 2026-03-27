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
  cv_data?: Record<string, unknown>;
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

// 10-year expiry for stored signed URLs (effectively permanent)
const SIGNED_URL_EXPIRY = 10 * 365 * 24 * 3600;

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

export function useDocuments() {
  const [documents, setDocuments] = useState<UserDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const { authenticatedFetch } = useAuthenticatedFetch();

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authenticatedFetch(`${BACKEND_URL}/api/documents`);
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
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return null;

      const userId = session.user.id;
      const ts = Date.now();
      const companySlug = input.company
        .replace(/[^a-z0-9]/gi, "_")
        .toLowerCase()
        .slice(0, 40);

      // Upload CV PDF → private bucket, generate long-lived signed URL
      const cvPath = `${userId}/cv_${companySlug}_${ts}.pdf`;
      const { data: cvUpload, error: cvErr } = await supabase.storage
        .from("cvs-adaptes")
        .upload(cvPath, input.cvPdfBlob, { contentType: "application/pdf" });

      if (cvErr || !cvUpload) {
        console.error("[useDocuments] CV upload error:", cvErr);
        return null;
      }

      const { data: cvSigned } = await supabase.storage
        .from("cvs-adaptes")
        .createSignedUrl(cvUpload.path, SIGNED_URL_EXPIRY);

      // Upload LM PDF if provided
      let lmPdfUrl: string | null = null;
      if (input.lmPdfBlob) {
        const lmPath = `${userId}/lm_${companySlug}_${ts}.pdf`;
        const { data: lmUpload, error: lmErr } = await supabase.storage
          .from("lettres-motivation")
          .upload(lmPath, input.lmPdfBlob, { contentType: "application/pdf" });

        if (!lmErr && lmUpload) {
          const { data: lmSigned } = await supabase.storage
            .from("lettres-motivation")
            .createSignedUrl(lmUpload.path, SIGNED_URL_EXPIRY);
          lmPdfUrl = lmSigned?.signedUrl ?? null;
        }
      }

      // Save metadata to backend
      const res = await authenticatedFetch(`${BACKEND_URL}/api/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_title: input.jobTitle,
          company: input.company,
          match_score: input.matchScore ?? null,
          cv_data: input.cvData,
          cv_pdf_url: cvSigned?.signedUrl ?? null,
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
    [authenticatedFetch],
  );

  const markApplied = useCallback(
    async (savedJobId: string) => {
      await authenticatedFetch(`${BACKEND_URL}/api/documents/mark-applied`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saved_job_id: savedJobId }),
      });
    },
    [authenticatedFetch],
  );

  const deleteDocument = useCallback(
    async (documentId: string) => {
      await authenticatedFetch(`${BACKEND_URL}/api/documents/${documentId}`, {
        method: "DELETE",
      });
      setDocuments((prev) => prev.filter((d) => d.id !== documentId));
    },
    [authenticatedFetch],
  );

  const updateDocument = useCallback(
    async (
      documentId: string,
      updates: { cv_pdf_url?: string; cv_data?: Record<string, unknown> },
    ): Promise<UserDocument | null> => {
      const res = await authenticatedFetch(
        `${BACKEND_URL}/api/documents/${documentId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        },
      );
      if (!res.ok) return null;
      const data = await res.json();
      const updated = data.document as UserDocument;
      setDocuments((prev) =>
        prev.map((d) => (d.id === documentId ? { ...d, ...updated } : d)),
      );
      return updated;
    },
    [authenticatedFetch],
  );

  return {
    documents,
    loading,
    fetchDocuments,
    saveDocument,
    markApplied,
    deleteDocument,
    updateDocument,
  };
}
