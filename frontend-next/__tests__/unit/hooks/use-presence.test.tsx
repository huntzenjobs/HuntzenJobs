import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession: getSessionMock },
  }),
}));

describe("usePresence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://backend.example.test");
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: "user-token",
          user: { id: "user-id" },
        },
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("envoie la présence toutes les quarante-cinq secondes", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchMock);

    const { usePresence } = await import("@/hooks/use-presence");
    const { unmount } = renderHook(() => usePresence("/jobs"));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    unmount();
  });

  it("suspend les heartbeats masqués puis reprend immédiatement", async () => {
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchMock);

    const { usePresence } = await import("@/hooks/use-presence");
    const { unmount } = renderHook(() => usePresence("/jobs"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    visibility.mockReturnValue("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    unmount();
  });

  it("déduplique les reprises de visibilité pendant un heartbeat en cours", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { usePresence } = await import("@/hooks/use-presence");
    const { unmount } = renderHook(() => usePresence("/jobs"));

    await act(async () => {
      await Promise.resolve();
      document.dispatchEvent(new Event("visibilitychange"));
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch?.(new Response(null));
    await act(async () => {
      await Promise.resolve();
    });

    unmount();
  });
});
