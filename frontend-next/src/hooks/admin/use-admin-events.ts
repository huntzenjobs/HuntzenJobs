"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface UserEvent {
  id: string;
  created_at: string;
  user_id: string | null;
  event_name: string;
  event_label: string | null;
  category: string;
  feature: string | null;
  severity: "info" | "success" | "warning" | "error";
  properties: Record<string, unknown>;
  error_code: string | null;
}

const MAX_EVENTS = 50;

export function useAdminEvents() {
  const [events, setEvents] = useState<UserEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    const channelName = `admin-user-events-${Math.random()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "user_events" },
        (payload) => {
          const newEvent = payload.new as UserEvent;
          setEvents((prev) => [newEvent, ...prev].slice(0, MAX_EVENTS));
        }
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    return () => { supabase.removeChannel(channel); };
  }, []);

  return { events, connected };
}
