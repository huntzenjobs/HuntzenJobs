"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Lightbulb, Shuffle } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * QuickQuestionsDrawer - Collapsible sidebar with contextual questions
 *
 * Features:
 * - Collapsible (320px → 64px icon button)
 * - Categorized questions (CV, Interview, Career, Salary)
 * - Shuffle to rotate suggestions
 * - Smooth animations
 *
 * UX Benefits:
 * - Always accessible without taking space
 * - Provides inspiration when stuck
 * - Contextual based on chat history
 */

export interface QuickQuestion {
  id: string;
  text: string;
  category: "cv" | "interview" | "career" | "salary";
}

export interface QuickQuestionsDrawerProps {
  /** Questions to display */
  questions?: QuickQuestion[];
  /** Handler when question is clicked */
  onQuestionClick?: (question: string) => void;
  /** Initially collapsed */
  initiallyCollapsed?: boolean;
  /** Custom className */
  className?: string;
}

export function QuickQuestionsDrawer({
  questions,
  onQuestionClick,
  initiallyCollapsed = false,
  className,
}: QuickQuestionsDrawerProps) {
  const t = useTranslations("coach.questions");

  const defaultQuestions: QuickQuestion[] = React.useMemo(
    () => [
      { id: "1", category: "cv", text: t("defaultQuestions.q1") },
      { id: "2", category: "interview", text: t("defaultQuestions.q2") },
      { id: "3", category: "salary", text: t("defaultQuestions.q3") },
      { id: "4", category: "career", text: t("defaultQuestions.q4") },
      { id: "5", category: "cv", text: t("defaultQuestions.q5") },
      { id: "6", category: "interview", text: t("defaultQuestions.q6") },
    ],
    [t],
  );

  const activeQuestions = questions ?? defaultQuestions;
  const [isCollapsed, setIsCollapsed] = React.useState(initiallyCollapsed);
  const [displayedQuestions, setDisplayedQuestions] = React.useState<
    QuickQuestion[]
  >([]);

  // Initialiser les questions affichées quand activeQuestions change
  React.useEffect(() => {
    setDisplayedQuestions(activeQuestions.slice(0, 4));
  }, [activeQuestions]);

  // Shuffle questions
  const handleShuffle = () => {
    const shuffled = [...activeQuestions].sort(() => Math.random() - 0.5);
    setDisplayedQuestions(shuffled.slice(0, 4));
  };

  return (
    <aside
      className={cn(
        "relative flex-shrink-0 h-full",
        "transition-all duration-300 ease-in-out",
        isCollapsed ? "w-16" : "w-80",
        className,
      )}
    >
      {/* Collapsed state - Floating button */}
      {isCollapsed && (
        <div className="h-full flex flex-col items-center justify-center">
          <Button
            onClick={() => setIsCollapsed(false)}
            variant="outline"
            size="icon"
            className={cn(
              "size-12 rounded-full",
              "bg-white border-2 border-violet-200 hover:border-violet-400",
              "shadow-lg hover:shadow-xl",
              "transition-all duration-200",
            )}
            aria-label={t("openQuestions")}
          >
            <Lightbulb className="size-5 text-violet-600" />
          </Button>

          {/* Vertical label */}
          <div className="mt-4 -rotate-90 origin-center whitespace-nowrap">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              {t("verticalLabel")}
            </span>
          </div>
        </div>
      )}

      {/* Expanded state - Full drawer */}
      {!isCollapsed && (
        <div className="h-full flex flex-col bg-gradient-to-br from-violet-50 via-white to-purple-50 border-l-2 border-violet-200 shadow-lg">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-4 border-b-2 border-violet-200 bg-white/80 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <Lightbulb className="size-5 text-violet-600" />
              <h3 className="font-semibold text-gray-900">{t("title")}</h3>
            </div>

            <div className="flex items-center gap-1">
              {/* Shuffle button */}
              <Button
                onClick={handleShuffle}
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={t("shuffleQuestions")}
              >
                <Shuffle className="size-4" />
              </Button>

              {/* Collapse button */}
              <Button
                onClick={() => setIsCollapsed(true)}
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={t("collapsePanel")}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>

          {/* Description */}
          <div className="px-4 py-3 bg-violet-50/50">
            <p className="text-xs text-gray-600 leading-relaxed">
              {t("description")}
            </p>
          </div>

          {/* Questions list */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
            {displayedQuestions.map((question, index) => (
              <button
                key={question.id}
                onClick={() => onQuestionClick?.(question.text)}
                className={cn(
                  "group w-full",
                  "flex items-start gap-3 p-3",
                  "bg-white hover:bg-gradient-to-br hover:from-violet-50 hover:to-purple-50",
                  "border-2 border-gray-200 hover:border-violet-300",
                  "rounded-xl",
                  "text-left",
                  "transition-all duration-200",
                  "shadow-sm hover:shadow-md",
                  "transform hover:-translate-y-0.5",
                  "animate-fade-in",
                )}
                style={{
                  animationDelay: String(index * 50) + "ms",
                }}
              >
                {/* Category icon */}
                <div
                  className={cn(
                    "flex-shrink-0 size-6 rounded-lg",
                    "flex items-center justify-center",
                    "transition-colors duration-200",
                    getCategoryStyles(question.category),
                  )}
                >
                  {getCategoryIcon(question.category)}
                </div>

                {/* Question text */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 group-hover:text-violet-700 leading-snug transition-colors">
                    {question.text}
                  </p>
                </div>

                {/* Arrow icon */}
                <svg
                  className="flex-shrink-0 size-4 text-gray-400 group-hover:text-violet-600 transform group-hover:translate-x-0.5 transition-all"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            ))}
          </div>

          {/* Footer tip */}
          <div className="px-4 py-3 border-t-2 border-violet-200 bg-white/80">
            <div className="flex items-start gap-2">
              <Lightbulb className="flex-shrink-0 size-4 text-violet-600 mt-0.5" />
              <p className="text-xs text-gray-600 leading-relaxed">
                <span className="font-semibold">{t("tip")}</span> {t("tipText")}
              </p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

/**
 * Get category-specific styles
 */
function getCategoryStyles(category: string): string {
  switch (category) {
    case "cv":
      return "bg-blue-100 group-hover:bg-blue-200 text-blue-600";
    case "interview":
      return "bg-green-100 group-hover:bg-green-200 text-green-600";
    case "career":
      return "bg-purple-100 group-hover:bg-purple-200 text-purple-600";
    case "salary":
      return "bg-amber-100 group-hover:bg-amber-200 text-amber-600";
    default:
      return "bg-gray-100 group-hover:bg-gray-200 text-gray-600";
  }
}

/**
 * Get category-specific icon
 */
function getCategoryIcon(category: string): React.ReactNode {
  switch (category) {
    case "cv":
      return (
        <svg
          className="size-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      );
    case "interview":
      return (
        <svg
          className="size-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      );
    case "career":
      return (
        <svg
          className="size-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
          />
        </svg>
      );
    case "salary":
      return (
        <svg
          className="size-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    default:
      return <Lightbulb className="size-3.5" />;
  }
}
