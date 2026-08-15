import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SuggestionsAdminPage from "@/app/admin/suggestions/page";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "staging-token" } },
      }),
    },
  }),
}));

describe("SuggestionsAdminPage", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          suggestions: {
            "career-coach": [
              {
                id: "suggestion-1",
                assistant_id: "career-coach",
                text: "Comment préparer mon entretien ?",
                display_order: 1,
                is_active: true,
                created_at: "2026-08-15T12:00:00Z",
              },
            ],
          },
        }),
      }),
    );
  });

  it("nomme les actions et demande une confirmation intégrée avant suppression", async () => {
    render(<SuggestionsAdminPage />);

    expect(
      await screen.findByText("Comment préparer mon entretien ?"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Modifier la suggestion" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Supprimer la suggestion" }),
    );

    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirmer la suppression" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });
});
