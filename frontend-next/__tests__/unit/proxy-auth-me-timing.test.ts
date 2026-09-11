import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mocks.getUser },
  })),
}));

describe("instrumentation du proxy pour /api/auth/me", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    mocks.getUser.mockReset();
  });

  it("expose uniquement la durée Supabase du proxy quand elle est activée", async () => {
    vi.stubEnv("AUTH_ME_TIMING_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", "staging");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const { proxy } = await import("@/proxy");
    const response = await proxy(
      new NextRequest("https://app.example.test/api/auth/me"),
    );

    const overrides = response.headers.get("x-middleware-override-headers");
    expect(overrides).toContain("x-huntzen-proxy-timing");
    const proxyTiming = response.headers.get(
      "x-middleware-request-x-huntzen-proxy-timing",
    );
    expect(proxyTiming).toMatch(/next-proxy-supabase;dur=\d+(?:\.\d+)?/);
    expect(proxyTiming).not.toContain("anon-key");
  });

  it("n'ajoute aucune mesure en production, même si le flag est activé", async () => {
    vi.stubEnv("AUTH_ME_TIMING_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const { proxy } = await import("@/proxy");
    const response = await proxy(
      new NextRequest("https://app.example.test/api/auth/me"),
    );

    expect(response.headers.get("x-middleware-override-headers")).not.toContain(
      "x-huntzen-proxy-timing",
    );
  });
});
