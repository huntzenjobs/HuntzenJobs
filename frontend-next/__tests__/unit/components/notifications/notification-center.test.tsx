import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NotificationCenter } from "@/components/notifications/notification-center";

const mockMarkAllAsRead = vi.fn();
const mockNotifications = [
  { id: "n1", type: "job_alert", title: "3 nouvelles offres", body: "Des offres.", read: false, created_at: "2026-03-11T10:00:00Z", data: {} },
  { id: "n2", type: "promo_code", title: "Offre -20%", body: "24h.", read: true, created_at: "2026-03-10T10:00:00Z", data: {} },
];

vi.mock("@/hooks/use-notifications", () => ({
  useNotifications: () => ({ notifications: mockNotifications, unreadCount: 1, isLoading: false, markAsRead: vi.fn(), markAllAsRead: mockMarkAllAsRead }),
}));
vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ session: null }),
}));
vi.mock("@/lib/supabase/client", () => ({
  supabase: { channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })), removeChannel: vi.fn(), from: vi.fn() },
}));

describe("NotificationCenter", () => {
  it("n'affiche rien si isOpen=false", () => {
    const { container } = render(<NotificationCenter isOpen={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("affiche les notifications quand isOpen=true", () => {
    render(<NotificationCenter isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText("3 nouvelles offres")).toBeInTheDocument();
  });

  it("appelle markAllAsRead au click sur 'Tout lire'", () => {
    render(<NotificationCenter isOpen={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText(/tout lire/i));
    expect(mockMarkAllAsRead).toHaveBeenCalledOnce();
  });

  it("appelle onClose quand on ferme", () => {
    const onClose = vi.fn();
    render(<NotificationCenter isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText(/fermer/i));
    expect(onClose).toHaveBeenCalled();
  });
});
