import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PromptsPage from "@/app/admin/prompts/page";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "staging-token" } },
      }),
    },
  }),
}));

describe("PromptsPage", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const path = String(url);
        const payload = path.endsWith("/api/admin/prompts")
          ? {
              prompts: [
                {
                  name: "first",
                  display_name: "Prompt un",
                  updated_at: null,
                  updated_by: null,
                },
                {
                  name: "second",
                  display_name: "Prompt deux",
                  updated_at: null,
                  updated_by: null,
                },
              ],
            }
          : path.endsWith("/first")
            ? {
                name: "first",
                display_name: "Prompt un",
                content: "Version initiale",
                updated_at: null,
                updated_by: null,
              }
            : {
                name: "second",
                display_name: "Prompt deux",
                content: "Deuxième contenu",
                updated_at: null,
                updated_by: null,
              };

        return { ok: true, json: async () => payload, text: async () => "" };
      }),
    );
  });

  it("protège les modifications non enregistrées avec une confirmation intégrée", async () => {
    render(<PromptsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Prompt un" }));
    const editor = await screen.findByRole("textbox", {
      name: "Contenu du prompt",
    });
    fireEvent.change(editor, { target: { value: "Version modifiée" } });
    fireEvent.click(screen.getByRole("button", { name: "Prompt deux" }));

    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ignorer les modifications" }),
    ).toBeInTheDocument();
    expect(editor).toHaveValue("Version modifiée");
  });
});
