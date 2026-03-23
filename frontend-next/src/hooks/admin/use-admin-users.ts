"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type {
  AdminSubscription,
  SubscriptionHistoryEntry,
  UsageQuotaEntry,
  SecurityEvent,
} from "@/types/admin";

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

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  status: "active" | "suspended" | "deleted";
  is_admin: boolean;
  is_banned?: boolean;
  created_at: string;
  suspended_at: string | null;
  suspended_reason: string | null;
  plan?: {
    status: string;
    current_period_end: string;
    subscription_plans?: {
      name: string;
      display_name: string;
      price_monthly: number;
    };
  };
  usage_today?: {
    cv_analyses_used: number;
    coach_seconds_used: number;
    job_searches_used: number;
  };
}

export interface UsersResponse {
  users: AdminUser[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface UserDetail {
  profile: AdminUser;
  subscription: AdminSubscription | null;
  subscription_history: SubscriptionHistoryEntry[];
  usage_30d: UsageQuotaEntry[];
  security_events: SecurityEvent[];
  last_login_at: string | null;
  stripe_customer_id: string | null;
  total_paid: number;
}

export function useAdminUsers() {
  const [loading, setLoading] = useState(false);

  const fetchUsers = useCallback(
    async (params?: {
      page?: number;
      per_page?: number;
      search?: string;
      plan?: string;
      status?: string;
    }): Promise<UsersResponse> => {
      const qs = new URLSearchParams();
      if (params?.page) qs.set("page", String(params.page));
      if (params?.per_page) qs.set("per_page", String(params.per_page));
      if (params?.search) qs.set("search", params.search);
      if (params?.plan) qs.set("plan", params.plan);
      if (params?.status) qs.set("status", params.status);

      return adminFetch(`/api/admin/users?${qs}`);
    },
    [],
  );

  const fetchUserDetail = useCallback(
    async (userId: string): Promise<UserDetail> => {
      return adminFetch(`/api/admin/users/${userId}`);
    },
    [],
  );

  const suspendUser = useCallback(async (userId: string, reason: string) => {
    setLoading(true);
    try {
      await adminFetch(`/api/admin/users/${userId}/suspend`, {
        method: "PATCH",
        body: JSON.stringify({ reason }),
      });
      toast.success("Utilisateur suspendu");
      return true;
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Erreur lors de la suspension",
      );
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const reactivateUser = useCallback(async (userId: string) => {
    setLoading(true);
    try {
      await adminFetch(`/api/admin/users/${userId}/reactivate`, {
        method: "PATCH",
      });
      toast.success("Utilisateur réactivé");
      return true;
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Erreur lors de la réactivation",
      );
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteUser = useCallback(async (userId: string) => {
    setLoading(true);
    try {
      await adminFetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
        body: JSON.stringify({ confirm: true }),
      });
      toast.success("Utilisateur supprimé");
      return true;
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Erreur lors de la suppression",
      );
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const resetPassword = useCallback(async (userId: string) => {
    setLoading(true);
    try {
      const result = await adminFetch(
        `/api/admin/users/${userId}/reset-password`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );
      toast.success("Email de réinitialisation envoyé");
      return result;
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Erreur lors de la réinitialisation",
      );
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const forcePlan = useCallback(async (userId: string, planId: string) => {
    setLoading(true);
    try {
      await adminFetch(`/api/admin/users/${userId}/force-plan`, {
        method: "POST",
        body: JSON.stringify({ plan_id: planId }),
      });
      toast.success("Plan modifié");
      return true;
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Erreur lors du changement de plan",
      );
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPlans = useCallback(async () => {
    return adminFetch("/api/admin/plans");
  }, []);

  const resetUsage = useCallback(async (userId: string) => {
    setLoading(true);
    try {
      await adminFetch(`/api/admin/users/${userId}/reset-usage`, {
        method: "POST",
      });
      toast.success("Usage remis à zéro pour aujourd'hui");
      return true;
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Erreur lors du reset usage",
      );
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const createUser = useCallback(
    async (data: {
      email: string;
      full_name: string;
      plan_name?: string;
      send_invite?: boolean;
    }) => {
      setLoading(true);
      try {
        const result = await adminFetch("/api/admin/users/create", {
          method: "POST",
          body: JSON.stringify({
            email: data.email,
            full_name: data.full_name,
            plan_name: data.plan_name || null,
            send_invite: data.send_invite ?? true,
          }),
        });
        toast.success("Compte créé avec succès");
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erreur";
        toast.error(msg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return {
    loading,
    fetchUsers,
    fetchUserDetail,
    suspendUser,
    reactivateUser,
    deleteUser,
    resetPassword,
    forcePlan,
    fetchPlans,
    resetUsage,
    createUser,
  };
}
