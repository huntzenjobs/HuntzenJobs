import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NotificationBell } from "@/components/notifications/notification-bell";

vi.mock("@/hooks/use-notifications", () => ({
  useNotifications: () => ({ notifications: [], unreadCount: 3, isLoading: false, markAsRead: vi.fn(), markAllAsRead: vi.fn() }),
}));
vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ session: { access_token: "tok", user: { id: "u1" } } }),
}));
// Mock NotificationCenter to avoid deep rendering
vi.mock("@/components/notifications/notification-center", () => ({
  NotificationCenter: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div role="dialog">Center</div> : null,
}));

describe("NotificationBell", () => {
  it("affiche le badge avec le count non lu", () => {
    render(<NotificationBell />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("ouvre le centre de notifications au click", () => {
    render(<NotificationBell />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
