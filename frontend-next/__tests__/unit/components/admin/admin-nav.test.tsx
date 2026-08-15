import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AdminNav from "@/components/admin/admin-nav";

const getSession = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/users",
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getSession } }),
}));

describe("AdminNav", () => {
  beforeEach(() => {
    getSession.mockResolvedValue({ data: { session: null } });
  });

  it("identifie la navigation et la page active pour les technologies d'assistance", () => {
    render(<AdminNav />);

    expect(
      screen.getByRole("navigation", { name: "Administration" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Utilisateurs" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("conserve toutes les destinations dans une navigation mobile défilable", () => {
    render(<AdminNav />);

    const navigation = screen.getByRole("navigation", {
      name: "Administration",
    });
    expect(navigation).toHaveClass("overflow-x-auto");
    expect(screen.getAllByRole("link")).toHaveLength(17);
  });
});
