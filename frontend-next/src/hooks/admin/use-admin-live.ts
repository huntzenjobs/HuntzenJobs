"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "";

export interface PresenceSnapshot {
  total: number;
  by_page: Record<string, number>;
  by_feature: Record<string, number>;
}

export function useAdminLive() {
  const [presence, setPresence] = useState<PresenceSnapshot>({
    total: 0,
    by_page: {},
    by_feature: {},
  });
  const [connected, setConnected] = useState(false);

  const retryCount = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout>>();
  const destroyed = useRef(false);
  const esRef = useRef<EventSource | null>(null);

  const connect = useCallback(async () => {
    if (destroyed.current) return;

    // Re-fetch token à chaque tentative (évite les closures sur token expiré)
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token || destroyed.current) return;

    const url = `${BACKEND_URL}/api/presence/admin/live?token=${encodeURIComponent(session.access_token)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      retryCount.current = 0;
      setConnected(true);
    };

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "snapshot") setPresence(data.presence);
      } catch {}
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      esRef.current = null;
      if (destroyed.current) return;
      // Backoff exponentiel : 1s → 2s → 4s → 8s → 16s → 30s (plafond)
      const delay = Math.min(1000 * 2 ** retryCount.current, 30_000);
      retryCount.current += 1;
      retryTimer.current = setTimeout(connect, delay);
    };
  }, []);

  useEffect(() => {
    destroyed.current = false;
    connect();
    return () => {
      destroyed.current = true;
      clearTimeout(retryTimer.current);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [connect]);

  return { presence, connected };
}
