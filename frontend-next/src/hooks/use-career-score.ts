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

  const fetchScore = useCallback(
    async (forceRecalc = false) => {
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
    },
    [session?.access_token],
  );

  useEffect(() => {
    fetchScore();
  }, [fetchScore]);

  const recalculate = useCallback(() => fetchScore(true), [fetchScore]);

  return { score, isLoading, error, recalculate };
}

export async function sendXpEvent(
  token: string,
  eventType: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  if (!token) return;
  try {
    await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/career-score/xp-event`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_type: eventType,
          ...(metadata && { metadata }),
        }),
      },
    );
  } catch {
    // silent fail — XP events are non-blocking
  }
}
