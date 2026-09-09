import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePlansConfig } from "@/hooks/use-plans-config";

vi.mock("next-intl", () => ({
  useLocale: () => "fr",
}));

const plansResponse = [
  {
    id: "free-plan",
    name: "free",
    display_name: "Exploration",
    description: "Plan gratuit",
    price_monthly: 0,
    price_yearly: null,
    features: [],
    features_excluded: [],
    limits: {},
    feature_flags: {},
    sort_order: 0,
  },
];

describe("usePlansConfig", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("partage une seule requête entre les composants montés simultanément", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(JSON.stringify(plansResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );

    const first = renderHook(() => usePlansConfig());
    const second = renderHook(() => usePlansConfig());

    await waitFor(() => {
      expect(first.result.current.plans).toEqual(plansResponse);
      expect(second.result.current.plans).toEqual(plansResponse);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("partage aussi une seule requête après une invalidation administrateur", async () => {
    let resolveInitial: ((response: Response) => void) | undefined;
    let resolveRefresh: ((response: Response) => void) | undefined;
    const initialResponse = new Promise<Response>((resolve) => {
      resolveInitial = resolve;
    });
    const refreshedResponse = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        fetchMock.mock.calls.length === 1 ? initialResponse : refreshedResponse,
    );

    renderHook(() => usePlansConfig());
    const second = renderHook(() => usePlansConfig());

    act(() => {
      window.dispatchEvent(new Event("subscription-changed"));
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    resolveRefresh?.(
      new Response(JSON.stringify(plansResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    resolveInitial?.(
      new Response(JSON.stringify(plansResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));
  });
});
