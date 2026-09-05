import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SupportTicketsTable } from "@/components/admin/support/support-tickets-table";

const { useAdminSupport } = vi.hoisted(() => ({
  useAdminSupport: vi.fn(),
}));

vi.mock("@/hooks/admin/use-admin-support", () => ({ useAdminSupport }));

const baseState = {
  tickets: [],
  stats: { open: 2, in_progress: 1, resolved: 4, resolved_pct: 57 },
  isLoading: false,
  error: null,
  filters: { status: "open", category: "", priority: "", search: "" },
  setFilters: vi.fn(),
  page: 2,
  pageSize: 20,
  setPage: vi.fn(),
  hasNextPage: true,
  ticketMessages: {},
  messageLoading: {},
  messageErrors: {},
  fetchTicketMessages: vi.fn(),
  updateTicket: vi.fn(),
  refetch: vi.fn(),
};

describe("SupportTicketsTable", () => {
  beforeEach(() => {
    useAdminSupport.mockReturnValue(baseState);
  });

  it("présente des filtres nommés et une table défilable sur petit écran", () => {
    render(<SupportTicketsTable />);

    expect(
      screen.getByRole("textbox", { name: "searchLabel" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("table").parentElement).toHaveClass(
      "overflow-x-auto",
    );
    expect(screen.getByRole("table")).toHaveClass("min-w-[720px]");
  });

  it("permet de parcourir les pages connues sans dépasser la première", async () => {
    const user = userEvent.setup();
    render(<SupportTicketsTable />);

    await user.click(screen.getByRole("button", { name: "nextPage" }));
    await user.click(screen.getByRole("button", { name: "previousPage" }));

    expect(baseState.setPage).toHaveBeenNthCalledWith(1, 3);
    expect(baseState.setPage).toHaveBeenNthCalledWith(2, 1);
    expect(screen.getByText("pageLabel")).toBeInTheDocument();
  });

  it("affiche une erreur avec une action de relance", async () => {
    const user = userEvent.setup();
    useAdminSupport.mockReturnValue({
      ...baseState,
      error: "ticketsUnavailable",
    });
    render(<SupportTicketsTable />);

    expect(screen.getByText("ticketsUnavailable")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "retry" }));
    expect(baseState.refetch).toHaveBeenCalled();
  });
});
