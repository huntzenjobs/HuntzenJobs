import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const getValidToken = vi.fn();

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ session: null }),
}));

vi.mock("@/lib/auth/token-refresh-service", () => ({
  tokenRefreshService: { getValidToken },
}));

describe("useAuthenticatedFetch", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("récupère le jeton avant la première requête si le contexte hydrate encore", async () => {
    getValidToken.mockResolvedValue("bootstrap-token");
    const request = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", request);

    const { useAuthenticatedFetch } = await import(
      "@/hooks/use-authenticated-fetch"
    );
    const { result } = renderHook(() => useAuthenticatedFetch());

    await act(async () => {
      await result.current.authenticatedFetch("https://api.example.test/data");
    });

    expect(getValidToken).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith(
      "https://api.example.test/data",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer bootstrap-token",
        }),
      }),
    );
  });
});
