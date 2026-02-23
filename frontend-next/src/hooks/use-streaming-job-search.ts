"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { type Job } from "@/lib/api/huntzen-client";

const LOCK_SIZE = 3; // First N jobs shown immediately, never reordered

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

export interface StreamSearchParams {
  query: string;
  country: string;
  city?: string;
  contract?: string;
  limit?: number;
  radius?: number;
  includeRemote?: boolean;
}

interface StreamingState {
  lockedJobs: Job[];         // First LOCK_SIZE — displayed immediately, never reordered
  rankedJobs: Job[];         // Remaining — replaces skeletons after AI ranking
  isLoading: boolean;        // Providers still running
  isRankingPending: boolean; // All providers done, ranking in progress → show skeletons
  isDone: boolean;
  error: string | null;
  refinedQuery: string | null;
  searchTimeMs: number | null;
}

const INITIAL_STATE: StreamingState = {
  lockedJobs: [],
  rankedJobs: [],
  isLoading: false,
  isRankingPending: false,
  isDone: false,
  error: null,
  refinedQuery: null,
  searchTimeMs: null,
};

export function useStreamingJobSearch() {
  const [state, setState] = useState<StreamingState>(INITIAL_STATE);
  const esRef = useRef<EventSource | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  // Buffer for jobs arriving after lock is full (before ranked event)
  const pendingJobsRef = useRef<Job[]>([]);

  const search = useCallback((params: StreamSearchParams) => {
    // Close any existing connection
    esRef.current?.close();
    esRef.current = null;
    seenIdsRef.current = new Set();
    pendingJobsRef.current = [];
    setState({ ...INITIAL_STATE, isLoading: true });

    const qs = new URLSearchParams({
      q: params.query,
      country: params.country,
      city: params.city ?? "",
      contract: params.contract ?? "",
      limit: String(params.limit ?? 50),
      include_remote: String(params.includeRemote ?? true),
    });
    if (params.radius) qs.set("radius", String(params.radius));

    const url = `${BACKEND_URL}/api/jobs/search/stream?${qs}`;
    const es = new EventSource(url);
    esRef.current = es;

    // ── event:query — refined search query ──────────────────────────────────
    es.addEventListener("query", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setState((prev) => ({ ...prev, refinedQuery: data.refined_query ?? null }));
    });

    // ── event:jobs — batch from one provider ────────────────────────────────
    es.addEventListener("jobs", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      const incoming: Job[] = (data.jobs ?? []).filter((j: Job) => {
        if (seenIdsRef.current.has(j.id)) return false;
        seenIdsRef.current.add(j.id);
        return true;
      });
      if (incoming.length === 0) return;

      setState((prev) => {
        // Lock slots not yet full — fill them first
        if (prev.lockedJobs.length < LOCK_SIZE) {
          const needed = LOCK_SIZE - prev.lockedJobs.length;
          const toLock = incoming.slice(0, needed);
          const rest = incoming.slice(needed);
          // Accumulate overflow for later
          if (rest.length > 0) {
            pendingJobsRef.current.push(...rest);
          }
          const newLocked = [...prev.lockedJobs, ...toLock];
          return {
            ...prev,
            lockedJobs: newLocked,
            // Show skeletons once lock slots are filled
            isRankingPending: newLocked.length >= LOCK_SIZE,
          };
        }
        // Lock is already full — accumulate in background, don't show yet
        pendingJobsRef.current.push(...incoming);
        return { ...prev, isRankingPending: true };
      });
    });

    // ── event:ranked — AI ranking complete, fills skeletons ─────────────────
    es.addEventListener("ranked", (e: MessageEvent) => {
      const { jobs: ranked }: { jobs: Job[] } = JSON.parse(e.data);
      setState((prev) => {
        const lockedIds = new Set(prev.lockedJobs.map((j) => j.id));
        return {
          ...prev,
          rankedJobs: ranked.filter((j) => !lockedIds.has(j.id)),
          isRankingPending: false,
        };
      });
      // Clear pending buffer (ranked replaces it entirely)
      pendingJobsRef.current = [];
    });

    // ── event:done — stream complete ────────────────────────────────────────
    es.addEventListener("done", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        isRankingPending: false,
        isDone: true,
        searchTimeMs: data.search_time_ms ?? null,
      }));
      es.close();
      esRef.current = null;
    });

    // ── event:error — server-side error ─────────────────────────────────────
    es.addEventListener("error", (e: MessageEvent) => {
      let message = "Erreur lors de la recherche";
      try {
        const data = JSON.parse((e as MessageEvent).data ?? "{}");
        message = data.error ?? message;
      } catch {
        // ignore parse error
      }
      setState((prev) => ({
        ...prev,
        isLoading: false,
        isRankingPending: false,
        isDone: true,
        error: message,
      }));
      es.close();
      esRef.current = null;
    });

    // ── native onerror — connection dropped ─────────────────────────────────
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) return;
      setState((prev) => ({
        ...prev,
        isLoading: false,
        isRankingPending: false,
        isDone: true,
        error: "Connexion interrompue",
      }));
      es.close();
      esRef.current = null;
    };
  }, []);

  const cancel = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    setState((prev) => ({ ...prev, isLoading: false, isRankingPending: false }));
  }, []);

  // Cleanup on unmount
  useEffect(() => () => { esRef.current?.close(); }, []);

  // Combined view: locked (stable, shown first) + ranked (fills skeletons)
  const jobs = [...state.lockedJobs, ...state.rankedJobs];

  return { ...state, jobs, search, cancel };
}
