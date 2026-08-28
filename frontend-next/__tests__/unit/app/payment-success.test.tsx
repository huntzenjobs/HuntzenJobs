import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import PaymentSuccessPage from "@/app/payment/success/page";

const searchParams = new URLSearchParams("session_id=cs_test_session");
const router = { push: vi.fn() };
const translate = (key: string) => key;

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => searchParams,
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ session: { access_token: "test-access-token" } }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => translate,
}));

vi.mock("@/lib/track", () => ({
  track: { payment: { purchase: vi.fn() } },
}));

describe("PaymentSuccessPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("annonce une progression bornée sur les vingt tentatives", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        new Response(
          JSON.stringify({ subscription: { plan_name: "free" } }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    render(<PaymentSuccessPage />);

    const progress = await screen.findByRole("progressbar");
    expect(progress).toHaveAttribute("aria-valuemin", "0");
    expect(progress).toHaveAttribute("aria-valuemax", "100");
    expect(progress).toHaveAttribute("aria-valuenow", "5");
  });
});
