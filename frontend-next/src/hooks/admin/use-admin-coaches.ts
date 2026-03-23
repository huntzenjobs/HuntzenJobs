"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "";

async function adminFetch(path: string, options?: RequestInit) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options?.headers || {}),
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

export interface AdminCoach {
  id: string;
  persona_name: string;
  short_name: string;
  description: string;
  specialties: string[];
  example_questions: string[];
  accent_color: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
  translations: Record<string, Record<string, unknown>>;
  created_at: string;
  updated_at: string;
}

export function useAdminCoaches() {
  const [loading, setLoading] = useState(false);

  const fetchCoaches = useCallback(async (): Promise<AdminCoach[]> => {
    return adminFetch("/api/admin/coaches");
  }, []);

  const updateCoach = useCallback(
    async (
      coachId: string,
      payload: {
        short_name?: string;
        description?: string;
        specialties?: string[];
        example_questions?: string[];
        accent_color?: string;
        icon?: string;
        sort_order?: number;
        is_active?: boolean;
      },
    ) => {
      setLoading(true);
      try {
        await adminFetch(`/api/admin/coaches/${coachId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Coach mis a jour");
        window.dispatchEvent(new Event("coaches-changed"));
        return true;
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Erreur lors de la mise a jour",
        );
        return false;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const translateCoach = useCallback(async (coachId: string) => {
    setLoading(true);
    try {
      await adminFetch(`/api/admin/coaches/${coachId}/translate`, {
        method: "POST",
      });
      toast.success("Traductions generees (en, es, pt)");
      window.dispatchEvent(new Event("coaches-changed"));
      return true;
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Erreur lors de la traduction automatique",
      );
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    fetchCoaches,
    updateCoach,
    translateCoach,
  };
}
