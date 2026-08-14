import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));

vi.mock("sonner", () => ({
  toast: { error: toastError },
}));

vi.mock("@/contexts/auth-context", () => ({
  useOptionalAuth: () => ({ user: null }),
}));

vi.mock("@/components/landing-header", () => ({ LandingHeader: () => null }));
vi.mock("@/components/layout/footer", () => ({ Footer: () => null }));

import ContactPage from "@/app/contact/page";

describe("formulaire de contact", () => {
  it("affiche les erreurs près des champs et focalise la première", () => {
    render(<ContactPage />);

    fireEvent.submit(
      screen.getByRole("button", { name: "sendMessage" }).closest("form")!,
    );

    const name = screen.getByLabelText("labelFullName");
    expect(name).toHaveFocus();
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAttribute("aria-describedby", "contact-name-error");
    expect(screen.getByText("errors.nameRequired")).toHaveAttribute(
      "id",
      "contact-name-error",
    );
    expect(toastError).not.toHaveBeenCalled();
  });
});
