import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  PLAN_LIMITS,
  useFreemiumLimits,
} from "@/hooks/use-freemium-limits";

describe("useFreemiumLimits usage", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("incrémente et persiste les recherches de recruteurs", async () => {
    const { result } = renderHook(() => useFreemiumLimits("quota-user"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    act(() => result.current.incrementUsage("recruiter_search", 2));

    expect(result.current.usage.recruiterSearchesUsedToday).toBe(2);
    expect(result.current.getRemaining("recruiter_search")).toBe(8);
    expect(
      JSON.parse(
        localStorage.getItem("huntzen_freemium_state_quota-user") ?? "{}",
      ).usage.recruiterSearchesUsedToday,
    ).toBe(2);
  });

  it("synchronise et persiste les recherches de recruteurs depuis le serveur", async () => {
    const { result } = renderHook(() => useFreemiumLimits("sync-user"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    act(() => result.current.syncUsage("recruiter_search", 7));

    expect(result.current.usage.recruiterSearchesUsedToday).toBe(7);
    expect(result.current.getRemaining("recruiter_search")).toBe(3);
    expect(
      JSON.parse(
        localStorage.getItem("huntzen_freemium_state_sync-user") ?? "{}",
      ).usage.recruiterSearchesUsedToday,
    ).toBe(7);
  });

  it("utilise les limites de secours live pour les CV et les lettres", () => {
    expect(PLAN_LIMITS.free.cv_adapt_per_day).toBe(10);
    expect(PLAN_LIMITS.free.cover_letter_per_day).toBe(10);
    expect(PLAN_LIMITS.starter.cv_adapt_per_day).toBe(30);
    expect(PLAN_LIMITS.starter.cover_letter_per_day).toBe(30);
  });
});
