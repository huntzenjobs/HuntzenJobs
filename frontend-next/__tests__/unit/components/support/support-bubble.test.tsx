import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SupportBubble } from "@/components/support/support-bubble";

const { useSupportTicket } = vi.hoisted(() => ({
  useSupportTicket: vi.fn(),
}));

vi.mock("@/hooks/use-support", () => ({
  useSupportTicket,
}));

vi.mock("@/components/support/support-chatbot", () => ({
  SupportChatbot: () => <div>support-chatbot</div>,
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "user@huntzen.test", user_metadata: {} },
  }),
}));

vi.mock("@/contexts/subscription-context", () => ({
  useSubscription: () => ({ planName: "Free" }),
}));

describe("SupportBubble", () => {
  beforeEach(() => {
    useSupportTicket.mockReturnValue({
      myTickets: [],
      isLoading: false,
      isSubmitting: false,
      ticketsError: null,
      ticketMessages: {},
      messageLoading: {},
      messageErrors: {},
      getTicketRequestId: vi.fn(),
      submitTicket: vi.fn(),
      fetchTicketMessages: vi.fn(),
      refetch: vi.fn(),
    });
  });

  it("attend le choix de consentement avant de devenir interactive", () => {
    localStorage.clear();
    render(<SupportBubble />);

    expect(
      screen.queryByRole("button", { name: "buttonLabel" }),
    ).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new CustomEvent("huntzen:cookie-consent", { detail: "accepted" }),
      );
    });

    expect(
      screen.getByRole("button", { name: "buttonLabel" }),
    ).toBeInTheDocument();
  });

  it("partage une seule instance de suivi entre le compteur, le formulaire et l'historique", async () => {
    localStorage.setItem("huntzen_cookie_consent", "accepted");
    const user = userEvent.setup();
    render(<SupportBubble />);

    await user.click(screen.getByRole("button", { name: "buttonLabel" }));
    const callsBeforeTicketTab = useSupportTicket.mock.calls.length;
    await user.click(screen.getByRole("tab", { name: "tabTicket" }));

    expect(useSupportTicket.mock.calls.length - callsBeforeTicketTab).toBe(1);
  });
});
