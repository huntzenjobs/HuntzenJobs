import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SupportTicketList } from "@/components/support/support-ticket-list";

const fetchTicketMessages = vi.fn();

const controller = {
  myTickets: [
    {
      id: "ticket-1",
      short_id: "A1B2C3D4",
      category: "bug",
      priority: "normal",
      subject: "Connexion mobile",
      status: "in_progress" as const,
      created_at: "2026-08-31T10:00:00Z",
      updated_at: "2026-08-31T12:00:00Z",
    },
  ],
  isLoading: false,
  ticketsError: null,
  ticketMessages: {
    "ticket-1": [
      {
        id: "message-1",
        author_role: "admin" as const,
        content: "Le correctif mobile est en ligne.",
        created_at: "2026-08-31T12:00:00Z",
      },
    ],
  },
  messageLoading: {},
  messageErrors: {},
  fetchTicketMessages,
  refetch: vi.fn(),
};

describe("SupportTicketList", () => {
  it("ouvre le fil d'un ticket et demande son historique", async () => {
    const user = userEvent.setup();
    render(<SupportTicketList controller={controller} />);

    await user.click(
      screen.getByRole("button", { name: /Connexion mobile/i }),
    );

    expect(fetchTicketMessages).toHaveBeenCalledWith("ticket-1");
    expect(
      screen.getByText("Le correctif mobile est en ligne."),
    ).toBeInTheDocument();
  });

  it("traduit les changements de statut système au lieu d'afficher leur valeur technique", async () => {
    const user = userEvent.setup();
    render(
      <SupportTicketList
        controller={{
          ...controller,
          ticketMessages: {
            "ticket-1": [
              {
                id: "message-status",
                author_role: "system",
                content: "status:resolved",
                created_at: "2026-08-31T12:30:00Z",
              },
            ],
          },
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Connexion mobile/i }));

    expect(screen.queryByText("status:resolved")).not.toBeInTheDocument();
    expect(screen.getByText("statusChanged")).toBeInTheDocument();
  });
});
