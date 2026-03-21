/**
 * ResultsAccordion - 3 collapsible sections for CV analysis results
 * Sections: Score Breakdown, Strengths/Weaknesses, Suggestions
 */

"use client";

import { TrendingUp, TrendingDown, Lightbulb } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  ScoreBreakdownV2,
  type BreakdownItem,
} from "@/components/cv/score-breakdown-v2";
import {
  ActionableSuggestions,
  type Suggestion,
} from "@/components/cv/actionable-suggestions";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// ============================================================================
// TYPES
// ============================================================================

interface ResultsAccordionProps {
  breakdown: BreakdownItem[];
  strengths: string[];
  weaknesses: string[];
  suggestions: Suggestion[];
  rawAnalysis?: string;
  currentScore: number;
  className?: string;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function StrengthsWeaknessesGrid({
  strengths,
  weaknesses,
}: {
  strengths: string[];
  weaknesses: string[];
}) {
  const t = useTranslations("cv.results");
  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Strengths */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-green-600" />
          <h4 className="font-semibold text-gray-900">{t("strengths")}</h4>
          <Badge
            variant="outline"
            className="bg-green-50 text-green-700 border-green-200"
          >
            {strengths.length}
          </Badge>
        </div>
        <ul className="space-y-2">
          {strengths.map((strength, index) => (
            <li
              key={index}
              className="flex items-start gap-2 p-3 bg-green-50 rounded-lg border border-green-100"
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-600 mt-2 flex-shrink-0" />
              <span className="text-sm text-gray-800">{strength}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Weaknesses */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <TrendingDown className="h-5 w-5 text-orange-600" />
          <h4 className="font-semibold text-gray-900">{t("weaknesses")}</h4>
          <Badge
            variant="outline"
            className="bg-orange-50 text-orange-700 border-orange-200"
          >
            {weaknesses.length}
          </Badge>
        </div>
        <ul className="space-y-2">
          {weaknesses.map((weakness, index) => (
            <li
              key={index}
              className="flex items-start gap-2 p-3 bg-orange-50 rounded-lg border border-orange-100"
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-600 mt-2 flex-shrink-0" />
              <span className="text-sm text-gray-800">{weakness}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ResultsAccordion({
  breakdown,
  strengths,
  weaknesses,
  suggestions,
  currentScore,
  className,
}: ResultsAccordionProps) {
  const t = useTranslations("cv.results");
  return (
    <Accordion
      type="multiple"
      defaultValue={["breakdown", "strengths-weaknesses", "suggestions"]}
      className={cn("space-y-3", className)}
    >
      {/* Section 1: Score Breakdown */}
      <AccordionItem
        value="breakdown"
        className="border-2 rounded-xl bg-white overflow-hidden"
      >
        <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
              <svg
                className="h-4 w-4 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <span className="text-lg font-semibold text-gray-900">
              {t("scoreDetails")}
            </span>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-6 py-4 border-t-2">
          <ScoreBreakdownV2 breakdown={breakdown} />
        </AccordionContent>
      </AccordionItem>

      {/* Section 2: Strengths & Weaknesses */}
      <AccordionItem
        value="strengths-weaknesses"
        className="border-2 rounded-xl bg-white overflow-hidden"
      >
        <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center">
              <svg
                className="h-4 w-4 text-violet-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
                />
              </svg>
            </div>
            <span className="text-lg font-semibold text-gray-900">
              {t("strengthsAndWeaknesses")}
            </span>
            <Badge variant="outline" className="ml-auto">
              {t("elementsCount", {
                count: strengths.length + weaknesses.length,
              })}
            </Badge>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-6 py-4 border-t-2">
          <StrengthsWeaknessesGrid
            strengths={strengths}
            weaknesses={weaknesses}
          />
        </AccordionContent>
      </AccordionItem>

      {/* Section 3: Actionable Suggestions */}
      <AccordionItem
        value="suggestions"
        className="border-2 rounded-xl bg-white overflow-hidden"
      >
        <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
              <Lightbulb className="h-4 w-4 text-amber-600" />
            </div>
            <span className="text-lg font-semibold text-gray-900">
              {t("suggestionsTitle")}
            </span>
            <Badge variant="outline" className="ml-auto">
              {t("actionsCount", { count: suggestions.length })}
            </Badge>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-6 py-4 border-t-2">
          <ActionableSuggestions
            suggestions={suggestions}
            currentScore={currentScore}
          />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
