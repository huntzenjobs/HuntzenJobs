import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TicketDetailDrawer } from "@/components/admin/support/ticket-detail-drawer";

const ticket = {
  id: "ticket-1",
  short_id: "A1B2C3D4",
  user_id: "user-1",
  user_email: "user@huntzen.test",
  category: "bug",
  priority: "urgent",
  subject: "Connexion mobile",
  description: "Le lien de connexion échoue sur mon téléphone.",
  status: "open" as const,
  created_at: "2026-08-31T10:00:00Z",
  updated_at: "2026-08-31T10:00:00Z",
};

describe("TicketDetailDrawer", () => {
  it("conserve le request_id lors d'un retry puis le renouvelle après succès", async () => {
    const user = userEvent.setup();
    const onUpdate = vi
      .fn()
      .mockRejectedValueOnce(new Error("indisponible"))
      .mockResolvedValue(undefined);

    render(
      <TicketDetailDrawer
        ticket={ticket}
        messages={[]}
        messagesLoading={false}
        onRetryMessages={vi.fn()}
        onClose={vi.fn()}
        onUpdate={onUpdate}
      />,
    );

    await user.type(screen.getByRole("textbox"), "Le correctif est prêt.");
    const save = screen.getByRole("button", { name: "sendReply" });
    await user.click(save);
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);

    const firstRequest = onUpdate.mock.calls[0][1].request_id;
    const retryRequest = onUpdate.mock.calls[1][1].request_id;
    expect(firstRequest).toMatch(/^[0-9a-f-]{36}$/i);
    expect(retryRequest).toBe(firstRequest);
  });

  it("traduit les changements de statut dans l'historique admin", () => {
    render(
      <TicketDetailDrawer
        ticket={ticket}
        messages={[
          {
            id: "message-status",
            author_role: "system",
            content: "status:resolved",
            created_at: "2026-08-31T12:30:00Z",
          },
        ]}
        messagesLoading={false}
        onRetryMessages={vi.fn()}
        onClose={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );

    expect(screen.queryByText("status:resolved")).not.toBeInTheDocument();
    expect(screen.getByText("statusChanged")).toBeInTheDocument();
  });
});
