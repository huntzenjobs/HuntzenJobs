/**
 * Custom React hook for async CV analysis with Modal Labs (S6-6)
 *
 * Features:
 * - Non-blocking upload with status polling
 * - Automatic 2-second polling interval
 * - Progress tracking with estimated time
 * - Error handling and retry logic
 * - Cleanup on unmount
 *
 * Usage:
 * ```tsx
 * const { uploadCV, status, result, error, progress } = useCVAnalysis();
 *
 * const handleUpload = async (file: File) => {
 *   await uploadCV(file, jobDescription);
 * };
 * ```
 *
 * @author HuntZen Team
 * @date 2026-01-28
 * @sprint 6 - Ticket S6-6
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useAuthenticatedFetch } from "@/hooks/use-authenticated-fetch";
import { useLocale } from "@/contexts/i18n-context";
import { sendXpEvent } from "@/hooks/use-career-score";

// ============================================
// TYPES
// ============================================

export interface CVAnalysisApiResult {
  ats_score: {
    overall_score: number;
    formatting_score: number;
    formatting_explanation?: string;
    keywords_score: number;
    keywords_explanation?: string;
    structure_score: number;
    structure_explanation?: string;
    readability_score: number;
    readability_explanation?: string;
  };
  strengths: string[];
  improvements: string[];
  missing_sections: string[];
  keywords_found: string[];
  keywords_missing: string[];
  job_match_score?: number;
  job_match_explanation?: string;
  suggested_job_titles?: string[];
  cv_info?: Record<string, unknown>;
  analysis_language: "fr" | "en";
  processed_at: string;
  processing_time_seconds?: number;
}

interface CVAnalysisStatus {
  cv_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  result?: CVAnalysisApiResult;
  error?: string;
  created_at: string;
  completed_at?: string;
  processing_time_seconds?: number;
}

interface UploadResponse {
  success: boolean;
  cv_id: string;
  status: string;
  message: string;
  estimated_time_seconds: number;
  anonymous_id?: string; // For anonymous users
}

interface UseCVAnalysisReturn {
  // Upload functions
  uploadCV: (
    file: File,
    jobDescription?: string,
    language?: "fr" | "en",
  ) => Promise<void>;
  uploadCVText: (
    cvText: string,
    jobDescription?: string,
    language?: "fr" | "en",
  ) => Promise<void>;

  // State
  status: CVAnalysisStatus["status"];
  result: CVAnalysisApiResult | null;
  error: string | null;
  isUploading: boolean;
  isPolling: boolean;

  // Progress tracking
  progress: number; // 0-100
  estimatedTimeRemaining: number; // seconds
  elapsedTime: number; // seconds

  // Control
  cancelPolling: () => void;
  reset: () => void;
}

// ============================================
// CONSTANTS
// ============================================

const POLLING_INTERVAL = 2000; // 2 seconds
const MAX_POLLING_DURATION = 300000; // 5 minutes (Modal cold starts & large PDFs)
const ESTIMATED_PROCESSING_TIME = 15; // seconds (from S6-6 docs)

// ============================================
// HOOK
// ============================================

export function useCVAnalysis(onComplete?: () => void): UseCVAnalysisReturn {
  // Get auth session from context (instead of calling Supabase directly)
  const { session } = useAuth();

  // Get authenticated fetch with automatic token refresh
  const { authenticatedFetch } = useAuthenticatedFetch();

  // Get current locale for API calls
  const { locale } = useLocale();

  // State — ALL hooks called unconditionally before any auth check (Rules of Hooks).
  // Auth validation happens inside async callbacks, not during render.
  // Throwing here caused React error #310 (state update during render) when session
  // expired: 3 hooks ran before the throw, 14 hooks ran on the previous render.
  const [cvId, setCvId] = useState<string | null>(null);
  const [anonymousId, setAnonymousId] = useState<string | null>(null);
  const [status, setStatus] = useState<CVAnalysisStatus["status"]>("pending");
  const [result, setResult] = useState<CVAnalysisApiResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);

  // Progress tracking
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState(
    ESTIMATED_PROCESSING_TIME,
  );
  const [progress, setProgress] = useState(0);

  // Refs for cleanup
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const elapsedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // ============================================
  // CLEANUP ON UNMOUNT
  // ============================================

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
      }
    };
  }, []);

  // ============================================
  // ELAPSED TIME TRACKER
  // ============================================

  useEffect(() => {
    if (startTime && (status === "pending" || status === "processing")) {
      elapsedTimerRef.current = setInterval(() => {
        if (isMountedRef.current) {
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          setElapsedTime(elapsed);

          // Update progress (0-100%)
          const progressPercent = Math.min(
            Math.floor((elapsed / ESTIMATED_PROCESSING_TIME) * 100),
            95, // Cap at 95% until actually complete
          );
          setProgress(progressPercent);

          // Update estimated time remaining
          const remaining = Math.max(0, ESTIMATED_PROCESSING_TIME - elapsed);
          setEstimatedTimeRemaining(remaining);
        }
      }, 1000);
    } else {
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
      }
    }

    return () => {
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
      }
    };
  }, [startTime, status]);

  // ============================================
  // POLLING LOGIC
  // ============================================

  const startPolling = useCallback(
    (cvAnalysisId: string, anonymousSessionId?: string) => {
      setIsPolling(true);
      const pollStart = Date.now();

      const poll = async () => {
        try {
          // Safety: Stop polling after max duration
          if (Date.now() - pollStart > MAX_POLLING_DURATION) {
            console.warn("Polling timeout reached (5 minutes)");
            setError("Processing timeout - please check status later");
            setStatus("failed");
            setIsPolling(false);
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
            }
            return;
          }

          // Build headers (auth optional for anonymous users)
          // Build URL with anonymous_id query param if needed
          let url = `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/cv-analysis/status/${cvAnalysisId}`;
          if (anonymousSessionId) {
            url += `?anonymous_id=${encodeURIComponent(anonymousSessionId)}`;
          }

          // Use authenticatedFetch with automatic token refresh on 401
          const response = await authenticatedFetch(url);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const data: CVAnalysisStatus = await response.json();

          if (!isMountedRef.current) return;

          // Update status
          setStatus(data.status);

          // Handle completion
          if (data.status === "completed") {
            setResult(data.result || null);
            setProgress(100);
            setIsPolling(false);
            setEstimatedTimeRemaining(0);

            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
            }

            sendXpEvent(session?.access_token ?? "", "cv_analysis");
            onCompleteRef.current?.();
          }

          // Handle failure
          else if (data.status === "failed") {
            setError(data.error || "CV analysis failed");
            setIsPolling(false);

            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
            }

            console.error("❌ CV analysis failed", {
              cv_id: cvAnalysisId,
              error: data.error,
            });
          }
        } catch (err) {
          console.error("Polling error:", err);

          if (isMountedRef.current) {
            setError(
              err instanceof Error ? err.message : "Failed to fetch CV status",
            );
            setIsPolling(false);

            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
            }
          }
        }
      };

      // Initial poll
      poll();

      // Set up interval
      pollingIntervalRef.current = setInterval(poll, POLLING_INTERVAL);
    },
    [authenticatedFetch, session],
  );

  // ============================================
  // UPLOAD FUNCTION
  // ============================================

  const uploadCV = useCallback(
    async (
      file: File,
      jobDescription?: string,
      language?: "fr" | "en" | "es" | "pt",
    ) => {
      if (!session) {
        setError("Session expirée - veuillez vous reconnecter");
        return;
      }
      // Use provided language or default to user's detected locale
      const finalLanguage = language || locale;
      // Reset state
      setError(null);
      setResult(null);
      setStatus("pending");
      setProgress(0);
      setElapsedTime(0);
      setEstimatedTimeRemaining(ESTIMATED_PROCESSING_TIME);
      setIsUploading(true);
      setStartTime(Date.now()); // Démarrer le timer immédiatement

      try {
        // Validate file type
        if (!file.name.toLowerCase().endsWith(".pdf")) {
          throw new Error(
            "Seuls les fichiers PDF sont supportés pour le traitement asynchrone",
          );
        }

        // Validate file size (max 10MB)
        const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
        if (file.size > MAX_FILE_SIZE) {
          throw new Error("Le fichier est trop volumineux (max 10MB)");
        }

        // Prepare form data
        const formData = new FormData();
        formData.append("file", file);
        if (jobDescription) {
          formData.append("job_description", jobDescription);
        }
        formData.append("language", finalLanguage);

        // Upload to backend with automatic token refresh on 401
        const response = await authenticatedFetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/cv-analysis/async`,
          {
            method: "POST",
            body: formData,
            // Don't set Content-Type for FormData - browser will set it with boundary
          },
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));

          // Handle quota exceeded (429) with specific error types
          if (response.status === 429) {
            // Check if it's anonymous rate limit exceeded
            if (errorData.detail?.error === "anonymous_rate_limit_exceeded") {
              throw new Error("ANONYMOUS_RATE_LIMIT_EXCEEDED");
            }
            // Otherwise, it's a regular quota exceeded
            throw new Error("QUOTA_EXCEEDED");
          }

          throw new Error(
            errorData.detail ||
              `HTTP ${response.status}: ${response.statusText}`,
          );
        }

        const data: UploadResponse = await response.json();

        if (!data.success) {
          throw new Error(data.message || "Upload failed");
        }

        // Store cv_id and start polling
        setCvId(data.cv_id);
        if (data.anonymous_id) {
          setAnonymousId(data.anonymous_id);
        }
        setStatus("pending");

        // Start polling (pass anonymous_id if available)
        startPolling(data.cv_id, data.anonymous_id);
      } catch (err) {
        console.error("Upload error:", err);
        setError(err instanceof Error ? err.message : "Upload failed");
        setStatus("failed");
      } finally {
        setIsUploading(false);
      }
    },
    [authenticatedFetch, session, startPolling],
  );

  // ============================================
  // UPLOAD CV TEXT FUNCTION
  // ============================================

  const uploadCVText = useCallback(
    async (
      cvText: string,
      jobDescription?: string,
      language?: "fr" | "en" | "es" | "pt",
    ) => {
      if (!session) {
        setError("Session expirée - veuillez vous reconnecter");
        return;
      }
      // Use provided language or default to user's detected locale
      const finalLanguage = language || locale;
      // Reset state
      setError(null);
      setResult(null);
      setStatus("pending");
      setProgress(0);
      setElapsedTime(0);
      setEstimatedTimeRemaining(ESTIMATED_PROCESSING_TIME);
      setIsUploading(true);
      setStartTime(Date.now()); // Démarrer le timer immédiatement

      try {
        // Validate text length
        if (cvText.trim().length < 100) {
          throw new Error(
            "Le texte du CV est trop court (minimum 100 caractères)",
          );
        }

        if (cvText.length > 50000) {
          throw new Error(
            "Le texte du CV est trop long (maximum 50 000 caractères)",
          );
        }

        // Prepare form data
        const formData = new FormData();
        formData.append("cv_text", cvText);
        if (jobDescription) {
          formData.append("job_description", jobDescription);
        }
        formData.append("language", finalLanguage);

        // Upload to backend with automatic token refresh on 401
        const response = await authenticatedFetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/cv-analysis/async`,
          {
            method: "POST",
            body: formData,
            // Don't set Content-Type for FormData - browser will set it with boundary
          },
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));

          // Handle quota exceeded (429) with specific error types
          if (response.status === 429) {
            // Check if it's anonymous rate limit exceeded
            if (errorData.detail?.error === "anonymous_rate_limit_exceeded") {
              throw new Error("ANONYMOUS_RATE_LIMIT_EXCEEDED");
            }
            // Otherwise, it's a regular quota exceeded
            throw new Error("QUOTA_EXCEEDED");
          }

          throw new Error(
            errorData.detail ||
              `HTTP ${response.status}: ${response.statusText}`,
          );
        }

        const data: UploadResponse = await response.json();

        if (!data.success) {
          throw new Error(data.message || "Upload failed");
        }

        // Store cv_id and start polling
        setCvId(data.cv_id);
        if (data.anonymous_id) {
          setAnonymousId(data.anonymous_id);
        }
        setStatus("pending");

        // Start polling (pass anonymous_id if available)
        startPolling(data.cv_id, data.anonymous_id);
      } catch (err) {
        console.error("Text upload error:", err);
        setError(err instanceof Error ? err.message : "Upload failed");
        setStatus("failed");
      } finally {
        setIsUploading(false);
      }
    },
    [authenticatedFetch, session, startPolling, locale],
  );

  // ============================================================================
  // CONTROL FUNCTIONS
  // ============================================

  const cancelPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const reset = useCallback(() => {
    cancelPolling();
    setCvId(null);
    setAnonymousId(null);
    setStatus("pending");
    setResult(null);
    setError(null);
    setProgress(0);
    setElapsedTime(0);
    setEstimatedTimeRemaining(ESTIMATED_PROCESSING_TIME);
    setStartTime(null);
  }, [cancelPolling]);

  // ============================================
  // RETURN
  // ============================================

  return {
    uploadCV,
    uploadCVText,
    status,
    result,
    error,
    isUploading,
    isPolling,
    progress,
    estimatedTimeRemaining,
    elapsedTime,
    cancelPolling,
    reset,
  };
}
