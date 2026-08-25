import { NextRequest } from "next/server";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient, verifyOtp } = vi.hoisted(() => ({
  createClient: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/security/logger", () => ({
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock("next-intl", () => ({
  useTranslations: vi.fn(() => (key: string) => key),
}));
vi.mock("@/components/landing-header", () => ({
  LandingHeader: () => null,
}));

import * as callbackRoute from "@/app/auth/callback/route";

describe("confirmation d’adresse email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClient.mockResolvedValue({
      auth: { verifyOtp },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: { is_admin: false } }),
          })),
        })),
      })),
    });
  });

  it("ne consomme jamais le jeton lors du GET ouvert par le client mail", async () => {
    const response = await callbackRoute.GET(
      new NextRequest(
        "https://www.huntzenjobs.com/auth/callback?token_hash=jeton-test&type=email",
      ),
    );

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://www.huntzenjobs.com/auth/confirm?token_hash=jeton-test&type=email",
    );
  });

  it("réserve la consommation du jeton à une soumission POST humaine", async () => {
    verifyOtp.mockResolvedValue({
      data: {
        session: { access_token: "session-test" },
        user: {
          id: "user-test",
          email: "test@example.com",
          user_metadata: { onboarding_completed: true },
        },
      },
      error: null,
    });
    const request = new NextRequest(
      "https://www.huntzenjobs.com/auth/callback",
      {
        method: "POST",
        body: new URLSearchParams({
          token_hash: "jeton-test",
          type: "email",
        }),
      },
    );

    const response = await callbackRoute.POST(request);

    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: "jeton-test",
      type: "email",
    });
    expect(response.headers.get("location")).toBe(
      "https://www.huntzenjobs.com/jobs",
    );
  });

  it("demande une confirmation humaine avant de soumettre le jeton", async () => {
    const confirmPage = await import("@/app/auth/confirm/page");
    const page = await confirmPage.default({
      searchParams: Promise.resolve({
        token_hash: "jeton-test",
        type: "email",
      }),
    });

    render(page);

    expect(screen.getByRole("button", { name: "action" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("jeton-test")).toHaveAttribute(
      "name",
      "token_hash",
    );
    expect(screen.queryByText("heroTitle")).not.toBeInTheDocument();
  });
});
