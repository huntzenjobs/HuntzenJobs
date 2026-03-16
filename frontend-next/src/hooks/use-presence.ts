"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "";

export function usePresence(page: string, feature?: string) {
  useEffect(() => {
    let userId: string | undefined;

    async function sendHeartbeat() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        userId = session.user.id;
        await fetch(`${BACKEND_URL}/api/presence/heartbeat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ page, feature: feature ?? null }),
        });
      } catch {}
    }

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 30_000);
    return () => clearInterval(interval);
  }, [page, feature]);
}
