import { describe, expect, it, vi } from "vitest";

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import DashboardCompatibilityPage from "@/app/dashboard/page";

describe("DashboardCompatibilityPage", () => {
  it("redirige les anciens liens dashboard vers la recherche d'emploi", () => {
    expect(() => DashboardCompatibilityPage()).toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/jobs");
  });
});
