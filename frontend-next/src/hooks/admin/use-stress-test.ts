"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "";

export interface StressMetricSnapshot {
  ts: number;
  elapsed_sec: number;
  req_per_sec: number;
  active_users: number;
  latency: { p50: number; p95: number; p99: number; max: number };
  error_rate: number;
  features: Record<string, { active: number; req_s: number; errors: number }>;
  infra: { arq_queue_depth: number };
}

export interface StressRun {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  config: {
    concurrency: number;
    duration_sec: number;
    ramp_up_sec: number;
    features: string[];
  };
  total_requests: number;
  successful: number;
  failed: number;
  avg_response_ms: number | null;
  p95_response_ms: number | null;
  p99_response_ms: number | null;
  max_response_ms: number | null;
  metrics_timeseries: StressMetricSnapshot[] | null;
  created_at: string;
  completed_at: string | null;
}

export function useStressTest(runId: string | null) {
  const [metrics, setMetrics] = useState<StressMetricSnapshot[]>([]);
  const [status, setStatus] = useState<StressRun["status"] | null>(null);
  const [connected, setConnected] = useState(false);

  const retryCount = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout>>();
  const destroyed = useRef(false);
  const esRef = useRef<EventSource | null>(null);

  const connect = useCallback(async () => {
    if (!runId || destroyed.current) return;

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token || destroyed.current) return;

    const url = `${BACKEND_URL}/api/admin/stress/stream/${runId}?token=${encodeURIComponent(session.access_token)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      retryCount.current = 0;
      setConnected(true);
    };

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "done") {
          setStatus(data.status);
          setConnected(false);
          es.close();
          return;
        }
        setStatus("running");
        setMetrics((prev) => {
          const next = [...prev, data];
          return next.slice(-120); // garder max 60s de données (120 ticks × 500ms)
        });
      } catch {}
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      esRef.current = null;
      if (destroyed.current) return;
      const delay = Math.min(1000 * 2 ** retryCount.current, 30_000);
      retryCount.current += 1;
      retryTimer.current = setTimeout(connect, delay);
    };
  }, [runId]);

  useEffect(() => {
    if (!runId) return;
    destroyed.current = false;
    setMetrics([]);
    setStatus("pending");
    connect();
    return () => {
      destroyed.current = true;
      clearTimeout(retryTimer.current);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [runId, connect]);

  return { metrics, status, connected };
}
