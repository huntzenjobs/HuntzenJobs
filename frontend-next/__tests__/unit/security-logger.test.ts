import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, rpc } = vi.hoisted(() => ({
  getSession: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession },
    rpc,
  }),
}));

vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
}));

import { logLoginSuccess, logSecurityEvent } from "@/lib/security/logger";

describe("logSecurityEvent", () => {
  beforeEach(() => {
    getSession.mockReset();
    rpc.mockReset();
    rpc.mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("n'appelle pas la RPC protégée sans session authentifiée", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });

    await logSecurityEvent({
      eventType: "auth.signup",
      userId: "00000000-0000-0000-0000-000000000001",
    });

    expect(getSession).toHaveBeenCalledOnce();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("journalise l'événement lorsqu'une session authentifiée existe", async () => {
    getSession.mockResolvedValue({
      data: {
        session: {
          user: { id: "00000000-0000-0000-0000-000000000001" },
        },
      },
      error: null,
    });

    await logSecurityEvent({
      eventType: "auth.login_success",
      userId: "00000000-0000-0000-0000-000000000001",
    });

    expect(rpc).toHaveBeenCalledOnce();
  });

  it("attend la propagation du JWT avant de journaliser une connexion", async () => {
    vi.useFakeTimers();
    getSession.mockResolvedValue({
      data: {
        session: {
          user: { id: "00000000-0000-0000-0000-000000000001" },
        },
      },
      error: null,
    });

    const logging = logLoginSuccess(
      "00000000-0000-0000-0000-000000000001",
    );

    await Promise.resolve();
    expect(getSession).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    await logging;
    expect(rpc).toHaveBeenCalledOnce();
  });
});
