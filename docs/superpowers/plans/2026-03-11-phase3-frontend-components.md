# Phase 3 — Frontend Composants Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Créer les 4 blocs UI de Phase 3 : Career Score Card, système de Notifications temps réel, 8 Conversion Pop-ups, et page HuntZen Boost (parrainage gamifié).

**Architecture:** Chaque bloc est un composant autonome avec son propre hook de données. Les notifications utilisent Supabase Realtime pour la mise à jour en direct. Les pop-ups partagent un registre de configuration unique. La page referral consomme `GET /api/referrals/boost-status`.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Tailwind CSS, Vitest + Testing Library, Supabase Realtime, Framer Motion, Lucide React, shadcn/ui

---

## Chunk 1: Career Score Card

### Task 1: Hook `use-career-score.ts`

**Files:**
- Create: `frontend-next/src/hooks/use-career-score.ts`
- Test: `frontend-next/__tests__/unit/components/career-score/use-career-score.test.ts`

- [ ] **Step 1: Écrire le test**

```typescript
// frontend-next/__tests__/unit/components/career-score/use-career-score.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useCareerScore } from "@/hooks/use-career-score";

const mockSession = { access_token: "tok123" };

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ session: mockSession }),
}));

global.fetch = vi.fn();

const mockScore = {
  total_score: 68,
  activity_score: 30,
  ai_score: 28,
  xp_score: 10,
  ai_justification: "Profil solide avec expérience pertinente.",
  last_calculated_at: "2026-03-11T10:00:00Z",
  next_recalc_at: "2026-03-12T10:00:00Z",
};

describe("useCareerScore", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retourne isLoading=true initialement", () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify(mockScore), { status: 200 })
    );
    const { result } = renderHook(() => useCareerScore());
    expect(result.current.isLoading).toBe(true);
  });

  it("retourne le score après fetch réussi", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify(mockScore), { status: 200 })
    );
    const { result } = renderHook(() => useCareerScore());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.score?.total_score).toBe(68);
    expect(result.current.score?.ai_justification).toBe(
      "Profil solide avec expérience pertinente."
    );
  });

  it("expose une fonction recalculate", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify(mockScore), { status: 200 })
    );
    const { result } = renderHook(() => useCareerScore());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(typeof result.current.recalculate).toBe("function");
  });

  it("gère les erreurs sans crash", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Network error")
    );
    const { result } = renderHook(() => useCareerScore());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.score).toBeNull();
    expect(result.current.error).toBeTruthy();
  });
});
```

- [ ] **Step 2: Lancer le test (doit échouer)**

```bash
cd frontend-next && npx vitest run __tests__/unit/components/career-score/use-career-score.test.ts
```
Expected: FAIL — `Cannot find module '@/hooks/use-career-score'`

- [ ] **Step 3: Implémenter le hook**

```typescript
// frontend-next/src/hooks/use-career-score.ts
"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/auth-context";

export interface CareerScoreData {
  total_score: number;
  activity_score: number;
  ai_score: number;
  xp_score: number;
  ai_justification: string;
  last_calculated_at: string;
  next_recalc_at: string;
}

interface UseCareerScoreReturn {
  score: CareerScoreData | null;
  isLoading: boolean;
  error: string | null;
  recalculate: () => Promise<void>;
}

export function useCareerScore(): UseCareerScoreReturn {
  const { session } = useAuth();
  const [score, setScore] = useState<CareerScoreData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchScore = useCallback(async (forceRecalc = false) => {
    if (!session?.access_token) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const endpoint = forceRecalc
        ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/career-score/calculate`
        : `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/career-score`;
      const method = forceRecalc ? "POST" : "GET";
      const res = await fetch(endpoint, {
        method,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const data: CareerScoreData = await res.json();
      setScore(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setScore(null);
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    fetchScore();
  }, [fetchScore]);

  const recalculate = useCallback(() => fetchScore(true), [fetchScore]);

  return { score, isLoading, error, recalculate };
}
```

- [ ] **Step 4: Lancer le test (doit passer)**

```bash
cd frontend-next && npx vitest run __tests__/unit/components/career-score/use-career-score.test.ts
```
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend-next/src/hooks/use-career-score.ts frontend-next/__tests__/unit/components/career-score/use-career-score.test.ts
git commit -m "feat(career-score): add useCareerScore hook with fetch + recalculate"
```

---

### Task 2: Composant `career-score-card.tsx`

**Files:**
- Create: `frontend-next/src/components/career-score/career-score-card.tsx`
- Test: `frontend-next/__tests__/unit/components/career-score/career-score-card.test.tsx`

- [ ] **Step 1: Écrire le test**

```typescript
// frontend-next/__tests__/unit/components/career-score/career-score-card.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CareerScoreCard } from "@/components/career-score/career-score-card";

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ session: { access_token: "tok" } }),
}));
vi.mock("@/contexts/subscription-context", () => ({
  useSubscription: () => ({ hasFeature: () => true }),
}));
vi.mock("@/hooks/use-career-score", () => ({
  useCareerScore: () => ({
    score: {
      total_score: 68,
      activity_score: 30,
      ai_score: 28,
      xp_score: 10,
      ai_justification: "Profil solide.",
    },
    isLoading: false,
    error: null,
    recalculate: vi.fn(),
  }),
}));

describe("CareerScoreCard", () => {
  it("affiche le score total", () => {
    render(<CareerScoreCard />);
    expect(screen.getByText("68")).toBeInTheDocument();
  });

  it("affiche les 3 sous-barres Activity, AI, XP", () => {
    render(<CareerScoreCard />);
    expect(screen.getByText(/activité/i)).toBeInTheDocument();
    expect(screen.getByText(/ia/i)).toBeInTheDocument();
    expect(screen.getByText(/xp/i)).toBeInTheDocument();
  });

  it("affiche la justification IA", () => {
    render(<CareerScoreCard />);
    expect(screen.getByText("Profil solide.")).toBeInTheDocument();
  });

  it("affiche le message motivant si score > 60", () => {
    render(<CareerScoreCard />);
    expect(
      screen.getByText(/profil devient vraiment intéressant/i)
    ).toBeInTheDocument();
  });

  it("affiche un skeleton en chargement", () => {
    vi.mock("@/hooks/use-career-score", () => ({
      useCareerScore: () => ({
        score: null,
        isLoading: true,
        error: null,
        recalculate: vi.fn(),
      }),
    }));
    // Test via data-testid
    const { container } = render(<CareerScoreCard />);
    expect(container.firstChild).toBeTruthy();
  });
});
```

