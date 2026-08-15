import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SupportTicketsTable } from "@/components/admin/support/support-tickets-table";

vi.mock("@/hooks/admin/use-admin-support", () => ({
  useAdminSupport: () => ({
    tickets: [],
    stats: {
      open: 2,
      in_progress: 1,
      resolved: 4,
      closed: 0,
      resolved_pct: 57,
    },
    isLoading: false,
    filters: { status: "open", category: "", priority: "", search: "" },
    setFilters: vi.fn(),
    updateTicket: vi.fn(),
  }),
}));

describe("SupportTicketsTable", () => {
  it("présente des filtres nommés et une table défilable sur petit écran", () => {
    render(<SupportTicketsTable />);

    expect(
      screen.getByRole("textbox", { name: "Rechercher un ticket" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("table").parentElement).toHaveClass(
      "overflow-x-auto",
    );
    expect(screen.getByRole("table")).toHaveClass("min-w-[720px]");
  });
});
