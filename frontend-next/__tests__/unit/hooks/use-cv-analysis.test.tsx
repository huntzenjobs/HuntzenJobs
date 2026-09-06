import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCVAnalysis } from "@/hooks/use-cv-analysis";

const { authenticatedFetch } = vi.hoisted(() => ({ authenticatedFetch: vi.fn() }));
vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ session: { access_token: "synthetic-test-token" } }),
}));
vi.mock("@/hooks/use-authenticated-fetch", () => ({
  useAuthenticatedFetch: () => ({ authenticatedFetch }),
}));
vi.mock("@/contexts/i18n-context", () => ({ useLocale: () => ({ locale: "fr" }) }));
vi.mock("@/hooks/use-career-score", () => ({ sendXpEvent: vi.fn() }));

describe("Suivi de l'analyse CV", () => {
  beforeEach(() => {
    authenticatedFetch.mockReset();
    authenticatedFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      success: true, cv_id: "synthetic-analysis", status: "pending",
    })));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("sort du chargement quand la lecture du statut échoue", async () => {
    authenticatedFetch.mockRejectedValueOnce(new Error("Network unavailable"));
    const { result } = renderHook(() => useCVAnalysis());
    await act(async () => {
      await result.current.uploadCV(new File(["synthetic"], "cv.pdf"));
    });
    expect(result.current.error).toBe("Network unavailable");
    expect(result.current.isPolling).toBe(false);
    expect(result.current.status).toBe("failed");
  });

  it("termine à 100 pour cent quand le serveur confirme la fin", async () => {
    authenticatedFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      status: "completed", result: { ats_score: { overall_score: 80 } },
    })));
    const { result } = renderHook(() => useCVAnalysis());
    await act(async () => {
      await result.current.uploadCV(new File(["synthetic"], "cv.pdf"));
    });
    expect(result.current.status).toBe("completed");
    expect(result.current.progress).toBe(100);
    expect(result.current.result?.ats_score.overall_score).toBe(80);
  });
});
