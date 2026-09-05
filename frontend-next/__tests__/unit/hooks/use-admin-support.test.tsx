import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAdminSupport } from "@/hooks/admin/use-admin-support";

const session = { access_token: "admin-token" };
const { translate } = vi.hoisted(() => ({
  translate: (key: string) => key,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => translate,
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ session }),
}));

function jsonResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(data),
  } as unknown as Response;
}

describe("useAdminSupport", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          tickets: Array.from({ length: 20 }, (_, index) => ({ id: `ticket-${index}` })),
          stats: { open: 20, in_progress: 0, resolved: 0, resolved_pct: 0 },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("envoie la pagination et attend le debounce avant de rechercher", async () => {
    const { result } = renderHook(() => useAdminSupport());

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("page=1&page_size=20");
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));

    act(() => {
      result.current.setFilters((current) => ({ ...current, search: "dany" }));
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(fetch).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2), { timeout: 800 });
    expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain("search=dany");

    act(() => result.current.setPage(2));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(String(vi.mocked(fetch).mock.calls[2][0])).toContain("page=2&page_size=20");
  });
});
