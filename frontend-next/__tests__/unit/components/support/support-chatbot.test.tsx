import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SupportChatbot } from "@/components/support/support-chatbot";

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    user: { email: "dany@huntzen.test", user_metadata: { full_name: "Dany Test" } },
  }),
}));

vi.mock("@/hooks/use-support", () => ({
  useSupportChat: () => ({ messages: [], isLoading: false, sendMessage: vi.fn() }),
}));

describe("SupportChatbot", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ entries: [] }),
      }),
    );
  });

  it("utilise les libellés traduits et nomme le bouton d'envoi", async () => {
    render(<SupportChatbot onOpenTicket={vi.fn()} />);

    expect(screen.getByText("welcome")).toBeInTheDocument();
    expect(screen.getByText("frequentQuestions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "send" })).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/support-faq.json"));
  });
});
