"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useAssistant } from "@/contexts/assistant-context";
import { getAssistantConfig, ASSISTANT_TO_COACH_ID } from "@/config/assistants";
import { useTranslations } from "next-intl";
import type { CoachConfig } from "@/hooks/use-coaches-config";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "";

export interface WelcomeScreenProps {
  onQuestionClick?: (question: string) => void;
  className?: string;
  /** DB coach data — if provided, overrides i18n keys for text */
  coachData?: CoachConfig;
}

export function WelcomeScreen({
  onQuestionClick,
  className,
  coachData,
}: WelcomeScreenProps) {
  const { selectedAssistant } = useAssistant();
  const assistant = getAssistantConfig(selectedAssistant);
  const tc = useTranslations("coaches");
  const [dynamicQuestions, setDynamicQuestions] = React.useState<
    string[] | null
  >(null);

  React.useEffect(() => {
    if (!selectedAssistant) return;
    let cancelled = false;

    async function fetchSuggestions() {
      try {
        const res = await fetch(
          `${BACKEND_URL}/api/assistant/suggestions?assistant_id=${selectedAssistant}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();
        const items: Array<{ text: string }> = Array.isArray(data.suggestions)
          ? data.suggestions
          : [];
        if (!cancelled && items.length > 0) {
          setDynamicQuestions(items.map((s) => s.text));
        }
      } catch {
        // Fallback to i18n questions — do nothing
      }
    }

    setDynamicQuestions(null);
    fetchSuggestions();
    return () => {
      cancelled = true;
    };
  }, [selectedAssistant]);

  // Resolve text: DB data takes priority over i18n keys
  const shortName = coachData?.short_name || tc(assistant.shortNameKey);
  const descriptionText =
    coachData?.description || tc(assistant.descriptionKey);
  const displayName = assistant.personaName || shortName;

  const questions =
    dynamicQuestions && dynamicQuestions.length > 0
      ? dynamicQuestions
      : coachData?.example_questions && coachData.example_questions.length > 0
        ? coachData.example_questions
        : assistant.exampleQuestionsKeys.map((key) => tc(key));

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center",
        "h-full min-h-[500px] px-4 py-10",
        className,
      )}
    >
      {/* Avatar */}
      <div
        className="size-24 rounded-full flex items-center justify-center overflow-hidden shadow-lg mb-5"
        style={{ backgroundColor: assistant.bgColor }}
      >
        {assistant.avatarUrl ? (
          <img
            src={assistant.avatarUrl}
            alt={displayName}
            className="size-24 rounded-full object-cover"
          />
        ) : (
          <assistant.icon
            className="size-12"
            style={{ color: assistant.color }}
          />
        )}
      </div>

      {/* Identite */}
      <h2 className="text-2xl font-bold text-gray-900 mb-1">
        {tc("greeting")}{" "}
        <span style={{ color: assistant.color }}>{displayName}</span>
      </h2>
      <p className="text-sm text-gray-500 text-center max-w-sm mb-6">
        {shortName}
      </p>

      <p className="text-base text-gray-600 text-center max-w-md mb-8">
        {descriptionText}
      </p>

      {/* Suggestions */}
      <div className="flex flex-col gap-3 w-full max-w-lg">
        {questions.map((question, idx) => (
          <button
            key={idx}
            onClick={() => onQuestionClick?.(question)}
            className={cn(
              "w-full px-5 py-3.5 rounded-xl text-left text-sm font-medium",
              "bg-white border-2 border-gray-200",
              "hover:shadow-sm transition-all duration-150",
            )}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                assistant.color;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "";
            }}
          >
            <span style={{ color: assistant.color }}>→</span>{" "}
            <span className="text-gray-700">{question}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
