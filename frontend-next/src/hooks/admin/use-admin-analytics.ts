"use client";

import { useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "";

async function adminFetch(path: string) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export interface RevenueData {
  mrr: number;
  arr: number;
  total_paying_users: number;
  total_users: number;
  by_plan: { name: string; display_name: string; count: number; mrr: number }[];
}

export interface SubscriptionsBreakdown {
  breakdown: Record<string, number>;
}

export interface ChurnData {
  churned: {
    id: string;
    user_id: string;
    created_at: string;
    profiles: { email: string; full_name: string | null } | null;
    subscription_plans: { name: string; display_name: string } | null;
  }[];
  total: number;
  period_days: number;
}

export interface UsageData {
  totals: { cv_analyses: number; coach_seconds: number; job_searches: number };
  top_users: {
    user_id: string;
    email?: string;
    cv_analyses: number;
    coach_seconds: number;
    job_searches: number;
  }[];
  period_days: number;
  active_users: number;
}

export function useAdminAnalytics() {
  const fetchRevenue = useCallback(
    async (period = "30d"): Promise<RevenueData> => {
      return adminFetch(`/api/admin/analytics/revenue?period=${period}`);
    },
    [],
  );

  const fetchSubscriptions =
    useCallback(async (): Promise<SubscriptionsBreakdown> => {
      return adminFetch("/api/admin/analytics/subscriptions");
    }, []);

  const fetchChurn = useCallback(async (days = 30): Promise<ChurnData> => {
    return adminFetch(`/api/admin/analytics/churn?days=${days}`);
  }, []);

  const fetchUsage = useCallback(async (days = 30): Promise<UsageData> => {
    return adminFetch(`/api/admin/analytics/usage?days=${days}`);
  }, []);

  return { fetchRevenue, fetchSubscriptions, fetchChurn, fetchUsage };
}
