import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("cron support-effects", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "cron_test_secret");
    vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "https://backend.example.test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("refuse un appel qui ne vient pas de Vercel Cron", async () => {
    const { GET } = await import("@/app/api/cron/support-effects/route");
    const response = await GET(
      new Request("https://app.example.test/api/cron/support-effects"),
    );

    expect(response.status).toBe(401);
  });

  it("transmet le secret au drain borné du backend", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, summary: { processed: 2 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/cron/support-effects/route");
    const response = await GET(
      new Request("https://app.example.test/api/cron/support-effects", {
        headers: { Authorization: "Bearer cron_test_secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://backend.example.test/api/cron/support-effects",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        headers: expect.objectContaining({
          Authorization: "Bearer cron_test_secret",
        }),
      }),
    );
  });
});
