"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale } from "next-intl";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "";
const CACHE_TTL = 10 * 1000; // 10 seconds — pre-commercialisation, propagation rapide des changements admin

export interface PlanConfig {
  id: string;
  name: "free" | "starter" | "pro" | "premium";
  display_name: string;
  description: string;
  price_monthly: number;
  price_yearly: number | null;
  features: string[];
  features_excluded: string[];
  limits: Record<string, number> | null;
  feature_flags: Record<string, boolean> | null;
  sort_order: number;
}

function getCacheKey(locale: string): string {
  return `plans_config_cache:${locale}`;
}

function loadCache(locale: string): PlanConfig[] | null {
  try {
    const raw = localStorage.getItem(getCacheKey(locale));
    if (!raw) return null;
    const { data, expiry } = JSON.parse(raw);
    if (Date.now() > expiry) {
      localStorage.removeItem(getCacheKey(locale));
      return null;
    }
    return data as PlanConfig[];
  } catch {
    return null;
  }
}

function saveCache(locale: string, data: PlanConfig[]) {
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

export function usePlansConfig() {
  const locale = useLocale();
  const [plans, setPlans] = useState<PlanConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPlans = useCallback(async () => {
    // Try cache first
    const cached = loadCache(locale);
    if (cached) {
      setPlans(cached);
      setIsLoading(false);
      return;
    }

    try {
      const url = `${BACKEND_URL}/api/public/plans${locale !== "fr" ? `?locale=${locale}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch plans");
      const data: PlanConfig[] = await res.json();
      saveCache(locale, data);
      setPlans(data);
    } catch (err) {
      console.warn("[usePlansConfig] API unavailable, no fallback:", err);
    } finally {
      setIsLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  // Refresh when admin saves plan changes
  useEffect(() => {
    const handleChange = () => {
      clearCache(locale);
      fetchPlans();
    };
    window.addEventListener("subscription-changed", handleChange);
    return () =>
      window.removeEventListener("subscription-changed", handleChange);
  }, [fetchPlans, locale]);

  const getPlan = useCallback(
    (name: string): PlanConfig | undefined =>
      plans.find((p) => p.name === name),
    [plans],
  );

  /** Format price as French string: 8.9 → "8,90" */
  const formatPrice = useCallback((price: number): string => {
    return price.toFixed(2).replace(".", ",");
  }, []);

  const getPlanLimits = useCallback(
    (name: string): Record<string, number> | null =>
      plans.find((p) => p.name === name)?.limits ?? null,
    [plans],
  );

  const getPlanFeatureFlags = useCallback(
    (name: string): Record<string, boolean> | null =>
      plans.find((p) => p.name === name)?.feature_flags ?? null,
    [plans],
  );

  return {
    plans,
    getPlan,
    getPlanLimits,
    getPlanFeatureFlags,
    isLoading,
    formatPrice,
  };
}
