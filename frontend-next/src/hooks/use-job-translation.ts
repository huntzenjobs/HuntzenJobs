"use client";

/**
 * useJobTranslation
 *
 * Auto-translates job listings (title + description) when the user's locale
 * is not French. Uses the /api/translate endpoint which leverages DeepL with
 * Translation Memory caching (Supabase → DeepL → MyMemory fallback).
 *
 * Fields translated: title, description
 * Fields kept as-is: company, location, salary, url, source (proper nouns / metadata)
 */

import { useState, useEffect, useRef } from "react";
import { useLocale } from "next-intl";
import type { Job } from "@/lib/api/huntzen-client";

interface UseJobTranslationResult {
  translatedJobs: Job[];
  isTranslating: boolean;
}

export function useJobTranslation(jobs: Job[]): UseJobTranslationResult {
  const locale = useLocale();
  const [translatedJobs, setTranslatedJobs] = useState<Job[]>(jobs);
  const [isTranslating, setIsTranslating] = useState(false);

  // Track which job IDs have already been translated to avoid re-translating
  // identical result sets (e.g. when parent re-renders without jobs changing)
  const translatedCacheRef = useRef<Map<string, { title: string; description: string }>>(
    new Map()
  );

  useEffect(() => {
    // No translation needed for French (source language)
    if (locale === "fr" || jobs.length === 0) {
      setTranslatedJobs(jobs);
      return;
    }

    // Check which jobs still need translation
    const jobsToTranslate = jobs.filter(
      (job) => !translatedCacheRef.current.has(job.id)
    );

    // If all jobs are cached, apply cache immediately without API call
    if (jobsToTranslate.length === 0) {
      setTranslatedJobs(
        jobs.map((job) => {
          const cached = translatedCacheRef.current.get(job.id);
          return cached ? { ...job, title: cached.title, description: cached.description } : job;
        })
      );
      return;
    }

    let cancelled = false;

    const translate = async () => {
      setIsTranslating(true);

      try {
        // Build a flat array: [title1, desc1, title2, desc2, ...]
        // This lets us send a single batch request for all fields
        const texts: string[] = [];
        for (const job of jobsToTranslate) {
          texts.push(job.title || "");
          texts.push(job.description || "");
        }

        const response = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: texts,
            targetLang: locale, // 'en' | 'es' | 'pt'
            sourceLang: "fr",
          }),
        });

        if (!response.ok || cancelled) return;

        const data = await response.json();
        const translated: string[] = data.translated;

        // Map translated strings back to jobs
        // [title1, desc1, title2, desc2, ...] → job objects
        for (let i = 0; i < jobsToTranslate.length; i++) {
          const job = jobsToTranslate[i];
          translatedCacheRef.current.set(job.id, {
            title: translated[i * 2] ?? job.title,
            description: translated[i * 2 + 1] ?? job.description,
          });
        }

        if (!cancelled) {
          // Merge cache with original jobs (preserve all other fields)
          setTranslatedJobs(
            jobs.map((job) => {
              const cached = translatedCacheRef.current.get(job.id);
              return cached
                ? { ...job, title: cached.title, description: cached.description }
                : job;
            })
          );
        }
      } catch (err) {
        // Non-critical: on failure, show original French content
        console.warn("[useJobTranslation] Translation failed, using originals:", err);
        if (!cancelled) {
          setTranslatedJobs(jobs);
        }
      } finally {
        if (!cancelled) {
          setIsTranslating(false);
        }
      }
    };

    translate();

    return () => {
      cancelled = true;
    };
  }, [jobs, locale]);

  return { translatedJobs, isTranslating };
}
