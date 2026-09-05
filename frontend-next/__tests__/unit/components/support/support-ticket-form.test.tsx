import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SupportTicketForm } from "@/components/support/support-ticket-form";
import { SupportTicketSubmissionError } from "@/hooks/use-support";

const requestId = "11111111-2222-4333-8444-555555555555";
const upload = vi.fn().mockResolvedValue({ error: null });
const remove = vi.fn().mockResolvedValue({ error: null });

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "user@huntzen.test", user_metadata: {} },
  }),
}));

vi.mock("@/contexts/subscription-context", () => ({
  useSubscription: () => ({ planName: "Free" }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: {
      from: () => ({ upload, remove }),
    },
  }),
}));

describe("SupportTicketForm", () => {
  beforeEach(() => {
    upload.mockReset().mockResolvedValue({ error: null });
    remove.mockReset().mockResolvedValue({ error: null });
  });

  it("refuse un sujet et une description composés uniquement d'espaces", async () => {
    const user = userEvent.setup();
    const controller = {
      isSubmitting: false,
      getTicketRequestId: vi.fn(() => requestId),
      submitTicket: vi.fn(),
    };
    render(<SupportTicketForm controller={controller} />);

    await user.type(screen.getByLabelText("subjectLabel"), "     ");
    await user.type(
      screen.getByLabelText("descriptionLabel"),
      "                         ",
    );
    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(controller.submitTicket).not.toHaveBeenCalled();
  });

  it("n'envoie pas le ticket si la pièce jointe sélectionnée ne peut pas être chargée", async () => {
    upload.mockResolvedValueOnce({ error: new Error("upload failed") });
    const user = userEvent.setup();
    const controller = {
      isSubmitting: false,
      getTicketRequestId: vi.fn(() => requestId),
      submitTicket: vi.fn(),
    };
    const { container } = render(<SupportTicketForm controller={controller} />);

    await user.type(screen.getByLabelText("subjectLabel"), "Connexion mobile");
    await user.type(
      screen.getByLabelText("descriptionLabel"),
      "Le lien de connexion échoue sur mon téléphone.",
    );
    fireEvent.change(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      {
        target: {
          files: [new File(["capture"], "capture.png", { type: "image/png" })],
        },
      },
    );

    await user.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(controller.submitTicket).not.toHaveBeenCalled();
  });

  it("réutilise le chemin exact de la pièce jointe sur un retry incertain", async () => {
    const user = userEvent.setup();
    const controller = {
      isSubmitting: false,
      getTicketRequestId: vi.fn(() => requestId),
      submitTicket: vi
        .fn()
        .mockRejectedValueOnce(new Error("timeout"))
        .mockResolvedValue({ ticket_id: "ticket-1", short_id: "A1B2C3D4" }),
    };
    const { container } = render(<SupportTicketForm controller={controller} />);

    await user.type(screen.getByLabelText("subjectLabel"), "Connexion mobile");
    await user.type(
      screen.getByLabelText("descriptionLabel"),
      "Le lien de connexion échoue sur mon téléphone.",
    );
    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();
    fireEvent.change(fileInput as HTMLInputElement, {
      target: {
        files: [new File(["capture"], "Capture écran finale.PNG", { type: "image/png" })],
      },
    });

    const submit = screen.getByRole("button", { name: "submit" });
    await user.click(submit);
    await waitFor(() => expect(controller.submitTicket).toHaveBeenCalledTimes(1));
    await user.click(submit);
    await waitFor(() => expect(controller.submitTicket).toHaveBeenCalledTimes(2));

    expect(upload).toHaveBeenCalledTimes(1);
    const uploadedPath = upload.mock.calls[0][0] as string;
    expect(uploadedPath).toContain(`user-1/${requestId}/`);
    expect(uploadedPath).not.toContain(" ");
    expect(controller.submitTicket.mock.calls[0][0].attachment_url).toBe(uploadedPath);
    expect(controller.submitTicket.mock.calls[1][0].attachment_url).toBe(uploadedPath);
    expect(remove).not.toHaveBeenCalled();
  });

  it("supprime uniquement l'objet exact après un rejet HTTP définitif", async () => {
    const user = userEvent.setup();
    const controller = {
      isSubmitting: false,
      getTicketRequestId: vi.fn(() => requestId),
      submitTicket: vi
        .fn()
        .mockRejectedValue(new SupportTicketSubmissionError("invalide", 422)),
    };
    const { container } = render(<SupportTicketForm controller={controller} />);

    await user.type(screen.getByLabelText("subjectLabel"), "Connexion mobile");
    await user.type(
      screen.getByLabelText("descriptionLabel"),
      "Le lien de connexion échoue sur mon téléphone.",
    );
    fireEvent.change(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      {
        target: {
          files: [new File(["capture"], "capture.png", { type: "image/png" })],
        },
      },
    );
    await user.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    expect(remove).toHaveBeenCalledWith([
      expect.stringMatching(
        new RegExp(`^user-1/${requestId}/[a-zA-Z0-9_-]+\\.png$`),
      ),
    ]);
  });

  it("conserve le chemin si Storage refuse le nettoyage afin d'éviter un ré-upload", async () => {
    remove.mockResolvedValueOnce({ error: new Error("delete denied") });
    const user = userEvent.setup();
    const controller = {
      isSubmitting: false,
      getTicketRequestId: vi.fn(() => requestId),
      submitTicket: vi
        .fn()
        .mockRejectedValue(new SupportTicketSubmissionError("invalide", 422)),
    };
    const { container } = render(<SupportTicketForm controller={controller} />);

    await user.type(screen.getByLabelText("subjectLabel"), "Connexion mobile");
    await user.type(
      screen.getByLabelText("descriptionLabel"),
      "Le lien de connexion échoue sur mon téléphone.",
    );
    fireEvent.change(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      {
        target: {
          files: [new File(["capture"], "capture.png", { type: "image/png" })],
        },
      },
    );

    const submit = screen.getByRole("button", { name: "submit" });
    await user.click(submit);
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    await user.click(submit);
    await waitFor(() => expect(controller.submitTicket).toHaveBeenCalledTimes(2));

    expect(upload).toHaveBeenCalledTimes(1);
  });
});
