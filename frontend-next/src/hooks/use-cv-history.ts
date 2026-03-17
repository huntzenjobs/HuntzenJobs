/**
 * useCVHistory - Hook for managing CV analysis history with localStorage
 * Features: tier-based limits, CRUD operations, auto-cleanup
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useSubscription } from "@/contexts/subscription-context";
import type { BreakdownItem } from "@/components/cv/score-breakdown-v2";
import type { Suggestion } from "@/components/cv/actionable-suggestions";

// ============================================================================
// TYPES
// ============================================================================

export interface CVAnalysisResult {
  id: string;
  fileName: string;
  analyzedAt: Date;
  score: number;
  breakdown: BreakdownItem[];
  strengths: string[];
  weaknesses: string[];
  suggestions: Suggestion[];
  rawAnalysis?: string; // Optional raw analysis text
  error?: string; // Optional error message
  cv_info?: any; // Optional CV info (name, email, phone, skills)
  recommended_job_titles?: string[]; // Suggested job titles based on skills
}

// Serialized version for localStorage (Date → string)
interface CVAnalysisResultSerialized {
  id: string;
  fileName: string;
  analyzedAt: string;
  score: number;
  breakdown: BreakdownItem[];
  strengths: string[];
  weaknesses: string[];
  suggestions: Suggestion[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = "cv_analysis_history";

// Max history items by subscription tier
const MAX_HISTORY_BY_TIER: Record<string, number> = {
  free: 1,
  starter: 5,
  pro: 20,
  premium: 100,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateId(): string {
  return `cv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function serializeHistory(history: CVAnalysisResult[]): string {
  const serialized: CVAnalysisResultSerialized[] = history.map((item) => ({
    ...item,
    analyzedAt: item.analyzedAt.toISOString(),
  }));
  return JSON.stringify(serialized);
}

function deserializeHistory(data: string): CVAnalysisResult[] {
  try {
    const parsed: CVAnalysisResultSerialized[] = JSON.parse(data);
    return parsed.map((item) => ({
      ...item,
      analyzedAt: new Date(item.analyzedAt),
    }));
  } catch (error) {
    console.error("Failed to deserialize CV history:", error);
    return [];
  }
}

// ============================================================================
// HOOK
// ============================================================================

export function useCVHistory() {
  const { plan } = useSubscription();
  const [history, setHistory] = useState<CVAnalysisResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Get max history limit for current tier
  const maxHistory = MAX_HISTORY_BY_TIER[plan] || MAX_HISTORY_BY_TIER.free;

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const loadedHistory = deserializeHistory(stored);
        // Enforce tier limit on load
        const limitedHistory = loadedHistory.slice(0, maxHistory);
        setHistory(limitedHistory);

        // If we had to trim, update localStorage
        if (limitedHistory.length < loadedHistory.length) {
          localStorage.setItem(STORAGE_KEY, serializeHistory(limitedHistory));
        }
      }
    } catch (error) {
      console.error("Failed to load CV history:", error);
    } finally {
      setIsLoading(false);
    }
  }, [maxHistory]);

  // Save analysis to history
  const saveAnalysis = useCallback(
    (result: Omit<CVAnalysisResult, "id" | "analyzedAt">) => {
      const newAnalysis: CVAnalysisResult = {
        ...result,
        id: generateId(),
        analyzedAt: new Date(),
      };

      setHistory((prev) => {
        // Add new analysis at the beginning
        const newHistory = [newAnalysis, ...prev];

        // Enforce tier limit
        const limitedHistory = newHistory.slice(0, maxHistory);

        // Save to localStorage
        try {
          localStorage.setItem(STORAGE_KEY, serializeHistory(limitedHistory));
        } catch (error) {
          console.error("Failed to save CV history:", error);
        }

        return limitedHistory;
      });

      return newAnalysis;
    },
    [maxHistory],
  );

  // Delete analysis by ID
  const deleteAnalysis = useCallback((id: string) => {
    setHistory((prev) => {
      const newHistory = prev.filter((item) => item.id !== id);

      try {
        localStorage.setItem(STORAGE_KEY, serializeHistory(newHistory));
      } catch (error) {
        console.error("Failed to delete CV analysis:", error);
      }

      return newHistory;
    });
  }, []);

  // Clear all history
  const clearHistory = useCallback(() => {
    setHistory([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error("Failed to clear CV history:", error);
    }
  }, []);

  // Get analysis by ID
  const getAnalysis = useCallback(
    (id: string): CVAnalysisResult | undefined => {
      return history.find((item) => item.id === id);
    },
    [history],
  );

  // Check if can save more analyses
  const canSave = history.length < maxHistory;

  // Get remaining slots
  const remainingSlots = Math.max(0, maxHistory - history.length);

  return {
    history,
    isLoading,
    maxHistory,
    canSave,
    remainingSlots,
    saveAnalysis,
    deleteAnalysis,
    clearHistory,
    getAnalysis,
  };
}