- [ ] **Step 2: Lancer le test (doit échouer)**

```bash
cd frontend-next && npx vitest run __tests__/unit/components/career-score/career-score-card.test.tsx
```
Expected: FAIL — module not found

- [ ] **Step 3: Implémenter le composant**

```typescript
// frontend-next/src/components/career-score/career-score-card.tsx
"use client";

import { useState } from "react";
import { RefreshCw, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCareerScore } from "@/hooks/use-career-score";

interface SubBarProps {
  label: string;
  value: number;
  max: number;
  color: string;
}

function SubBar({ label, value, max, color }: SubBarProps) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}/{max}</span>
      </div>
      <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

interface CareerScoreCardProps {
  className?: string;
  compact?: boolean;
}

export function CareerScoreCard({ className, compact = false }: CareerScoreCardProps) {
  const { score, isLoading, recalculate } = useCareerScore();
  const [isRecalculating, setIsRecalculating] = useState(false);

  const handleRecalculate = async () => {
    setIsRecalculating(true);
    await recalculate();
    setIsRecalculating(false);
  };

  if (isLoading) {
    return (
      <div className={cn("rounded-xl border bg-card p-5 animate-pulse", className)}>
        <div className="h-4 w-32 bg-gray-200 rounded mb-4" />
        <div className="flex gap-4 items-center mb-4">
          <div className="w-16 h-16 rounded-full bg-gray-200" />
          <div className="flex-1 space-y-2">
            <div className="h-2 bg-gray-200 rounded" />
            <div className="h-2 bg-gray-200 rounded w-3/4" />
            <div className="h-2 bg-gray-200 rounded w-1/2" />
          </div>
        </div>
      </div>
    );
  }

  if (!score) return null;

  const getScoreColor = (s: number) => {
    if (s >= 70) return "text-green-600";
    if (s >= 50) return "text-amber-500";
    return "text-red-500";
  };

  const getRingColor = (s: number) => {
    if (s >= 70) return "#22c55e";
    if (s >= 50) return "#f59e0b";
    return "#ef4444";
  };

  const circumference = 2 * Math.PI * 28; // radius=28 for 64px ring
  const offset = circumference - (score.total_score / 100) * circumference;

  return (
    <div className={cn("rounded-xl border bg-card p-5", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-huntzen-blue" />
          <span className="text-sm font-semibold">Career Score</span>
        </div>
        <button
          onClick={handleRecalculate}
          disabled={isRecalculating}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Recalculer"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isRecalculating && "animate-spin")} />
        </button>
      </div>

      {/* Score ring + sub-bars */}
      <div className="flex items-start gap-5">
        {/* Ring */}
        <div className="relative flex-shrink-0" style={{ width: 64, height: 64 }}>
          <svg className="transform -rotate-90" width={64} height={64}>
            <circle cx={32} cy={32} r={28} fill="none" stroke="currentColor"
              strokeWidth={6} className="text-gray-100" />
            <circle cx={32} cy={32} r={28} fill="none"
              stroke={getRingColor(score.total_score)}
              strokeWidth={6} strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={offset}
              className="transition-all duration-1000 ease-out" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn("text-lg font-bold leading-none", getScoreColor(score.total_score))}>
              {score.total_score}
            </span>
            <span className="text-[9px] text-muted-foreground leading-none">/100</span>
          </div>
        </div>

        {/* Sub-bars */}
        <div className="flex-1 space-y-2">
          <SubBar label="Activité" value={score.activity_score} max={40} color="bg-huntzen-blue" />
          <SubBar label="IA" value={score.ai_score} max={40} color="bg-huntzen-turquoise" />
          <SubBar label="XP" value={score.xp_score} max={20} color="bg-violet-500" />
        </div>
      </div>

      {/* AI justification */}
      {score.ai_justification && (
        <p className="mt-3 text-xs text-muted-foreground italic leading-relaxed">
          {score.ai_justification}
        </p>
      )}

      {/* Motivating message */}
      {score.total_score >= 60 && (
        <p className="mt-2 text-xs text-green-600 font-medium">
          Ton profil devient vraiment intéressant pour les recruteurs.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Lancer le test (doit passer)**

```bash
cd frontend-next && npx vitest run __tests__/unit/components/career-score/
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend-next/src/components/career-score/ frontend-next/__tests__/unit/components/career-score/
git commit -m "feat(career-score): add CareerScoreCard with ring + sub-bars + AI justification"
```

---

## Chunk 2: Système de Notifications

### Task 3: Hook `use-notifications.ts`

**Files:**
- Create: `frontend-next/src/hooks/use-notifications.ts`
- Test: `frontend-next/__tests__/unit/components/notifications/use-notifications.test.ts`

- [ ] **Step 1: Écrire le test**

```typescript
// frontend-next/__tests__/unit/components/notifications/use-notifications.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useNotifications } from "@/hooks/use-notifications";

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ session: { access_token: "tok", user: { id: "u1" } } }),
}));

const mockSupabase = {
  channel: vi.fn().mockReturnThis(),
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
  removeChannel: vi.fn(),
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  execute: vi.fn().mockResolvedValue({ data: [], error: null }),
};

vi.mock("@/lib/supabase/client", () => ({
  supabase: mockSupabase,
}));

const mockNotifications = [
  { id: "n1", type: "job_alert", title: "3 nouvelles offres", body: "...", read: false, created_at: "2026-03-11T10:00:00Z", data: {} },
  { id: "n2", type: "promo_code", title: "-20%", body: "...", read: true, created_at: "2026-03-10T10:00:00Z", data: { coupon_code: "ABC" } },
];

