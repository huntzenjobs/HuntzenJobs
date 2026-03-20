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

export interface PlanLimit {
  cv_analyses: number;
  assistant_messages: number;
  job_searches: number;
}

export interface StripePrice {
  billing_period: "monthly" | "yearly";
  stripe_price_id: string;
  is_active: boolean;
}

export interface Plan {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number | null;
  limits: PlanLimit;
  features: string[];
  features_excluded: string[];
  feature_flags: Record<string, boolean>;
  is_active: boolean;
  sort_order: number;
  stripe_prices: StripePrice[];
}

export function useAdminPlans() {
  const [loading, setLoading] = useState(false);

  const fetchPlans = useCallback(async (): Promise<Plan[]> => {
    return adminFetch("/api/admin/plans");
  }, []);

  const updateLimits = useCallback(
    async (planId: string, limits: Partial<PlanLimit>) => {
      setLoading(true);
      try {
        await adminFetch(`/api/admin/plans/${planId}/limits`, {
          method: "PATCH",
          body: JSON.stringify(limits),
        });
        toast.success("Limites mises à jour");
        window.dispatchEvent(new Event("subscription-changed"));
        return true;
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Erreur lors de la mise à jour",
        );
        return false;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const updateFeatures = useCallback(
    async (
      planId: string,
      payload: {
        feature_flags?: Record<string, boolean>;
        features?: string[];
        features_excluded?: string[];
      },
    ) => {
      setLoading(true);
      try {
        await adminFetch(`/api/admin/plans/${planId}/features`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Fonctionnalités mises à jour");
        window.dispatchEvent(new Event("subscription-changed"));
        return true;
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Erreur lors de la mise à jour",
        );
        return false;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const updateDisplayPrice = useCallback(
    async (
      planId: string,
      prices: { price_monthly?: number; price_yearly?: number },
    ) => {
      setLoading(true);
      try {
        await adminFetch(`/api/admin/plans/${planId}/price`, {
          method: "PATCH",
          body: JSON.stringify(prices),
        });
        toast.success("Prix affiché mis à jour");
        window.dispatchEvent(new Event("subscription-changed"));
        return true;
      } catch (e) {
        toast.error(
          e instanceof Error
            ? e.message
            : "Erreur lors de la mise à jour du prix",
        );
        return false;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const updateWording = useCallback(
    async (
      planId: string,
      wording: { display_name?: string; description?: string },
    ) => {
      setLoading(true);
      try {
        await adminFetch(`/api/admin/plans/${planId}/wording`, {
          method: "PATCH",
          body: JSON.stringify(wording),
        });
        toast.success("Wording mis à jour");
        window.dispatchEvent(new Event("subscription-changed"));
        return true;
      } catch (e) {
        toast.error(
          e instanceof Error
            ? e.message
            : "Erreur lors de la mise à jour du wording",
        );
        return false;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const updateStripePrice = useCallback(
    async (
      planId: string,
      billing_period: "monthly" | "yearly",
      unit_amount: number,
      currency = "eur",
    ) => {
      setLoading(true);
      try {
        const result = await adminFetch(
          `/api/admin/plans/${planId}/stripe-price`,
          {
            method: "POST",
            body: JSON.stringify({ billing_period, unit_amount, currency }),
          },
        );
        toast.success(`Nouveau prix Stripe créé : ${result.new_price_id}`);
        return result;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur Stripe");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return {
    loading,
    fetchPlans,
    updateLimits,
    updateFeatures, // now accepts Record<string, boolean>
    updateDisplayPrice,
    updateWording,
    updateStripePrice,
  };
}
