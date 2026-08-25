import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SupportBubble } from "@/components/support/support-bubble";

vi.mock("@/hooks/use-support", () => ({
  useSupportTicket: () => ({ myTickets: [] }),
}));

vi.mock("@/components/support/support-widget", () => ({
  SupportWidget: () => <div>support-widget</div>,
}));

describe("SupportBubble", () => {
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
});
