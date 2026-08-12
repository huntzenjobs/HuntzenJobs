import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    loading: false,
    session: { access_token: "user-token" },
  }),
}));

describe("useSubscriptionApi", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "https://backend.example.test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
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
});
