"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CvData } from "@/components/cv-builder/types";

export type { CvData };

export interface CvProfile {
  id: string;
  name: string;
  cv_data: CvData;
  created_at: string;
  updated_at: string;
}

export function useCvProfiles() {
  const [profiles, setProfiles] = useState<CvProfile[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("cv_profiles")
      .select("id, name, cv_data, created_at, updated_at")
      .order("updated_at", { ascending: false });
    setProfiles((data as CvProfile[]) ?? []);
    setLoading(false);
  }, []);

  const saveProfile = useCallback(
    async (name: string, cvData: CvData): Promise<CvProfile | null> => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("cv_profiles")
        .insert({ user_id: user.id, name, cv_data: cvData })
        .select()
        .single();
      if (data) setProfiles((p) => [data as CvProfile, ...p]);
      return data as CvProfile | null;
    },
    [],
  );

  const updateProfile = useCallback(
    async (id: string, name: string, cvData: CvData): Promise<void> => {
      const supabase = createClient();
      await supabase
        .from("cv_profiles")
        .update({ name, cv_data: cvData })
        .eq("id", id);
      setProfiles((p) =>
        p.map((x) => (x.id === id ? { ...x, name, cv_data: cvData } : x)),
      );
    },
    [],
  );

  const deleteProfile = useCallback(async (id: string) => {
    const supabase = createClient();
    await supabase.from("cv_profiles").delete().eq("id", id);
    setProfiles((p) => p.filter((x) => x.id !== id));
  }, []);

  return {
    profiles,
    loading,
    fetchProfiles,
    saveProfile,
    updateProfile,
    deleteProfile,
  };
}
