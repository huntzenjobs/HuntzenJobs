"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale } from "next-intl";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export interface CoachConfig {
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
}

function getCacheKey(locale: string): string {
  return `coaches_config_cache:${locale}`;
}

function loadCache(locale: string): CoachConfig[] | null {
  try {
    const raw = localStorage.getItem(getCacheKey(locale));
    if (!raw) return null;
    const { data, expiry } = JSON.parse(raw);
    if (Date.now() > expiry) {
      localStorage.removeItem(getCacheKey(locale));
      return null;
    }
    return data as CoachConfig[];
  } catch {
    return null;
  }
}

function saveCache(locale: string, data: CoachConfig[]) {
  try {
    localStorage.setItem(
      getCacheKey(locale),
      JSON.stringify({ data, expiry: Date.now() + CACHE_TTL }),
    );
  } catch {}
}

function clearCache(locale: string) {
  try {
    localStorage.removeItem(getCacheKey(locale));
  } catch {}
}

export function useCoachesConfig() {
  const locale = useLocale();
  const [coaches, setCoaches] = useState<CoachConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCoaches = useCallback(async () => {
    // Try cache first
    const cached = loadCache(locale);
    if (cached) {
      setCoaches(cached);
      setIsLoading(false);
      return;
    }

    try {
      const url = `${BACKEND_URL}/api/public/coaches${locale !== "fr" ? `?locale=${locale}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch coaches");
      const data: CoachConfig[] = await res.json();
      saveCache(locale, data);
      setCoaches(data);
    } catch {
      // API unavailable — components will use fallback from assistants.ts
    } finally {
      setIsLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    fetchCoaches();
  }, [fetchCoaches]);

  // Refresh when admin saves coach changes
  useEffect(() => {
    const handleChange = () => {
      clearCache(locale);
      fetchCoaches();
    };
    window.addEventListener("coaches-changed", handleChange);
    return () => window.removeEventListener("coaches-changed", handleChange);
  }, [fetchCoaches, locale]);

  const getCoach = useCallback(
    (id: string): CoachConfig | undefined =>
      coaches.find((c) => c.id === id),
    [coaches],
  );

  return {
    coaches,
    getCoach,
    isLoading,
  };
}
