"use client";

import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "";

export interface AdminTicket {
  id: string;
  short_id: string;
  user_id: string;
  user_email: string;
  user_name?: string;
  user_plan?: string;
  page_url?: string;
  category: string;
  priority: string;
  subject: string;
  description: string;
  attachment_url?: string;
  attachment_signed_url?: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  admin_reply?: string;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface SupportStats {
  open: number;
  in_progress: number;
  resolved: number;
  resolved_pct: number;
}

export interface SupportFilters {
  status: string;
  category: string;
  priority: string;
  search: string;
}

export function useAdminSupport() {
  const { session } = useAuth();
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [stats, setStats] = useState<SupportStats>({ open: 0, in_progress: 0, resolved: 0, resolved_pct: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [filters, setFilters] = useState<SupportFilters>({ status: "open", category: "", priority: "", search: "" });

  const fetchTickets = useCallback(async () => {
    if (!session?.access_token) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.status && filters.status !== "all") params.set("status_filter", filters.status);
      if (filters.category) params.set("category", filters.category);
      if (filters.priority) params.set("priority", filters.priority);
      if (filters.search) params.set("search", filters.search);

      const res = await fetch(`${BACKEND_URL}/api/admin/support/tickets?${params}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setTickets(data.tickets || []);
      if (data.stats) setStats(data.stats);
    } catch (err) {
      console.error("Failed to fetch support tickets:", err);
    } finally {
      setIsLoading(false);
    }
  }, [session, filters]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const updateTicket = useCallback(
    async (ticketId: string, update: { status?: string; admin_reply?: string }) => {
      if (!session?.access_token) return;
      const res = await fetch(`${BACKEND_URL}/api/admin/support/tickets/${ticketId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(update),
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      await fetchTickets();
    },
    [session, fetchTickets]
  );

  return { tickets, stats, isLoading, filters, setFilters, updateTicket, refetch: fetchTickets };
}
