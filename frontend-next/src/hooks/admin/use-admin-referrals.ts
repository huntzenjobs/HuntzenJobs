"use client";

import { useCallback } from "react";
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
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReferralLeaderEntry {
  id: string;
  referral_code: string;
  total_clicks: number;
  total_signups: number;
  total_conversions: number;
  referrer_id: string;
  profiles: { email: string; full_name: string | null } | null;
  referrer_plan: string | null;
  referrer_plan_status: string | null;
  paying_referrals: number;
  paying_plans: Record<string, number>;
  last_signup_at: string | null;
}

export interface ReferralStats {
  total_referrers: number;
  total_signups: number;
  total_conversions: number;
  total_rewards_applied: number;
  active_referrers: number;
  inactive_referrers: number;
  conversion_rate: number;
  revenue_by_plan: Record<string, number>;
}

export interface ReferralTier {
  name: string;
  friends: number;
  reward_type: "free_days" | "quota_bonus" | "stripe_coupon";
  reward_value: number;
  reward_plan: string;
  description: string;
}

export interface ReferralConfig {
  id: number;
  signup_reward_type: string | null;
  signup_reward_value: Record<string, unknown> | null;
  conversion_reward_type: string;
  conversion_reward_value: Record<string, unknown>;
  is_active: boolean;
  updated_at: string;
  tiers: ReferralTier[];
}

export interface ReferralSignupEntry {
  id: string;
  referred_email: string;
  referred_name: string | null;
  referrer_email: string;
  referrer_name: string | null;
  referral_code: string;
  signed_up_at: string;
  converted_to_paid_at: string | null;
  converted_plan: string | null;
}

export interface ReferralRewardEntry {
  id: string;
  referrer_email: string;
  referrer_name: string | null;
  reward_type: string;
  reward_value: Record<string, unknown>;
  tier_name: string;
  tier_index: number;
  applied: boolean;
  applied_at: string | null;
  created_at: string;
  referral_signup_id: string;
}

interface PaginatedSignups {
  signups: ReferralSignupEntry[];
  total: number;
  page: number;
  per_page: number;
}

interface PaginatedRewards {
  rewards: ReferralRewardEntry[];
  total: number;
  page: number;
  per_page: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAdminReferrals() {
  const fetchLeaderboard = useCallback(async (): Promise<
    ReferralLeaderEntry[]
  > => {
    const data = await adminFetch("/api/admin/referrals/leaderboard");
    return data.leaderboard;
  }, []);

  const fetchStats = useCallback(async (): Promise<ReferralStats> => {
    return adminFetch("/api/admin/referrals/stats");
  }, []);

  const fetchConfig = useCallback(async (): Promise<ReferralConfig> => {
    return adminFetch("/api/admin/referrals/config");
  }, []);

  const updateConfig = useCallback(
    async (updates: Partial<ReferralConfig>): Promise<boolean> => {
      try {
        await adminFetch("/api/admin/referrals/config", {
          method: "PATCH",
          body: JSON.stringify(updates),
        });
        toast.success("Configuration mise à jour");
        return true;
      } catch (e) {
        toast.error(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
        return false;
      }
    },
    [],
  );

  const grantReward = useCallback(
    async (signupId: string): Promise<boolean> => {
      try {
        const data = await adminFetch(
          `/api/admin/referrals/grant-reward/${signupId}`,
          { method: "POST" },
        );
        if (data.ok) toast.success("Récompense accordée");
        else toast.error("Échec de la récompense");
        return data.ok;
      } catch (e) {
        toast.error(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
        return false;
      }
    },
    [],
  );

  const fetchSignups = useCallback(
    async (page = 1): Promise<PaginatedSignups> => {
      return adminFetch(
        `/api/admin/referrals/signups?page=${page}&per_page=50`,
      );
    },
    [],
  );

  const fetchRewards = useCallback(
    async (page = 1): Promise<PaginatedRewards> => {
      return adminFetch(
        `/api/admin/referrals/rewards?page=${page}&per_page=50`,
      );
    },
    [],
  );

  const linkManual = useCallback(
    async (
      referrerEmail: string,
      referredEmail: string,
    ): Promise<boolean> => {
      try {
        const data = await adminFetch("/api/admin/referrals/link-manual", {
          method: "POST",
          body: JSON.stringify({
            referrer_email: referrerEmail,
            referred_email: referredEmail,
          }),
        });
        if (data.ok) toast.success(data.message || "Lien créé");
        else toast.error("Échec du lien");
        return data.ok;
      } catch (e) {
        toast.error(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
        return false;
      }
    },
    [],
  );

  return {
    fetchLeaderboard,
    fetchStats,
    fetchConfig,
    updateConfig,
    grantReward,
    fetchSignups,
    fetchRewards,
    linkManual,
  };
}