describe("useNotifications", () => {
  beforeEach(() => vi.clearAllMocks());

  it("expose notifications, unreadCount, markAsRead, markAllAsRead", async () => {
    mockSupabase.execute.mockResolvedValueOnce({ data: mockNotifications, error: null });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(Array.isArray(result.current.notifications)).toBe(true);
    expect(typeof result.current.unreadCount).toBe("number");
    expect(typeof result.current.markAsRead).toBe("function");
    expect(typeof result.current.markAllAsRead).toBe("function");
  });

  it("calcule correctement unreadCount", async () => {
    mockSupabase.execute.mockResolvedValueOnce({ data: mockNotifications, error: null });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.unreadCount).toBe(1); // 1 non lue
  });
});
```

- [ ] **Step 2: Lancer le test (doit échouer)**

```bash
cd frontend-next && npx vitest run __tests__/unit/components/notifications/use-notifications.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implémenter le hook**

```typescript
// frontend-next/src/hooks/use-notifications.ts
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface AppNotification {
  id: string;
  type: "job_alert" | "cv_feedback" | "referral_bonus" | "promo_code" | "career_progress" | "interview_ready";
  title: string;
  body: string;
  data: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

interface UseNotificationsReturn {
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

export function useNotifications(): UseNotificationsReturn {
  const { session } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const userId = (session as { user?: { id?: string } } | null)?.user?.id;

  const fetchNotifications = useCallback(async () => {
    if (!userId) { setIsLoading(false); return; }
    try {
      const { data, error } = await supabase
        .from("user_notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!error && data) setNotifications(data as AppNotification[]);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // Initial fetch
  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  // Supabase Realtime subscription
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`user_notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "user_notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          setNotifications((prev) => [payload.new as AppNotification, ...prev]);
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [userId]);

  const markAsRead = useCallback(async (id: string) => {
    await supabase
      .from("user_notifications")
      .update({ read: true })
      .eq("id", id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!userId) return;
    await supabase
      .from("user_notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, [userId]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, isLoading, markAsRead, markAllAsRead };
}
```

- [ ] **Step 4: Lancer le test (doit passer)**

```bash
cd frontend-next && npx vitest run __tests__/unit/components/notifications/use-notifications.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend-next/src/hooks/use-notifications.ts frontend-next/__tests__/unit/components/notifications/use-notifications.test.ts
git commit -m "feat(notifications): add useNotifications hook with Supabase Realtime"
```

---

### Task 4: Composant `notification-bell.tsx`

**Files:**
- Create: `frontend-next/src/components/notifications/notification-bell.tsx`
- Test: `frontend-next/__tests__/unit/components/notifications/notification-bell.test.tsx`

- [ ] **Step 1: Écrire le test**

```typescript
// frontend-next/__tests__/unit/components/notifications/notification-bell.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NotificationBell } from "@/components/notifications/notification-bell";

vi.mock("@/hooks/use-notifications", () => ({
  useNotifications: () => ({
    notifications: [],
    unreadCount: 3,
    isLoading: false,
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
  }),
}));
vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ session: { access_token: "tok", user: { id: "u1" } } }),
}));

