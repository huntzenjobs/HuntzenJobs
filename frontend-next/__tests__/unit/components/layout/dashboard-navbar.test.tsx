import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DashboardNavbar } from "@/components/layout/dashboard-navbar";

vi.mock("@/contexts/auth-context", () => ({
  useOptionalAuth: () => ({
    user: {
      email: "candidate@example.com",
      user_metadata: { full_name: "Candidate" },
    },
    signOut: vi.fn(),
  }),
}));

vi.mock("@/contexts/subscription-context", () => ({
  useOptionalSubscription: () => ({ plan: "free" }),
}));

vi.mock("@/components/notifications/notification-bell", () => ({
  NotificationBell: () => <button type="button">notifications</button>,
}));

vi.mock("@/components/language-switcher", () => ({
  LanguageSwitcherCompact: () => <div>languages</div>,
}));

describe("DashboardNavbar", () => {
  it("nomme explicitement les actions icône et le menu de compte", () => {
    render(<DashboardNavbar />);

    expect(screen.getByTitle("footer.help")).toHaveAttribute(
      "aria-label",
      "footer.help",
    );
    expect(screen.getByTitle("footer.pricing")).toHaveAttribute(
      "aria-label",
      "footer.pricing",
    );
    expect(screen.getByRole("button", { name: "aria.accountMenu" })).toHaveClass(
      "min-h-11",
    );
  });
});
