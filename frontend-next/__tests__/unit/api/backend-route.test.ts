import { afterEach, describe, expect, it, vi } from "vitest";

describe("relais backend same-origin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("relaie la lecture des plans avec la locale et la réponse du backend", async () => {
    vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "https://backend.example.test");
    const backendFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ name: "free" }, { name: "starter" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", backendFetch);

    const { proxyBackendRequest } = await import("@/lib/api/backend-route");
    const response = await proxyBackendRequest(
      new Request("https://app.example.test/api/public/plans?locale=en"),
      "/api/public/plans",
    );

    expect(backendFetch).toHaveBeenCalledWith(
      "https://backend.example.test/api/public/plans?locale=en",
      expect.objectContaining({ method: "GET" }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      { name: "free" },
      { name: "starter" },
    ]);
  });

  it("relaie Checkout sans transmettre les cookies Vercel au backend", async () => {
    vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "https://backend.example.test");
    const backendFetch = vi.fn().mockResolvedValue(
      Response.json({ checkout_url: "https://checkout.stripe.test/session" }),
    );
    vi.stubGlobal("fetch", backendFetch);
    const request = new Request(
      "https://app.example.test/api/stripe/create-checkout-session",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer user-token",
          Cookie: "vercel-auth=private",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "plan_name=starter&billing_period=monthly",
      },
    );

    const { proxyBackendRequest } = await import("@/lib/api/backend-route");
    const response = await proxyBackendRequest(
      request,
      "/api/stripe/create-checkout-session",
    );

    const [, init] = backendFetch.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer user-token");
    expect(headers.get("content-type")).toBe(
      "application/x-www-form-urlencoded",
    );
    expect(headers.has("cookie")).toBe(false);
    expect(init.body).toBe("plan_name=starter&billing_period=monthly");
    expect(response.status).toBe(200);
  });

  it("relaie la lecture fraîche de l'abonnement vers le bon endpoint", async () => {
    vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "https://backend.example.test");
    const backendFetch = vi.fn().mockResolvedValue(
      Response.json({
        success: true,
        subscription: { plan_name: "starter", status: "active" },
      }),
    );
    vi.stubGlobal("fetch", backendFetch);

    const { GET } = await import("@/app/api/subscription/current/route");
    const response = await GET(
      new Request("https://app.example.test/api/subscription/current", {
        headers: { Authorization: "Bearer user-token" },
      }),
    );

    expect(backendFetch).toHaveBeenCalledWith(
      "https://backend.example.test/api/subscription/current",
      expect.objectContaining({ method: "GET" }),
    );
    await expect(response.json()).resolves.toEqual({
      success: true,
      subscription: { plan_name: "starter", status: "active" },
    });
  });

  it("relaie les informations utilisateur sans exposer Railway au navigateur", async () => {
    vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "https://backend.example.test");
    const backendFetch = vi.fn().mockResolvedValue(
      Response.json({
        success: true,
        subscription: { plan_name: "starter", status: "active" },
      }),
    );
    vi.stubGlobal("fetch", backendFetch);

    const { GET } = await import("@/app/api/auth/me/route");
    const response = await GET(
      new Request("https://app.example.test/api/auth/me", {
        headers: { Authorization: "Bearer user-token" },
      }),
    );

    expect(backendFetch).toHaveBeenCalledWith(
      "https://backend.example.test/api/auth/me",
      expect.objectContaining({ method: "GET" }),
    );
    await expect(response.json()).resolves.toEqual({
      success: true,
      subscription: { plan_name: "starter", status: "active" },
    });
  });

  it("relaie l'invalidation du cache d'abonnement en POST", async () => {
    vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "https://backend.example.test");
    const backendFetch = vi
      .fn()
      .mockResolvedValue(Response.json({ success: true }));
    vi.stubGlobal("fetch", backendFetch);

    const { POST } = await import("@/app/api/subscription/sync-cache/route");
    const response = await POST(
      new Request("https://app.example.test/api/subscription/sync-cache", {
        method: "POST",
        headers: { Authorization: "Bearer user-token" },
      }),
    );

    expect(backendFetch).toHaveBeenCalledWith(
      "https://backend.example.test/api/subscription/sync-cache",
      expect.objectContaining({ method: "POST" }),
    );
    expect(response.status).toBe(200);
  });
});
