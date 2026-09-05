"use client";

import { useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/auth-context";
import { useDebounce } from "@/hooks/use-debounce";

const API_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "";

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

export interface AdminTicketMessage {
  id: string;
  author_role: "user" | "admin" | "system";
  content: string;
  created_at: string;
}

type FilterAction =
  | SupportFilters
  | ((current: SupportFilters) => SupportFilters);

export function useAdminSupport() {
  const { session } = useAuth();
  const t = useTranslations("adminSupport.errors");
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [stats, setStats] = useState<SupportStats>({
    open: 0,
    in_progress: 0,
    resolved: 0,
    resolved_pct: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [hasNextPage, setHasNextPage] = useState(false);
  const [ticketMessages, setTicketMessages] = useState<
    Record<string, AdminTicketMessage[]>
  >({});
  const [messageLoading, setMessageLoading] = useState<Record<string, boolean>>(
    {},
  );
  const [messageErrors, setMessageErrors] = useState<
    Record<string, string | undefined>
  >({});
  const [filters, setFiltersState] = useState<SupportFilters>({
    status: "open",
    category: "",
    priority: "",
    search: "",
  });
  const debouncedSearch = useDebounce(filters.search, 350);

  const setFilters = useCallback((action: FilterAction) => {
    setFiltersState((current) =>
      typeof action === "function" ? action(current) : action,
    );
    setPage(1);
  }, []);

  const fetchTickets = useCallback(async () => {
    if (!session?.access_token) return;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.status && filters.status !== "all")
        params.set("status_filter", filters.status);
      if (filters.category) params.set("category", filters.category);
      if (filters.priority) params.set("priority", filters.priority);
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      params.set("page", String(page));
      params.set("page_size", String(pageSize));

      const res = await fetch(
        `${API_URL}/api/support/admin/support/tickets?${params}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );
      if (!res.ok) throw new Error(t("ticketsUnavailable"));
      const data = (await res.json()) as {
        tickets?: AdminTicket[];
        stats?: SupportStats;
      };
      const nextTickets = data.tickets || [];
      setTickets(nextTickets);
      setHasNextPage(nextTickets.length === pageSize);
      if (data.stats) setStats(data.stats);
    } catch (err: unknown) {
      setTickets([]);
      setHasNextPage(false);
      setError(err instanceof Error ? err.message : t("ticketsUnavailable"));
    } finally {
      setIsLoading(false);
    }
  }, [session, filters.status, filters.category, filters.priority, debouncedSearch, page, t]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const updateTicket = useCallback(
    async (
      ticketId: string,
      update: { request_id: string; status?: string; admin_reply?: string },
    ) => {
      if (!session?.access_token) return;
      const res = await fetch(
        `${API_URL}/api/support/admin/support/tickets/${ticketId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(update),
        },
      );
      if (!res.ok) throw new Error(t("updateFailed"));
      await fetchTickets();
    },
    [session, fetchTickets, t],
  );

  const fetchTicketMessages = useCallback(
    async (ticketId: string) => {
      if (!session?.access_token) return;
      setMessageLoading((current) => ({ ...current, [ticketId]: true }));
      setMessageErrors((current) => ({ ...current, [ticketId]: undefined }));
      try {
        const res = await fetch(
          `${API_URL}/api/support/admin/support/tickets/${ticketId}/messages`,
          { headers: { Authorization: `Bearer ${session.access_token}` } },
        );
        if (!res.ok) throw new Error(t("messagesUnavailable"));
        const data = (await res.json()) as { messages?: AdminTicketMessage[] };
        setTicketMessages((current) => ({
          ...current,
          [ticketId]: data.messages || [],
        }));
      } catch (err: unknown) {
        setMessageErrors((current) => ({
          ...current,
          [ticketId]:
            err instanceof Error ? err.message : t("messagesUnavailable"),
        }));
      } finally {
        setMessageLoading((current) => ({ ...current, [ticketId]: false }));
      }
    },
    [session, t],
  );

  return {
    tickets,
    stats,
    isLoading,
    error,
    filters,
    setFilters,
    page,
    pageSize,
    setPage,
    hasNextPage,
    ticketMessages,
    messageLoading,
    messageErrors,
    fetchTicketMessages,
    updateTicket,
    refetch: fetchTickets,
  };
}
