"use client";

import { useState, useEffect, useCallback } from "react";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "";
const CACHE_KEY = "plans_config_cache";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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

function loadCache(): PlanConfig[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, expiry } = JSON.parse(raw);
    if (Date.now() > expiry) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return data as PlanConfig[];
  } catch {
    return null;
  }
}

function saveCache(data: PlanConfig[]) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ data, expiry: Date.now() + CACHE_TTL }),
    );
  } catch {}
}

function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {}
}

export function usePlansConfig() {
  const [plans, setPlans] = useState<PlanConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPlans = useCallback(async () => {
    // Try cache first
    const cached = loadCache();
    if (cached) {
      setPlans(cached);
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/public/plans`);
      if (!res.ok) throw new Error("Failed to fetch plans");
      const data: PlanConfig[] = await res.json();
      saveCache(data);
      setPlans(data);
    } catch (err) {
      console.warn("[usePlansConfig] API unavailable, no fallback:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  // Refresh when admin saves plan changes
  useEffect(() => {
    const handleChange = () => {
      clearCache();
      fetchPlans();
    };
    window.addEventListener("subscription-changed", handleChange);
    return () =>
      window.removeEventListener("subscription-changed", handleChange);
  }, [fetchPlans]);

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
