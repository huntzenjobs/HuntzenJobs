import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SegmentsPage from "@/app/admin/segments/page";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "staging-token" } },
      }),
    },
  }),
}));

describe("SegmentsPage", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const path = String(url);
        const payload = path.endsWith("/service-update/preview")
          ? { recipient_count: 836 }
          : path.endsWith("/marketing-reactivation/preview")
            ? { recipient_count: 0 }
            : { users: [], total: 0 };
        return { ok: true, json: async () => payload, text: async () => "" };
      }),
    );
  });

  it("affiche l'audience autorisée pour la campagne de réactivation", async () => {
    render(<SegmentsPage />);

    expect(
      await screen.findByText("Campagne de réactivation"),
    ).toBeInTheDocument();
    expect(screen.getByText("836 comptes actifs")).toBeInTheDocument();
    expect(screen.getByText("0 destinataires autorisés")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Préparer l'email relationnel" }),
    ).toBeInTheDocument();
  });
});
