"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/auth-context";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

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

export interface TicketFormData {
  category: string;
  priority: string;
  subject: string;
  description: string;
  attachment_url?: string;
  page_url?: string;
}

// ---------------------------------------------------------------------------
// useSupportChat — chatbot tab state
// ---------------------------------------------------------------------------

export function useSupportChat() {
  const { session } = useAuth();
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
              content: "Je réponds uniquement aux questions sur l'utilisation de HuntZen. Pour toute autre demande, ouvrez un ticket support.",
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
            content: "Trop de demandes, réessayez dans une minute.",
            type: "ai",
          });
        } else {
          addMessage({
            role: "assistant",
            content: "Service temporairement indisponible. Essayez d'ouvrir un ticket.",
            type: "ai",
          });
        }
      } finally {
        setIsLoading(false);
      }
    },
    [addMessage, sendToAI]
  );

  return { messages, isLoading, sendMessage };
}

// ---------------------------------------------------------------------------
// useSupportTicket — ticket tab state
// ---------------------------------------------------------------------------

export function useSupportTicket() {
  const { session } = useAuth();
  const [myTickets, setMyTickets] = useState<SupportTicket[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchMyTickets = useCallback(async () => {
    if (!session?.access_token) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/support/tickets/me`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setMyTickets(data.tickets || []);
    } catch (err) {
      // Non-blocking
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    fetchMyTickets();
  }, [fetchMyTickets]);

  const submitTicket = useCallback(
    async (formData: TicketFormData): Promise<{ ticket_id: string; short_id: string }> => {
      if (!session?.access_token) throw new Error("Non authentifié");
      setIsSubmitting(true);
      try {
        const res = await fetch(`${BACKEND_URL}/api/support/tickets`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(formData),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || `Erreur ${res.status}`);
        }
        const result = await res.json();
        await fetchMyTickets();
        return result;
      } finally {
        setIsSubmitting(false);
      }
    },
    [session, fetchMyTickets]
  );

  return { myTickets, isLoading, isSubmitting, submitTicket, refetch: fetchMyTickets };
}
