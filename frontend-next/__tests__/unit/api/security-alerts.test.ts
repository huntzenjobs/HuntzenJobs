import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const sentrySpies = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => sentrySpies);

import { POST } from "@/app/api/security-alerts/route";

const payload = {
  type: "INSERT",
  table: "security_events",
  schema: "public",
  record: {
    id: "event-1",
    event_type: "auth.unauthorized_access",
    severity: "critical",
    user_id: "user-private",
    session_id: "session-private",
    ip_address: "203.0.113.4",
    user_agent: "Browser privé",
    event_data: { token: "secret-token", email: "personne@example.com" },
    created_at: "2026-08-31T12:00:00Z",
  },
};

function createRequest(secret?: string): NextRequest {
  return new Request("http://localhost/api/security-alerts", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { "x-supabase-signature": secret } : {}),
    },
    body: JSON.stringify(payload),
  }) as NextRequest;
}

describe("security alerts webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("refuse tout appel quand le secret serveur n'est pas configuré", async () => {
    const response = await POST(createRequest());

    expect(response.status).toBe(503);
    expect(sentrySpies.captureMessage).not.toHaveBeenCalled();
  });

  it("n'envoie aucune PII à Sentry avec une signature valide", async () => {
    vi.stubEnv("SUPABASE_WEBHOOK_SECRET", "expected-secret");

    const response = await POST(createRequest("expected-secret"));
    const sentryPayload = JSON.stringify(sentrySpies.captureMessage.mock.calls);

    expect(response.status).toBe(200);
    expect(sentrySpies.captureMessage).toHaveBeenCalledOnce();
    expect(sentryPayload).not.toContain("user-private");
    expect(sentryPayload).not.toContain("session-private");
    expect(sentryPayload).not.toContain("203.0.113.4");
    expect(sentryPayload).not.toContain("secret-token");
    expect(sentryPayload).not.toContain("personne@example.com");
  });
});
