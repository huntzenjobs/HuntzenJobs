"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "";
const HEARTBEAT_INTERVAL_MS = 45_000;
const HEARTBEAT_JITTER_MS = 10_000;
const VISIBILITY_COOLDOWN_MS = 30_000;

export function usePresence(page: string, feature?: string) {
  const inFlightRef = useRef<Promise<void> | null>(null);
  const lastHeartbeatStartedAtRef = useRef(0);

  useEffect(() => {
    function sendHeartbeat(): Promise<void> {
      if (document.visibilityState !== "visible") return Promise.resolve();
      if (inFlightRef.current) return inFlightRef.current;

      lastHeartbeatStartedAtRef.current = Date.now();
      const request = (async () => {
        try {
          const supabase = createClient();
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (!session?.access_token) return;
          await fetch(`${BACKEND_URL}/api/presence/heartbeat`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ page, feature: feature ?? null }),
          });
        } catch {}
      })();
      inFlightRef.current = request;
      void request.then(() => {
        if (inFlightRef.current === request) inFlightRef.current = null;
      });
      return request;
    }

    function sendHeartbeatIfStale() {
      if (document.visibilityState !== "visible") return;
      if (
        Date.now() - lastHeartbeatStartedAtRef.current <
        VISIBILITY_COOLDOWN_MS
      ) {
        return;
      }
      void sendHeartbeat();
    }

    void sendHeartbeat();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleHeartbeat = () => {
      const delay =
        HEARTBEAT_INTERVAL_MS +
        Math.floor(Math.random() * HEARTBEAT_JITTER_MS);
      timer = setTimeout(() => {
        sendHeartbeatIfStale();
        scheduleHeartbeat();
      }, delay);
    };
    scheduleHeartbeat();
    document.addEventListener("visibilitychange", sendHeartbeatIfStale);
    window.addEventListener("focus", sendHeartbeatIfStale);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", sendHeartbeatIfStale);
      window.removeEventListener("focus", sendHeartbeatIfStale);
    };
  }, [page, feature]);
}
