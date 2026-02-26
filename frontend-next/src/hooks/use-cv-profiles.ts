"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export interface CvProfile {
  id: string;
  name: string;
  cv_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export function useCvProfiles() {
  const [profiles, setProfiles] = useState<CvProfile[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("cv_profiles")
        .select("id, name, cv_data, created_at, updated_at")
        .order("updated_at", { ascending: false });
      setProfiles(data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveProfile = useCallback(
    async (
      name: string,
      cvData: Record<string, unknown>
    ): Promise<CvProfile | null> => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from("cv_profiles")
        .insert({ user_id: user.id, name, cv_data: cvData })
        .select()
        .single();

      if (error || !data) return null;
      setProfiles((p) => [data as CvProfile, ...p]);
      return data as CvProfile;
    },
    []
  );

  const updateProfile = useCallback(
    async (
      id: string,
      name: string,
      cvData: Record<string, unknown>
    ): Promise<boolean> => {
      const supabase = createClient();
      const { error } = await supabase
        .from("cv_profiles")
        .update({ name, cv_data: cvData })
        .eq("id", id);

      if (error) return false;
      setProfiles((p) =>
        p.map((x) => (x.id === id ? { ...x, name, cv_data: cvData } : x))
      );
      return true;
    },
    []
  );

  const deleteProfile = useCallback(async (id: string): Promise<void> => {
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