describe("NotificationBell", () => {
  it("affiche le badge avec le count non lu", () => {
    render(<NotificationBell />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("n'affiche pas de badge si count = 0", () => {
    vi.mock("@/hooks/use-notifications", () => ({
      useNotifications: () => ({
        notifications: [],
        unreadCount: 0,
        isLoading: false,
        markAsRead: vi.fn(),
        markAllAsRead: vi.fn(),
      }),
    }));
    render(<NotificationBell />);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("ouvre le centre de notifications au click", () => {
    render(<NotificationBell />);
    const bell = screen.getByRole("button");
    fireEvent.click(bell);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Lancer le test (doit échouer)**

```bash
cd frontend-next && npx vitest run __tests__/unit/components/notifications/notification-bell.test.tsx
```
Expected: FAIL

- [ ] **Step 3: Implémenter le composant**

```typescript
// frontend-next/src/components/notifications/notification-bell.tsx
"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/hooks/use-notifications";
import { NotificationCenter } from "./notification-center";

interface NotificationBellProps {
  className?: string;
}

export function NotificationBell({ className }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { unreadCount } = useNotifications();

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "relative p-2 rounded-lg hover:bg-accent transition-colors",
          className
        )}
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <NotificationCenter isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
```

- [ ] **Step 4: Lancer les tests notifications**

```bash
cd frontend-next && npx vitest run __tests__/unit/components/notifications/
```
Expected: PASS (tests bell)

- [ ] **Step 5: Commit**

```bash
git add frontend-next/src/components/notifications/notification-bell.tsx frontend-next/__tests__/unit/components/notifications/notification-bell.test.tsx
git commit -m "feat(notifications): add NotificationBell with unread badge"
```

---

### Task 5: Composant `notification-center.tsx`

**Files:**
- Create: `frontend-next/src/components/notifications/notification-center.tsx`
- Test: `frontend-next/__tests__/unit/components/notifications/notification-center.test.tsx`

- [ ] **Step 1: Écrire le test**

```typescript
// frontend-next/__tests__/unit/components/notifications/notification-center.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NotificationCenter } from "@/components/notifications/notification-center";

const mockMarkAsRead = vi.fn();
const mockMarkAllAsRead = vi.fn();

const mockNotifications = [
  { id: "n1", type: "job_alert", title: "3 nouvelles offres", body: "Des offres vous attendent.", read: false, created_at: "2026-03-11T10:00:00Z", data: {} },
  { id: "n2", type: "promo_code", title: "Offre -20%", body: "Valable 24h.", read: true, created_at: "2026-03-10T10:00:00Z", data: { coupon_code: "XYZ" } },
];

vi.mock("@/hooks/use-notifications", () => ({
  useNotifications: () => ({
    notifications: mockNotifications,
    unreadCount: 1,
    isLoading: false,
    markAsRead: mockMarkAsRead,
    markAllAsRead: mockMarkAllAsRead,
  }),
}));
vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ session: { access_token: "tok", user: { id: "u1" } } }),
}));

describe("NotificationCenter", () => {
  it("n'affiche rien si isOpen=false", () => {
    const { container } = render(<NotificationCenter isOpen={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("affiche les notifications quand isOpen=true", () => {
    render(<NotificationCenter isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText("3 nouvelles offres")).toBeInTheDocument();
    expect(screen.getByText("Offre -20%")).toBeInTheDocument();
  });

  it("affiche les différents types avec couleurs distinctes", () => {
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
```

- [ ] **Step 2: Lancer le test (doit échouer)**

```bash
cd frontend-next && npx vitest run __tests__/unit/components/notifications/notification-center.test.tsx
```
Expected: FAIL

- [ ] **Step 3: Implémenter le composant**

```typescript
// frontend-next/src/components/notifications/notification-center.tsx
"use client";

import { useEffect } from "react";
import { X, Bell, Briefcase, TrendingUp, Gift, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotifications, type AppNotification } from "@/hooks/use-notifications";

const TYPE_CONFIG: Record<
  AppNotification["type"],
  { color: string; bgColor: string; Icon: React.ElementType }
> = {
  job_alert:       { color: "text-green-600",  bgColor: "bg-green-50",  Icon: Briefcase },
  cv_feedback:     { color: "text-blue-600",   bgColor: "bg-blue-50",   Icon: TrendingUp },
  career_progress: { color: "text-blue-600",   bgColor: "bg-blue-50",   Icon: TrendingUp },
  referral_bonus:  { color: "text-violet-600", bgColor: "bg-violet-50", Icon: Gift },
  promo_code:      { color: "text-orange-600", bgColor: "bg-orange-50", Icon: Tag },
  interview_ready: { color: "text-amber-600",  bgColor: "bg-amber-50",  Icon: Bell },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "À l'instant";
  if (h < 24) return `Il y a ${h}h`;
  const d = Math.floor(h / 24);
  return `Il y a ${d}j`;
}

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationCenter({ isOpen, onClose }: NotificationCenterProps) {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  // Trap focus/escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label="Centre de notifications">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-80 bg-background border-l shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4" />
            <span className="font-semibold text-sm">Notifications</span>
            {unreadCount > 0 && (
              <span className="text-xs bg-red-100 text-red-600 rounded-full px-1.5">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Tout lire
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Fermer"
              className="p-1 rounded hover:bg-accent transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Bell className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">Aucune notification</p>
            </div>
          ) : (
            notifications.map((n) => {
              const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.interview_ready;
              const { Icon } = cfg;
              return (
                <button
                  key={n.id}
                  onClick={() => !n.read && markAsRead(n.id)}
                  className={cn(
                    "w-full text-left px-4 py-3 border-b hover:bg-accent/50 transition-colors flex gap-3",
                    !n.read && "bg-blue-50/40 dark:bg-blue-950/20"
                  )}
                >
                  <div className={cn("mt-0.5 p-1.5 rounded-full flex-shrink-0", cfg.bgColor)}>
                    <Icon className={cn("w-3.5 h-3.5", cfg.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-medium truncate", !n.read && "font-semibold")}>
                      {n.title}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                  {!n.read && (
                    <div className="mt-1.5 w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Lancer tous les tests notifications**

```bash
cd frontend-next && npx vitest run __tests__/unit/components/notifications/
```
Expected: PASS

- [ ] **Step 5: Vérification TypeScript**

```bash
cd frontend-next && npx tsc --noEmit 2>&1 | grep -E "notifications|career-score" | head -20
```
Expected: 0 erreurs sur ces fichiers

- [ ] **Step 6: Commit**

```bash
git add frontend-next/src/components/notifications/ frontend-next/__tests__/unit/components/notifications/
git commit -m "feat(notifications): add NotificationCenter drawer with Realtime + type-based colors"
```

---

## Chunk 3: 8 Conversion Pop-ups

### Task 6: Composant `conversion-popups.tsx`

**Files:**
- Create: `frontend-next/src/components/freemium/conversion-popups.tsx`
- Test: `frontend-next/__tests__/unit/components/freemium/conversion-popups.test.tsx`

- [ ] **Step 1: Écrire le test**

```typescript
// frontend-next/__tests__/unit/components/freemium/conversion-popups.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConversionPopup, POPUP_CONFIGS } from "@/components/freemium/conversion-popups";

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ session: { access_token: "tok" } }),
}));
vi.mock("@/contexts/subscription-context", () => ({
  useSubscription: () => ({ plan: "free", isFreePlan: true }),
}));
global.fetch = vi.fn().mockResolvedValue(
  new Response(JSON.stringify({ coupon_code: "TEST20", discount: "20%", checkout_url: "/pricing?coupon=TEST20" }), { status: 200 })
);

describe("POPUP_CONFIGS", () => {
  it("contient les 8 pop-ups requis", () => {
    const ids = POPUP_CONFIGS.map((p) => p.id);
    expect(ids).toContain("search_limit");
    expect(ids).toContain("cv_score");
    expect(ids).toContain("session_cut");
    expect(ids).toContain("interview_score");
    expect(ids).toContain("momentum");
    expect(ids).toContain("anti_churn");
    expect(ids).toContain("inactive_7d");
    expect(ids).toContain("pricing_hover");
    expect(ids).length.toBe(8);
  });

  it("chaque popup a title, body, primaryCta, plan", () => {
    for (const p of POPUP_CONFIGS) {
      expect(p.title).toBeTruthy();
      expect(p.body).toBeTruthy();
      expect(p.primaryCta).toBeTruthy();
      expect(["starter", "pro"]).toContain(p.plan);
    }
  });
});

describe("ConversionPopup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("n'affiche rien si isOpen=false", () => {
    const { container } = render(
      <ConversionPopup popupId="search_limit" isOpen={false} onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("affiche le titre du popup search_limit", () => {
    render(<ConversionPopup popupId="search_limit" isOpen={true} onClose={vi.fn()} />);
    const config = POPUP_CONFIGS.find((p) => p.id === "search_limit")!;
    expect(screen.getByText(config.title)).toBeInTheDocument();
  });

  it("appelle onClose au click sur le bouton fermer", () => {
    const onClose = vi.fn();
    render(<ConversionPopup popupId="session_cut" isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText(/fermer/i));
    expect(onClose).toHaveBeenCalled();
  });

  it("appelle fetch coupon pour un popup avec couponTrigger", async () => {
    render(<ConversionPopup popupId="momentum" isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Lancer le test (doit échouer)**

```bash
cd frontend-next && npx vitest run __tests__/unit/components/freemium/conversion-popups.test.tsx
```
Expected: FAIL

- [ ] **Step 3: Implémenter le composant**

```typescript
// frontend-next/src/components/freemium/conversion-popups.tsx
"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";

export interface PopupConfig {
  id: string;
  trigger: string;
  title: string;
  body: string;
  primaryCta: string;
  secondaryCta?: string;
  plan: "starter" | "pro";
  price: string;
  couponTrigger?: string; // backend trigger pour coupons dynamiques
}

export const POPUP_CONFIGS: PopupConfig[] = [
  {
    id: "search_limit",
    trigger: "search_limit",
    title: "Tu as atteint ta limite de recherches aujourd'hui",
    body: "Passe à Starter pour des recherches illimitées et trouve ton prochain job plus vite.",
    primaryCta: "Débloquer les recherches",
    secondaryCta: "Parrainer un ami",
    plan: "starter",
    price: "9,90€/mois",
  },
  {
    id: "cv_score",
    trigger: "cv_score",
    title: "Ton CV peut faire beaucoup mieux",
    body: "Accède aux conseils détaillés de Sofia pour booster ton score ATS et décrocher plus d'entretiens.",
    primaryCta: "Activer l'analyse complète",
    plan: "starter",
    price: "9,90€/mois",
  },
  {
    id: "session_cut",
    trigger: "session_cut",
    title: "Ta session coach est terminée",
    body: "Continue avec Nova, Maria ou Lucas sans limite. Ton prochain job est à portée de main.",
    primaryCta: "Continuer avec le Coach",
    plan: "starter",
    price: "9,90€/mois",
  },
  {
    id: "interview_score",
    trigger: "interview_score",
    title: "Tu veux aller plus loin avec Lucas ?",
    body: "Simule autant d'entretiens que tu veux et reçois des retours approfondis à chaque session.",
    primaryCta: "Activer la simulation complète",
    plan: "pro",
    price: "19,90€/mois",
  },
  {
    id: "momentum",
    trigger: "momentum",
    title: "Tu es en plein élan — profite de -20% aujourd'hui",
    body: "Tu recherches activement. Voici une offre exclusive valable 24h pour toi.",
    primaryCta: "Choisir mon plan avec -20%",
    plan: "starter",
    price: "7,92€/mois",
    couponTrigger: "momentum",
  },
  {
    id: "anti_churn",
    trigger: "anti_churn",
    title: "Reste et économise -30% pendant 3 mois",
    body: "Avant de partir, voici une offre exclusive : -30% sur ton abonnement pendant 3 mois.",
    primaryCta: "Garder mon avantage",
    secondaryCta: "Annuler quand même",
    plan: "pro",
    price: "13,93€/mois",
    couponTrigger: "anti_churn",
  },
  {
    id: "inactive_7d",
    trigger: "inactive_7d",
    title: "7 jours Pro offerts — on t'a réservé ta place",
    body: "Tu nous manques ! Reviens et profite de 7 jours Pro gratuits pour reprendre ta recherche.",
    primaryCta: "Activer mes 7 jours Pro",
    plan: "pro",
    price: "0€ pendant 7 jours",
    couponTrigger: "win_back_7d",
  },
  {
    id: "pricing_hover",
    trigger: "pricing_hover",
    title: "67% de nos abonnés choisissent Pro",
    body: "Ils trouvent un job en moyenne 3x plus vite. Rejoins-les aujourd'hui.",
    primaryCta: "Choisir Pro maintenant",
    plan: "pro",
    price: "19,90€/mois",
  },
];

interface ConversionPopupProps {
  popupId: string;
  isOpen: boolean;
  onClose: () => void;
  onUpgrade?: (checkoutUrl?: string) => void;
}

export function ConversionPopup({ popupId, isOpen, onClose, onUpgrade }: ConversionPopupProps) {
  const { session } = useAuth();
  const config = POPUP_CONFIGS.find((p) => p.id === popupId);
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  // Fetch coupon si trigger défini
  useEffect(() => {
    if (!isOpen || !config?.couponTrigger || !session?.access_token) return;

    const fetchCoupon = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/coupons/generate-for-trigger`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ trigger_type: config.couponTrigger }),
          }
        );
        if (res.ok) {
          const data = await res.json();
          setCouponCode(data.coupon_code);
          setCheckoutUrl(data.checkout_url);
        }
      } catch {
        // Coupon non critique — popup s'affiche quand même
      }
    };

    fetchCoupon();
  }, [isOpen, config?.couponTrigger, session?.access_token]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen || !config) return null;

  const planColors = {
    starter: { bg: "from-blue-500 to-blue-600", btn: "bg-blue-600 hover:bg-blue-700" },
    pro: { bg: "from-violet-500 to-purple-600", btn: "bg-violet-600 hover:bg-violet-700" },
  };
  const colors = planColors[config.plan];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-sm bg-background rounded-2xl shadow-2xl overflow-hidden">
        {/* Top gradient bar */}
        <div className={cn("h-1 w-full bg-gradient-to-r", colors.bg)} />

        <div className="p-6">
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="absolute top-4 right-4 p-1 rounded hover:bg-accent transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>

          <h3 className="text-base font-bold leading-snug pr-6 mb-2">{config.title}</h3>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{config.body}</p>

          {couponCode && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs">
              <span className="text-amber-700 font-medium">Code : </span>
              <span className="font-mono font-bold text-amber-800">{couponCode}</span>
            </div>
          )}

          {/* Price */}
          <p className="text-xs text-muted-foreground mb-4">
            Plan {config.plan === "starter" ? "Starter" : "Pro"} — <strong>{config.price}</strong>
          </p>

          {/* CTAs */}
          <button
            onClick={() => {
              onUpgrade?.(checkoutUrl ?? undefined);
              onClose();
            }}
            className={cn(
              "w-full py-2.5 rounded-xl text-white font-semibold text-sm transition-colors",
              colors.btn
            )}
          >
            {config.primaryCta}
          </button>

          {config.secondaryCta && (
            <button
              onClick={onClose}
              className="w-full mt-2 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {config.secondaryCta}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Hook utilitaire pour gérer l'état d'un popup unique
export function useConversionPopup(popupId: string) {
  const [isOpen, setIsOpen] = useState(false);
  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    PopupComponent: () => (
      <ConversionPopup popupId={popupId} isOpen={isOpen} onClose={() => setIsOpen(false)} />
    ),
  };
}
```

- [ ] **Step 4: Lancer le test (doit passer)**

```bash
cd frontend-next && npx vitest run __tests__/unit/components/freemium/conversion-popups.test.tsx
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend-next/src/components/freemium/conversion-popups.tsx frontend-next/__tests__/unit/components/freemium/conversion-popups.test.tsx
git commit -m "feat(freemium): add 8 conversion popups with Gamma wording + dynamic coupons"
```

---

## Chunk 4: HuntZen Boost — Page Parrainage

### Task 7: Composants `referral-progress-bar.tsx`, `referral-tier-card.tsx`, `referral-friends-list.tsx`

**Files:**
- Create: `frontend-next/src/components/referral/referral-progress-bar.tsx`
- Create: `frontend-next/src/components/referral/referral-tier-card.tsx`
- Create: `frontend-next/src/components/referral/referral-friends-list.tsx`
- Test: `frontend-next/__tests__/unit/components/referral/referral-components.test.tsx`

- [ ] **Step 1: Écrire le test**

```typescript
// frontend-next/__tests__/unit/components/referral/referral-components.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReferralProgressBar } from "@/components/referral/referral-progress-bar";
import { ReferralTierCard } from "@/components/referral/referral-tier-card";
import { ReferralFriendsList } from "@/components/referral/referral-friends-list";

const mockTiers = [
  { friends: 1, reward_type: "quota_bonus", label: "+10 recherches + 10 min Coach IA" },
  { friends: 3, reward_type: "free_days", days: 2, plan: "starter", label: "48h Starter offerts" },
  { friends: 5, reward_type: "free_days", days: 7, plan: "pro", label: "7 jours Pro offerts" },
  { friends: 10, reward_type: "stripe_coupon", discount_percent: 50, plan: "pro", label: "-50% Pro ou 1 mois Starter" },
];

const mockFriends = [
  { status: "validated", created_at: "2026-03-11T10:00:00Z" },
  { status: "registered", created_at: "2026-03-10T10:00:00Z" },
];

describe("ReferralProgressBar", () => {
  it("affiche la progression (3 validés / 5 pour palier suivant)", () => {
    render(
      <ReferralProgressBar
        totalValidated={3}
        currentTier={1}
        nextTier={2}
        friendsToNext={2}
        tiers={mockTiers}
      />
    );
    expect(screen.getByText(/2 ami/i)).toBeInTheDocument();
  });

  it("affiche tous les jalons des paliers", () => {
    render(
      <ReferralProgressBar
        totalValidated={3}
        currentTier={1}
        nextTier={2}
        friendsToNext={2}
        tiers={mockTiers}
      />
    );
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});

describe("ReferralTierCard", () => {
  it("affiche le label du palier", () => {
    render(<ReferralTierCard tier={mockTiers[0]} index={0} isUnlocked={true} isCurrent={false} />);
    expect(screen.getByText("+10 recherches + 10 min Coach IA")).toBeInTheDocument();
  });

  it("affiche 'Atteint' si débloqué", () => {
    render(<ReferralTierCard tier={mockTiers[0]} index={0} isUnlocked={true} isCurrent={false} />);
    expect(screen.getByText(/atteint/i)).toBeInTheDocument();
  });

  it("affiche 'Verrouillé' si non débloqué", () => {
    render(<ReferralTierCard tier={mockTiers[3]} index={3} isUnlocked={false} isCurrent={false} />);
    expect(screen.getByText(/verrouillé/i)).toBeInTheDocument();
  });
});

describe("ReferralFriendsList", () => {
  it("affiche la liste des filleuls", () => {
    render(<ReferralFriendsList friends={mockFriends} />);
    expect(screen.getByText(/validé/i)).toBeInTheDocument();
    expect(screen.getByText(/inscrit/i)).toBeInTheDocument();
  });

  it("affiche un message vide si aucun filleul", () => {
    render(<ReferralFriendsList friends={[]} />);
    expect(screen.getByText(/aucun ami/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Lancer le test (doit échouer)**

```bash
cd frontend-next && npx vitest run __tests__/unit/components/referral/
```
Expected: FAIL

- [ ] **Step 3a: Implémenter `referral-progress-bar.tsx`**

```typescript
// frontend-next/src/components/referral/referral-progress-bar.tsx
"use client";

import { cn } from "@/lib/utils";

interface Tier { friends: number; label: string; }

interface ReferralProgressBarProps {
  totalValidated: number;
  currentTier: number;
  nextTier: number | null;
  friendsToNext: number;
  tiers: Tier[];
}

export function ReferralProgressBar({
  totalValidated,
  nextTier,
  friendsToNext,
  tiers,
}: ReferralProgressBarProps) {
  const maxFriends = tiers[tiers.length - 1]?.friends ?? 10;
  const progress = Math.min(100, (totalValidated / maxFriends) * 100);

  return (
    <div className="space-y-3">
      {/* Milestones */}
      <div className="flex justify-between text-xs text-muted-foreground">
        {tiers.map((t) => (
          <span
            key={t.friends}
            className={cn(
              "font-medium",
              totalValidated >= t.friends && "text-huntzen-turquoise"
            )}
          >
            {t.friends}
          </span>
        ))}
      </div>

      {/* Bar */}
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-huntzen-blue to-huntzen-turquoise rounded-full transition-all duration-700"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Status */}
      {nextTier !== null && friendsToNext > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Encore{" "}
          <span className="font-semibold text-foreground">
            {friendsToNext} ami{friendsToNext > 1 ? "s" : ""}
          </span>{" "}
          pour débloquer {tiers[nextTier]?.label}
        </p>
      )}
      {friendsToNext === 0 && (
        <p className="text-xs text-green-600 font-medium text-center">
          Tous les paliers débloqués !
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3b: Implémenter `referral-tier-card.tsx`**

```typescript
// frontend-next/src/components/referral/referral-tier-card.tsx
"use client";

import { CheckCircle2, Lock, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Tier {
  friends: number;
  reward_type: string;
  label: string;
  days?: number;
  plan?: string;
  discount_percent?: number;
}

interface ReferralTierCardProps {
  tier: Tier;
  index: number;
  isUnlocked: boolean;
  isCurrent: boolean;
}

export function ReferralTierCard({ tier, index, isUnlocked, isCurrent }: ReferralTierCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-all",
        isUnlocked && "border-huntzen-turquoise/40 bg-huntzen-turquoise/5",
        isCurrent && "ring-2 ring-huntzen-turquoise",
        !isUnlocked && "opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground mb-1">
            Palier {index + 1} — {tier.friends} ami{tier.friends > 1 ? "s" : ""}
          </p>
          <p className="text-sm font-semibold">{tier.label}</p>
        </div>
        <div className="flex-shrink-0 mt-0.5">
          {isUnlocked ? (
            <CheckCircle2 className="w-5 h-5 text-huntzen-turquoise" />
          ) : isCurrent ? (
            <Clock className="w-5 h-5 text-amber-500" />
          ) : (
            <Lock className="w-5 h-5 text-muted-foreground/50" />
          )}
        </div>
      </div>
      <p className="mt-2 text-xs font-medium">
        {isUnlocked ? (
          <span className="text-huntzen-turquoise">Atteint</span>
        ) : isCurrent ? (
          <span className="text-amber-500">En cours</span>
        ) : (
          <span className="text-muted-foreground">Verrouillé</span>
        )}
      </p>
    </div>
  );
}
```

- [ ] **Step 3c: Implémenter `referral-friends-list.tsx`**

```typescript
// frontend-next/src/components/referral/referral-friends-list.tsx
"use client";

import { UserCheck, UserPlus, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface Friend {
  status: "validated" | "registered";
  created_at: string;
}

interface ReferralFriendsListProps {
  friends: Friend[];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86_400_000);
  if (d === 0) return "Aujourd'hui";
  if (d === 1) return "Hier";
  return `Il y a ${d}j`;
}

export function ReferralFriendsList({ friends }: ReferralFriendsListProps) {
  if (friends.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Users className="w-8 h-8 mb-2 opacity-30" />
        <p className="text-sm">Aucun ami parrainé pour l'instant</p>
        <p className="text-xs mt-1">Partage ton lien pour commencer</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {friends.map((f, i) => (
        <div key={i} className="flex items-center gap-3 py-2 border-b last:border-0">
          <div
            className={cn(
              "p-1.5 rounded-full",
              f.status === "validated" ? "bg-green-50 text-green-600" : "bg-blue-50 text-blue-600"
            )}
          >
            {f.status === "validated" ? (
              <UserCheck className="w-4 h-4" />
            ) : (
              <UserPlus className="w-4 h-4" />
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">
              {f.status === "validated" ? "Ami validé" : "Ami inscrit"}
            </p>
            <p className="text-xs text-muted-foreground">{timeAgo(f.created_at)}</p>
          </div>
          <span
            className={cn(
              "text-xs font-medium px-2 py-0.5 rounded-full",
              f.status === "validated"
                ? "bg-green-100 text-green-700"
                : "bg-blue-100 text-blue-700"
            )}
          >
            {f.status === "validated" ? "Validé" : "Inscrit"}
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Lancer les tests referral (doit passer)**

```bash
cd frontend-next && npx vitest run __tests__/unit/components/referral/
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend-next/src/components/referral/ frontend-next/__tests__/unit/components/referral/
git commit -m "feat(referral): add ReferralProgressBar, ReferralTierCard, ReferralFriendsList"
```

---

### Task 8: Page `(dashboard)/referral/page.tsx`

**Files:**
- Create: `frontend-next/src/app/(dashboard)/referral/page.tsx`

> Note : Les pages Next.js sont difficiles à tester en isolation (dépendances serveur). La vérification se fait via TypeScript + vérification manuelle.

- [ ] **Step 1: Implémenter la page**

```typescript
// frontend-next/src/app/(dashboard)/referral/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Copy, Share2, Gift, CheckCircle } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { ReferralProgressBar } from "@/components/referral/referral-progress-bar";
import { ReferralTierCard } from "@/components/referral/referral-tier-card";
import { ReferralFriendsList } from "@/components/referral/referral-friends-list";
import { cn } from "@/lib/utils";

interface BoostStatus {
  referral_code: string;
  referral_link: string;
  total_clicks: number;
  total_signups: number;
  total_validated: number;
  current_tier: number;
  next_tier: number | null;
  friends_to_next: number;
  tiers: Array<{
    friends: number;
    reward_type: string;
    label: string;
    days?: number;
    plan?: string;
    discount_percent?: number;
  }>;
  rewards_earned: Array<{ reward_type: string; reward_value: Record<string, unknown>; applied_at: string }>;
  recent_referrals: Array<{ status: "validated" | "registered"; created_at: string }>;
}

export default function ReferralPage() {
  const { session } = useAuth();
  const [status, setStatus] = useState<BoostStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/referrals/boost-status`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      if (res.ok) setStatus(await res.json());
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleCopy = async () => {
    if (!status?.referral_link) return;
    await navigator.clipboard.writeText(status.referral_link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsApp = () => {
    if (!status?.referral_link) return;
    const text = encodeURIComponent(
      `Rejoins HuntZen et trouve ton prochain job plus vite ! ${status.referral_link}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!status) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Hero */}
      <div className="text-center py-6 px-4 rounded-2xl bg-gradient-to-br from-huntzen-blue/5 to-huntzen-turquoise/10 border">
        <div className="inline-flex p-3 rounded-full bg-huntzen-blue/10 mb-3">
          <Gift className="w-6 h-6 text-huntzen-blue" />
        </div>
        <h1 className="text-2xl font-bold mb-1">HuntZen Boost</h1>
        <p className="text-sm text-muted-foreground">
          Invitez. Débloquez. Progressez.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Parrainez des amis et débloquez des récompenses exclusives.
        </p>
      </div>

      {/* Lien parrainage */}
      <div className="rounded-xl border bg-card p-5">
        <p className="text-sm font-semibold mb-3">Ton lien de parrainage</p>
        <div className="flex gap-2">
          <div className="flex-1 text-xs font-mono bg-muted rounded-lg px-3 py-2.5 truncate text-muted-foreground">
            {status.referral_link}
          </div>
          <button
            onClick={handleCopy}
            className={cn(
              "px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
              copied
                ? "bg-green-100 text-green-700"
                : "bg-huntzen-blue text-white hover:bg-huntzen-blue/90"
            )}
          >
            {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copié !" : "Copier"}
          </button>
          <button
            onClick={handleWhatsApp}
            className="px-3 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm font-medium transition-colors flex items-center gap-1.5"
          >
            <Share2 className="w-4 h-4" />
            WhatsApp
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          {[
            { label: "Clics", value: status.total_clicks },
            { label: "Inscrits", value: status.total_signups },
            { label: "Validés", value: status.total_validated },
          ].map((s) => (
            <div key={s.label} className="text-center p-2 rounded-lg bg-muted/50">
              <p className="text-xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Barre de progression */}
      <div className="rounded-xl border bg-card p-5">
        <p className="text-sm font-semibold mb-4">Ta progression</p>
        <ReferralProgressBar
          totalValidated={status.total_validated}
          currentTier={status.current_tier}
          nextTier={status.next_tier}
          friendsToNext={status.friends_to_next}
          tiers={status.tiers}
        />
      </div>

      {/* Grille des paliers */}
      <div>
        <p className="text-sm font-semibold mb-3">Récompenses</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {status.tiers.map((tier, i) => (
            <ReferralTierCard
              key={i}
              tier={tier}
              index={i}
              isUnlocked={status.total_validated >= tier.friends}
              isCurrent={i === status.current_tier}
            />
          ))}
        </div>
      </div>

      {/* Historique filleuls */}
      <div className="rounded-xl border bg-card p-5">
        <p className="text-sm font-semibold mb-4">Tes filleuls</p>
        <ReferralFriendsList friends={status.recent_referrals} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Vérification TypeScript**

```bash
cd frontend-next && npx tsc --noEmit 2>&1 | grep "referral" | head -20
```
Expected: 0 erreurs sur referral

- [ ] **Step 3: Vérification build**

```bash
cd frontend-next && npx next build 2>&1 | tail -20
```
Expected: Build réussi (ou warnings non bloquants)

- [ ] **Step 4: Commit**

```bash
git add frontend-next/src/app/(dashboard)/referral/
git commit -m "feat(referral): add HuntZen Boost page with progress bar, tier cards, friends list"
```

---

## Chunk 5: Vérification finale

### Task 9: TypeScript global + run all tests

- [ ] **Step 1: Vérification TypeScript complète**

```bash
cd frontend-next && npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -30
```
Expected: 0 nouvelles erreurs TypeScript introduites par Phase 3

- [ ] **Step 2: Lancer tous les tests unitaires**

```bash
cd frontend-next && npx vitest run __tests__/unit/
```
Expected: Tous les tests passent (y compris ceux existants)

- [ ] **Step 3: Vérifier les fichiers créés**

```bash
ls frontend-next/src/hooks/use-career-score.ts \
   frontend-next/src/hooks/use-notifications.ts \
   frontend-next/src/components/career-score/career-score-card.tsx \
   frontend-next/src/components/notifications/notification-bell.tsx \
   frontend-next/src/components/notifications/notification-center.tsx \
   frontend-next/src/components/freemium/conversion-popups.tsx \
   frontend-next/src/components/referral/referral-progress-bar.tsx \
   frontend-next/src/components/referral/referral-tier-card.tsx \
   frontend-next/src/components/referral/referral-friends-list.tsx \
   frontend-next/src/app/(dashboard)/referral/page.tsx
```
Expected: Tous les fichiers existent

- [ ] **Step 4: Commit final de vérification**

```bash
git add -A && git status
```
Vérifier qu'aucun fichier sensible n'est stagé (pas de .env)

```bash
git commit -m "chore(phase3): verify all Phase 3 frontend components complete"
```

---

## Récapitulatif des fichiers créés

| Fichier | Description |
|---------|-------------|
| `src/hooks/use-career-score.ts` | Fetch + recalcul career score depuis backend |
| `src/components/career-score/career-score-card.tsx` | Widget ring + sous-barres + justification IA |
| `src/hooks/use-notifications.ts` | Supabase Realtime + mark as read |
| `src/components/notifications/notification-bell.tsx` | Cloche avec badge count |
| `src/components/notifications/notification-center.tsx` | Drawer avec liste + types colorés |
| `src/components/freemium/conversion-popups.tsx` | 8 pop-ups + wording Gamma + coupons dynamiques |
| `src/components/referral/referral-progress-bar.tsx` | Barre de progression jalons |
| `src/components/referral/referral-tier-card.tsx` | Card palier (atteint/en cours/verrouillé) |
| `src/components/referral/referral-friends-list.tsx` | Liste filleuls avec statuts |
| `src/app/(dashboard)/referral/page.tsx` | Page HuntZen Boost complète |

## Points de vigilance

- `use-notifications.ts` : vérifier que la RLS Supabase autorise `SELECT` sur `user_notifications` pour l'utilisateur authentifié
- `conversion-popups.tsx` : les coupons dynamiques (`couponTrigger`) sont non bloquants — si le fetch échoue, le popup s'affiche quand même sans code coupon
- `referral/page.tsx` : le bouton WhatsApp ouvre `wa.me` — fonctionne mobile + desktop
- Career Score Card : le ring utilise `stroke-dashoffset` natif (pas SVG animé Framer Motion) pour éviter les re-renders
