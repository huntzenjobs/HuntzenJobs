"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/auth-context";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SupportMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  type?: "faq" | "ai" | "guardrail";
  timestamp: number;
}

export interface SupportTicket {
  id: string;
  short_id: string;
  category: string;
  priority: string;
  subject: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  admin_reply?: string;
  created_at: string;
  updated_at: string;
}

export interface SupportTicketMessage {
  id: string;
  author_role: "user" | "admin" | "system";
  content: string;
  created_at: string;
}

export interface TicketFormData {
  category: string;
  priority: string;
  subject: string;
  description: string;
  attachment_url?: string;
  page_url?: string;
}

export class SupportTicketSubmissionError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "SupportTicketSubmissionError";
  }

  get isDefinitive(): boolean {
    return this.status !== undefined && this.status >= 400 && this.status < 500;
  }
}

// ---------------------------------------------------------------------------
// useSupportChat — chatbot tab state
// ---------------------------------------------------------------------------

export function useSupportChat() {
  const { session } = useAuth();
  const t = useTranslations("support.chatbot");
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const sendToAI = useCallback(
    async (question: string): Promise<{ type: "ai" | "guardrail"; answer?: string }> => {
      if (!session?.access_token) return { type: "guardrail" };

      const res = await fetch(`${BACKEND_URL}/api/support/chatbot`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question }),
      });

      if (res.status === 429) {
        throw new Error("429");
      }
      if (!res.ok) {
        throw new Error(`${res.status}`);
      }
      return res.json();
    },
    [session]
  );

  const addMessage = useCallback((msg: Omit<SupportMessage, "id" | "timestamp">) => {
    const newMsg: SupportMessage = {
      ...msg,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, newMsg]);
    return newMsg;
  }, []);

  const sendMessage = useCallback(
    async (question: string, faqResult?: { answer: string } | null) => {
      // Add user message
      addMessage({ role: "user", content: question });
      setIsLoading(true);

      try {
        if (faqResult) {
          // FAQ match — instant response
          addMessage({ role: "assistant", content: faqResult.answer, type: "faq" });
        } else {
          // AI fallback
          const response = await sendToAI(question);
          if (response.type === "guardrail") {
            addMessage({
              role: "assistant",
              content: t("guardrail"),
              type: "guardrail",
            });
          } else {
            addMessage({ role: "assistant", content: response.answer || "", type: "ai" });
          }
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (errorMessage === "429") {
          addMessage({
            role: "assistant",
            content: t("rateLimited"),
            type: "ai",
          });
        } else {
          addMessage({
            role: "assistant",
            content: t("unavailable"),
            type: "ai",
          });
        }
      } finally {
        setIsLoading(false);
      }
    },
    [addMessage, sendToAI, t]
  );

  return { messages, isLoading, sendMessage };
}

// ---------------------------------------------------------------------------
// useSupportTicket — ticket tab state
// ---------------------------------------------------------------------------

export function useSupportTicket() {
  const { session } = useAuth();
  const t = useTranslations("support.errors");
  const [myTickets, setMyTickets] = useState<SupportTicket[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [ticketMessages, setTicketMessages] = useState<
    Record<string, SupportTicketMessage[]>
  >({});
  const [messageLoading, setMessageLoading] = useState<Record<string, boolean>>(
    {},
  );
  const [messageErrors, setMessageErrors] = useState<
    Record<string, string | undefined>
  >({});
  const pendingRequestId = useRef<string | null>(null);

  const fetchMyTickets = useCallback(async () => {
    if (!session?.access_token) return;
    setIsLoading(true);
    setTicketsError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/support/tickets/me`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(t("ticketsUnavailable"));
      const data = await res.json();
      setMyTickets(data.tickets || []);
    } catch (err: unknown) {
      setTicketsError(
        err instanceof Error ? err.message : t("ticketsUnavailable"),
      );
    } finally {
      setIsLoading(false);
    }
  }, [session, t]);

  useEffect(() => {
    fetchMyTickets();
  }, [fetchMyTickets]);

  const getTicketRequestId = useCallback(() => {
    pendingRequestId.current ??= crypto.randomUUID();
    return pendingRequestId.current;
  }, []);

  const submitTicket = useCallback(
    async (formData: TicketFormData): Promise<{ ticket_id: string; short_id: string }> => {
      if (!session?.access_token) throw new Error(t("unauthenticated"));
      const requestId = getTicketRequestId();
      setIsSubmitting(true);
      try {
        const res = await fetch(`${BACKEND_URL}/api/support/tickets`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...formData,
            request_id: requestId,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new SupportTicketSubmissionError(
            err.detail || `${t("ticketSubmissionFailed")} (${res.status})`,
            res.status,
          );
        }
        const result = await res.json();
        pendingRequestId.current = null;
        await fetchMyTickets();
        return result;
      } finally {
        setIsSubmitting(false);
      }
    },
    [session, fetchMyTickets, getTicketRequestId, t]
  );

  const fetchTicketMessages = useCallback(
    async (ticketId: string) => {
      if (!session?.access_token) return;
      setMessageLoading((current) => ({ ...current, [ticketId]: true }));
      setMessageErrors((current) => ({ ...current, [ticketId]: undefined }));
      try {
        const res = await fetch(
          `${BACKEND_URL}/api/support/tickets/${ticketId}/messages`,
          { headers: { Authorization: `Bearer ${session.access_token}` } },
        );
        if (!res.ok) throw new Error(t("messagesUnavailable"));
        const data = (await res.json()) as {
          messages?: SupportTicketMessage[];
        };
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
    myTickets,
    isLoading,
    isSubmitting,
    ticketsError,
    ticketMessages,
    messageLoading,
    messageErrors,
    getTicketRequestId,
    submitTicket,
    fetchTicketMessages,
    refetch: fetchMyTickets,
  };
}

export type SupportTicketController = ReturnType<typeof useSupportTicket>;
