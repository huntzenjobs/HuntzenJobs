import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSupportTicket } from "@/hooks/use-support";

const session = { access_token: "support-token" };
const { translate } = vi.hoisted(() => ({
  translate: (key: string) => key,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => translate,
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ session }),
}));

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(data),
  } as unknown as Response;
}

describe("useSupportTicket", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("réutilise le request_id après un échec puis le renouvelle après succès", async () => {
    let postAttempt = 0;
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      if (init?.method === "POST") {
        postAttempt += 1;
        if (postAttempt === 1) {
          return jsonResponse({ detail: "indisponible" }, 503);
        }
        return jsonResponse({ ticket_id: `ticket-${postAttempt}`, short_id: `T${postAttempt}` });
      }
      return jsonResponse({ tickets: [] });
    });

    const { result } = renderHook(() => useSupportTicket());
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    const ticket = {
      category: "bug",
      priority: "urgent",
      subject: "Connexion impossible",
      description: "La connexion échoue depuis mon téléphone.",
    };

    await expect(
      act(async () => result.current.submitTicket(ticket)),
    ).rejects.toThrow("indisponible");
    await act(async () => result.current.submitTicket(ticket));
    await act(async () => result.current.submitTicket(ticket));

    const postBodies = vi
      .mocked(fetch)
      .mock.calls.filter(([, init]) => init?.method === "POST")
      .map(([, init]) => JSON.parse(String(init?.body)) as { request_id: string });

    expect(postBodies[0].request_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(postBodies[1].request_id).toBe(postBodies[0].request_id);
    expect(postBodies[2].request_id).not.toBe(postBodies[1].request_id);
  });

  it("charge l'historique d'un ticket et expose une erreur récupérable", async () => {
    let historyAttempt = 0;
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/messages")) {
        historyAttempt += 1;
        if (historyAttempt === 1) return jsonResponse({}, 503);
        return jsonResponse({
          ticket_id: "ticket-1",
          messages: [
            {
              id: "message-1",
              author_role: "admin",
              content: "Le problème est corrigé.",
              created_at: "2026-08-31T12:00:00Z",
            },
          ],
        });
      }
      return jsonResponse({ tickets: [] });
    });

    const { result } = renderHook(() => useSupportTicket());
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    await act(async () => result.current.fetchTicketMessages("ticket-1"));
    expect(result.current.messageErrors["ticket-1"]).toBeTruthy();

    await act(async () => result.current.fetchTicketMessages("ticket-1"));
    expect(result.current.messageErrors["ticket-1"]).toBeUndefined();
    expect(result.current.ticketMessages["ticket-1"]).toEqual([
      expect.objectContaining({
        id: "message-1",
        author_role: "admin",
        content: "Le problème est corrigé.",
      }),
    ]);
  });
});
