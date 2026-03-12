"use client";

import * as React from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAssistant } from "@/contexts/assistant-context";
import { getAssistantConfig } from "@/config/assistants";
import { useOptionalAuth } from "@/contexts/auth-context";
import { AssistantType } from "@/types/assistant";
import { useTranslations } from "next-intl";

export interface WelcomeScreenProps {
  onQuestionClick?: (question: string) => void;
  className?: string;
}

// Coaches affichés sur l'écran d'accueil (cv-adapter exclu)
const DISPLAY_COACHES: AssistantType[] = [
  "career-coach",
  "job-scout",
  "cv-analyzer",
  "interview-sim",
  "branding",
];

// Mapping quick-actions : clé i18n → coach + message pré-rempli
const QUICK_ACTION_CONFIGS = [
  {
    labelKey: "quickActionCV" as const,
    assistantId: "cv-analyzer" as AssistantType,
    message: "Je veux améliorer mon CV.",
  },
  {
    labelKey: "quickActionJobs" as const,
    assistantId: "job-scout" as AssistantType,
    message: "Je cherche des offres d'emploi qui correspondent à mon profil.",
  },
  {
    labelKey: "quickActionInterview" as const,
    assistantId: "interview-sim" as AssistantType,
    message: "Je veux me préparer pour un entretien.",
  },
  {
    labelKey: "quickActionCareer" as const,
    assistantId: "career-coach" as AssistantType,
    message: "Je veux définir mon objectif de carrière.",
  },
];

export function WelcomeScreen({
  onQuestionClick,
  className,
}: WelcomeScreenProps) {
  const t = useTranslations("dashboard.assistant");
  const { setSelectedAssistant } = useAssistant();
  const auth = useOptionalAuth();
  const fullName = auth?.user?.user_metadata?.full_name as string | undefined;
  const firstName = fullName?.split(" ")[0] || null;

  const coaches = DISPLAY_COACHES.map((id) => getAssistantConfig(id));

  const handleCoachSelect = (assistantId: AssistantType) => {
    setSelectedAssistant(assistantId);
    const config = getAssistantConfig(assistantId);
    if (onQuestionClick && config.exampleQuestions.length > 0) {
      onQuestionClick(config.exampleQuestions[0]);
    }
  };

  const handleQuickAction = (action: (typeof QUICK_ACTION_CONFIGS)[0]) => {
    setSelectedAssistant(action.assistantId);
    onQuestionClick?.(action.message);
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center",
        "h-full min-h-[500px] px-4 py-10",
        "animate-fade-in",
        className,
      )}
    >
      {/* Header */}
      <div className="text-center mb-8 max-w-2xl">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {firstName
            ? t("welcomeTeamWithName", { name: firstName })
            : t("welcomeTeam")}
        </h1>
        <p className="text-lg text-gray-500">{t("welcomeSubtitle")}</p>
      </div>

      {/* 5 Coach Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8 w-full max-w-4xl">
        {coaches.map((coach) => (
          <button
            key={coach.id}
            onClick={() => handleCoachSelect(coach.id)}
            className={cn(
              "group flex flex-col items-center gap-2 p-4 rounded-xl",
              "bg-white border-2 border-gray-200",
              "hover:shadow-md",
              "transition-all duration-200 transform hover:-translate-y-0.5",
              "text-center",
            )}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                coach.color;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "";
            }}
          >
            <div
              className="size-12 rounded-full flex items-center justify-center"
              style={{ backgroundColor: coach.bgColor }}
            >
              <coach.icon className="size-6" style={{ color: coach.color }} />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">
                {coach.personaName || coach.shortName}
              </p>
              {coach.personaName && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {coach.shortName}
                </p>
              )}
            </div>
            <ArrowRight className="size-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
          </button>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="w-full max-w-2xl">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-center mb-4">
          {t("welcomeChoose")}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {QUICK_ACTION_CONFIGS.map((action) => {
            const config = getAssistantConfig(action.assistantId);
            return (
              <button
                key={action.labelKey}
                onClick={() => handleQuickAction(action)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3",
                  "bg-white border border-gray-200 rounded-xl",
                  "hover:bg-gray-50 hover:border-gray-300",
                  "text-left text-sm font-medium text-gray-700",
                  "transition-all duration-150 group",
                )}
              >
                <div
                  className="size-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: config.bgColor }}
                >
                  <config.icon
                    className="size-4"
                    style={{ color: config.color }}
                  />
                </div>
                <span className="flex-1">{t(action.labelKey)}</span>
                <ArrowRight className="size-4 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 flex items-center gap-2 text-xs text-gray-400">
        <Sparkles className="size-3.5" />
        <span>{t("welcomeFooter")}</span>
      </div>
    </div>
  );
}
