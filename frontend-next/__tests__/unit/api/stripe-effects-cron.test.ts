import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("cron stripe-effects", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("CRON_SECRET", "cron_test_secret");
    vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "https://backend.example.test");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("laisse au backend son budget borné avant d'abandonner", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
      ),
    );
    const { GET } = await import("@/app/api/cron/stripe-effects/route");
    const responsePromise = GET(
      new Request("https://app.example.test/api/cron/stripe-effects", {
        headers: { Authorization: "Bearer cron_test_secret" },
      }),
    );

    await vi.advanceTimersByTimeAsync(115_000);
    const response = await responsePromise;

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Backend processing timed out",
    });
  });
});
