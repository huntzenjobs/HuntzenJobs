import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useCareerScore } from "@/hooks/use-career-score";

const mockSession = { access_token: "tok123" };

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ session: mockSession }),
}));

global.fetch = vi.fn();

const mockScore = {
  total_score: 68,
  activity_score: 30,
  ai_score: 28,
  xp_score: 10,
  ai_justification: "Profil solide avec expérience pertinente.",
  last_calculated_at: "2026-03-11T10:00:00Z",
  next_recalc_at: "2026-03-12T10:00:00Z",
};

describe("useCareerScore", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retourne isLoading=true initialement", () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify(mockScore), { status: 200 })
    );
    const { result } = renderHook(() => useCareerScore());
    expect(result.current.isLoading).toBe(true);
  });

  it("retourne le score après fetch réussi", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify(mockScore), { status: 200 })
    );
    const { result } = renderHook(() => useCareerScore());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.score?.total_score).toBe(68);
    expect(result.current.score?.ai_justification).toBe(
      "Profil solide avec expérience pertinente."
    );
  });

  it("expose une fonction recalculate", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify(mockScore), { status: 200 })
    );
    const { result } = renderHook(() => useCareerScore());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(typeof result.current.recalculate).toBe("function");
  });

  it("gère les erreurs sans crash", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Network error")
    );
    const { result } = renderHook(() => useCareerScore());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.score).toBeNull();
    expect(result.current.error).toBeTruthy();
  });
});
