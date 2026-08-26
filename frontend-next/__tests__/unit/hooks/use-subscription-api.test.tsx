import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  loading: false,
  session: {
    access_token: "user-token",
    user: { id: "user-id" },
  } as { access_token: string; user: { id: string } } | null,
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => authState,
}));

describe("useSubscriptionApi", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(Math, "random").mockReturnValue(0);
    authState.loading = false;
    authState.session = {
      access_token: "user-token",
      user: { id: "user-id" },
    };
    vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "https://backend.example.test");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("charge l'abonnement via le relais same-origin", async () => {
    const apiResponse = {
      success: true,
      user: {
        id: "user-id",
        email: "user@example.test",
        full_name: "Test User",
        avatar_url: null,
        created_at: "2026-08-12T00:00:00Z",
      },
      subscription: {
        plan_name: "starter",
        plan_display_name: "Research Active",
        price_monthly: 9.99,
        status: "active",
        current_period_end: "2026-09-12T00:00:00Z",
        cancel_at_period_end: false,
      },
      quotas: {},
      saved_jobs_quota: { used: 0, limit: 10 },
      feature_overrides: {},
      plan_feature_flags: {},
    };
    const frontendFetch = vi.fn().mockResolvedValue(Response.json(apiResponse));
    vi.stubGlobal("fetch", frontendFetch);

    const { useSubscriptionApi } = await import(
      "@/hooks/use-subscription-api"
    );
    const { result, unmount } = renderHook(() => useSubscriptionApi());

    await waitFor(() => {
      expect(result.current.subscription?.plan_name).toBe("starter");
    });
    expect(frontendFetch).toHaveBeenCalledWith(
      "/api/auth/me",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer user-token",
        }),
      }),
    );

    unmount();
  });

  it("espace le rafraîchissement de secours à cinq minutes", async () => {
    vi.useFakeTimers();
    const apiResponse = {
      success: true,
      user: { id: "user-id", email: "user@example.test" },
      subscription: { plan_name: "starter" },
      quotas: {},
      feature_overrides: {},
      plan_feature_flags: {},
    };
    const frontendFetch = vi
      .fn()
      .mockImplementation(() => Promise.resolve(Response.json(apiResponse)));
    vi.stubGlobal("fetch", frontendFetch);

    const { useSubscriptionApi } = await import(
      "@/hooks/use-subscription-api"
    );
    const { unmount } = renderHook(() => useSubscriptionApi());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(frontendFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(frontendFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(270_000);
    });
    expect(frontendFetch).toHaveBeenCalledTimes(2);

    unmount();
  });

  it("rafraîchit immédiatement quand un onglet redevient visible", async () => {
    vi.useFakeTimers();
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    const apiResponse = {
      success: true,
      user: { id: "user-id", email: "user@example.test" },
      subscription: { plan_name: "starter" },
      quotas: {},
      feature_overrides: {},
      plan_feature_flags: {},
    };
    const frontendFetch = vi
      .fn()
      .mockImplementation(() => Promise.resolve(Response.json(apiResponse)));
    vi.stubGlobal("fetch", frontendFetch);

    const { useSubscriptionApi } = await import(
      "@/hooks/use-subscription-api"
    );
    const { unmount } = renderHook(() => useSubscriptionApi());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(frontendFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300_000);
    });
    expect(frontendFetch).toHaveBeenCalledTimes(1);

    visibility.mockReturnValue("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(frontendFetch).toHaveBeenCalledTimes(2);

    unmount();
  });

  it("utilise le nouveau token après une rotation de session", async () => {
    vi.useFakeTimers();
    const apiResponse = {
      success: true,
      user: { id: "user-id", email: "user@example.test" },
      subscription: { plan_name: "starter" },
      quotas: {},
      feature_overrides: {},
      plan_feature_flags: {},
    };
    const frontendFetch = vi
      .fn()
      .mockImplementation(() => Promise.resolve(Response.json(apiResponse)));
    vi.stubGlobal("fetch", frontendFetch);

    const { useSubscriptionApi } = await import(
      "@/hooks/use-subscription-api"
    );
    const { rerender, unmount } = renderHook(() => useSubscriptionApi());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    authState.session = {
      access_token: "rotated-token",
      user: { id: "user-id" },
    };
    rerender();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300_000);
    });

    expect(frontendFetch).toHaveBeenLastCalledWith(
      "/api/auth/me",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer rotated-token",
        }),
      }),
    );

    unmount();
  });

  it("déduplique les rafraîchissements pendant une requête en cours", async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    const frontendFetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", frontendFetch);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");

    const { useSubscriptionApi } = await import(
      "@/hooks/use-subscription-api"
    );
    const { unmount } = renderHook(() => useSubscriptionApi());

    await act(async () => {
      await Promise.resolve();
      document.dispatchEvent(new Event("visibilitychange"));
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });

    expect(frontendFetch).toHaveBeenCalledTimes(1);

    resolveFetch?.(
      Response.json({
        success: true,
        user: { id: "user-id", email: "user@example.test" },
        subscription: { plan_name: "starter" },
        quotas: {},
        feature_overrides: {},
        plan_feature_flags: {},
      }),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    unmount();
  });

  it("annule la réponse obsolète quand l'utilisateur change", async () => {
    const resolvers: Array<(response: Response) => void> = [];
    const frontendFetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    vi.stubGlobal("fetch", frontendFetch);

    const { useSubscriptionApi } = await import(
      "@/hooks/use-subscription-api"
    );
    const { result, rerender, unmount } = renderHook(() =>
      useSubscriptionApi(),
    );

    await act(async () => {
      await Promise.resolve();
    });
    authState.session = {
      access_token: "second-token",
      user: { id: "second-user" },
    };
    rerender();

    await waitFor(() => expect(frontendFetch).toHaveBeenCalledTimes(2));

    resolvers[1]?.(
      Response.json({
        success: true,
        user: { id: "second-user", email: "second@example.test" },
        subscription: { plan_name: "pro" },
        quotas: {},
        feature_overrides: {},
        plan_feature_flags: {},
      }),
    );
    await waitFor(() => expect(result.current.user?.id).toBe("second-user"));

    resolvers[0]?.(
      Response.json({
        success: true,
        user: { id: "user-id", email: "old@example.test" },
        subscription: { plan_name: "premium" },
        quotas: {},
        feature_overrides: {},
        plan_feature_flags: {},
      }),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.user?.id).toBe("second-user");
    expect(result.current.subscription?.plan_name).toBe("pro");

    unmount();
  });

  it("rejoue un refetch explicite après une requête déjà en cours", async () => {
    const resolvers: Array<(response: Response) => void> = [];
    const frontendFetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    vi.stubGlobal("fetch", frontendFetch);

    const { useSubscriptionApi } = await import(
      "@/hooks/use-subscription-api"
    );
    const { result, unmount } = renderHook(() => useSubscriptionApi());

    await act(async () => {
      await Promise.resolve();
    });
    let explicitRefresh: Promise<boolean> | undefined;
    act(() => {
      explicitRefresh = result.current.refetch();
    });
    expect(frontendFetch).toHaveBeenCalledTimes(1);

    resolvers[0]?.(
      Response.json({
        success: true,
        user: { id: "user-id", email: "user@example.test" },
        subscription: { plan_name: "starter" },
        quotas: {},
        feature_overrides: {},
        plan_feature_flags: {},
      }),
    );
    await waitFor(() => expect(frontendFetch).toHaveBeenCalledTimes(2));

    resolvers[1]?.(
      Response.json({
        success: true,
        user: { id: "user-id", email: "user@example.test" },
        subscription: { plan_name: "pro" },
        quotas: {},
        feature_overrides: {},
        plan_feature_flags: {},
      }),
    );
    await act(async () => {
      await explicitRefresh;
    });
    expect(result.current.subscription?.plan_name).toBe("pro");

    unmount();
  });

  it("rejoue chaque mutation survenue pendant le fetch de rattrapage", async () => {
    const resolvers: Array<(response: Response) => void> = [];
    const frontendFetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    vi.stubGlobal("fetch", frontendFetch);

    const { useSubscriptionApi } = await import(
      "@/hooks/use-subscription-api"
    );
    const { result, unmount } = renderHook(() => useSubscriptionApi());

    await act(async () => Promise.resolve());
    let firstRefresh: Promise<boolean> | undefined;
    act(() => {
      firstRefresh = result.current.refetch();
    });

    const response = (plan: string) =>
      Response.json({
        success: true,
        user: { id: "user-id", email: "user@example.test" },
        subscription: { plan_name: plan },
        quotas: {},
        feature_overrides: {},
        plan_feature_flags: {},
      });

    resolvers[0]?.(response("starter"));
    await waitFor(() => expect(frontendFetch).toHaveBeenCalledTimes(2));

    let secondRefresh: Promise<boolean> | undefined;
    act(() => {
      secondRefresh = result.current.refetch();
    });
    resolvers[1]?.(response("pro"));
    await waitFor(() => expect(frontendFetch).toHaveBeenCalledTimes(3));

    resolvers[2]?.(response("premium"));
    await act(async () => {
      await Promise.all([firstRefresh, secondRefresh]);
    });
    expect(result.current.subscription?.plan_name).toBe("premium");

    unmount();
  });

  it("ne redémarre pas un rattrapage après le démontage", async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    const frontendFetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", frontendFetch);

    const { useSubscriptionApi } = await import(
      "@/hooks/use-subscription-api"
    );
    const { result, unmount } = renderHook(() => useSubscriptionApi());

    await act(async () => Promise.resolve());
    act(() => {
      void result.current.refetch();
    });
    unmount();
    resolveFetch?.(
      Response.json({
        success: true,
        user: { id: "user-id", email: "user@example.test" },
        subscription: { plan_name: "starter" },
        quotas: {},
        feature_overrides: {},
        plan_feature_flags: {},
      }),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(frontendFetch).toHaveBeenCalledTimes(1);
  });

  it("n'utilise jamais le cache d'un autre compte", async () => {
    localStorage.setItem(
      "huntzen_subscription_cache",
      JSON.stringify({
        success: true,
        user: { id: "previous-user", email: "previous@example.test" },
        subscription: { plan_name: "premium" },
        quotas: {},
        feature_overrides: {},
        plan_feature_flags: {},
      }),
    );
    authState.session = {
      access_token: "new-user-token",
      user: { id: "new-user" },
    };
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const { useSubscriptionApi } = await import(
      "@/hooks/use-subscription-api"
    );
    const { result, unmount } = renderHook(() => useSubscriptionApi());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.user).toBeNull();
    expect(result.current.subscription).toBeNull();

    let synced = true;
    await act(async () => {
      synced = await result.current.refetch();
    });
    expect(synced).toBe(false);

    unmount();
  });
});
