import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { searchParams } = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => searchParams,
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    user: null,
    signInWithGoogle: vi.fn(),
    signInWithEmail: vi.fn(),
    signUpWithEmail: vi.fn(),
    resendConfirmationEmail: vi.fn(),
    clearError: vi.fn(),
    error: null,
  }),
}));

vi.mock("@/components/auth/auth-layout", () => ({
  AuthLayout: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/auth/promo-code-input", () => ({
  PromoCodeInput: () => null,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { updateUser: vi.fn() } }),
}));

import ForgotPasswordPage from "@/app/forgot-password/page";
import LoginPage from "@/app/login/page";
import ResetPasswordPage from "@/app/reset-password/page";
import SignupPage from "@/app/signup/page";

describe("accessibilité de l’authentification", () => {
  it("déclare les informations d’autocomplétion de connexion", () => {
    render(<LoginPage />);

    expect(screen.getByLabelText("emailLabel")).toHaveAttribute(
      "autocomplete",
      "email",
    );
    expect(screen.getByLabelText("passwordLabel")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
  });

  it("déclare l’autocomplétion de récupération et de nouveau mot de passe", () => {
    const { unmount } = render(<ForgotPasswordPage />);
    expect(screen.getByLabelText("emailLabel")).toHaveAttribute(
      "autocomplete",
      "email",
    );
    unmount();

    render(<ResetPasswordPage />);
    expect(screen.getByLabelText("passwordLabel")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    expect(screen.getByLabelText("confirmLabel")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
  });

  it("relie l’erreur de confirmation au champ fautif et le focalise", () => {
    render(<SignupPage />);

    fireEvent.change(screen.getByLabelText("fullNameLabel"), {
      target: { value: "Ada Lovelace" },
    });
    fireEvent.change(screen.getByLabelText("emailLabel"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByLabelText("passwordLabel"), {
      target: { value: "secret1" },
    });
    const confirmation = screen.getByLabelText("confirmPasswordLabel");
    fireEvent.change(confirmation, { target: { value: "secret2" } });
    fireEvent.click(screen.getByRole("button", { name: "cta" }));

    expect(confirmation).toHaveAttribute("aria-invalid", "true");
    expect(confirmation).toHaveAttribute(
      "aria-describedby",
      "signup-password-error",
    );
    expect(confirmation).toHaveFocus();
    expect(screen.getByText("passwordMismatch")).toHaveAttribute(
      "id",
      "signup-password-error",
    );
  });

  it("rend le succès d’inscription comme un dialogue nommé", () => {
    searchParams.set("success", "true");
    searchParams.set("email", "ada@example.com");

    render(<SignupPage />);

    expect(screen.getByRole("dialog", { name: "success.title" })).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: "success.close" }),
    ).toHaveLength(2);

    searchParams.delete("success");
    searchParams.delete("email");
  });
});
