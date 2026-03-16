"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "";

export interface PresenceSnapshot {
  total: number;
  by_page: Record<string, number>;
  by_feature: Record<string, number>;
}

export function useAdminLive() {
  const [presence, setPresence] = useState<PresenceSnapshot>({ total: 0, by_page: {}, by_feature: {} });
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let es: EventSource | null = null;

    async function connect() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        // SSE ne supporte pas les headers → token en query param
        const url = `${BACKEND_URL}/api/presence/admin/live?token=${encodeURIComponent(session.access_token)}`;
        es = new EventSource(url);

        es.onopen = () => setConnected(true);
        es.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.type === "snapshot") setPresence(data.presence);
          } catch {}
        };
        es.onerror = () => setConnected(false);
      } catch {}
    }

    connect();
    return () => { es?.close(); setConnected(false); };
  }, []);

  return { presence, connected };
}
