import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useNotifications } from "@/hooks/use-notifications";

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ session: { access_token: "tok", user: { id: "u1" } } }),
}));

const mockChannel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() };
const mockSupabaseFrom = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
  update: vi.fn().mockReturnThis(),
};

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    channel: vi.fn(() => mockChannel),
    removeChannel: vi.fn(),
    from: vi.fn(() => mockSupabaseFrom),
  },
}));

const mockNotifications = [
  { id: "n1", type: "job_alert", title: "3 nouvelles offres", body: "...", read: false, created_at: "2026-03-11T10:00:00Z", data: {} },
  { id: "n2", type: "promo_code", title: "-20%", body: "...", read: true, created_at: "2026-03-10T10:00:00Z", data: {} },
];

describe("useNotifications", () => {
  beforeEach(() => vi.clearAllMocks());

  it("expose notifications, unreadCount, markAsRead, markAllAsRead", async () => {
    mockSupabaseFrom.limit.mockResolvedValueOnce({ data: mockNotifications, error: null });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(Array.isArray(result.current.notifications)).toBe(true);
    expect(typeof result.current.unreadCount).toBe("number");
    expect(typeof result.current.markAsRead).toBe("function");
    expect(typeof result.current.markAllAsRead).toBe("function");
  });

  it("calcule correctement unreadCount", async () => {
    mockSupabaseFrom.limit.mockResolvedValueOnce({ data: mockNotifications, error: null });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.unreadCount).toBe(1);
  });
});
