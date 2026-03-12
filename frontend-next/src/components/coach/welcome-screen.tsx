"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
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

export function WelcomeScreen({
  onQuestionClick,
  className,
}: WelcomeScreenProps) {
  const t = useTranslations("dashboard.assistant");
  const { setSelectedAssistant } = useAssistant();
  const auth = useOptionalAuth();
  const fullName = auth?.user?.user_metadata?.full_name as string | undefined;
  const firstName = fullName?.split(" ")[0] || null;

  const [hoveredCoach, setHoveredCoach] = React.useState<AssistantType | null>(
    null,
  );
  const [selectedCoach, setSelectedCoach] =
    React.useState<AssistantType>("career-coach");

  const activeCoachId = hoveredCoach ?? selectedCoach;
  const activeCoach = getAssistantConfig(activeCoachId);
  const coaches = DISPLAY_COACHES.map((id) => getAssistantConfig(id));

  const handleChipClick = (question: string) => {
    setSelectedAssistant(activeCoach.id);
    onQuestionClick?.(question);
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6 w-full max-w-4xl">
        {coaches.map((coach) => {
          const isActive = coach.id === activeCoachId;
          return (
            <button
              key={coach.id}
              onClick={() => setSelectedCoach(coach.id)}
              onMouseEnter={() => setHoveredCoach(coach.id)}
              onMouseLeave={() => setHoveredCoach(null)}
              className={cn(
                "group flex flex-col items-center gap-2 p-4 rounded-xl",
                "bg-white border-2 transition-all duration-200 transform hover:-translate-y-0.5",
                "text-center",
                isActive ? "shadow-md" : "border-gray-200 hover:shadow-md",
              )}
              style={{
                borderColor: isActive ? coach.color : undefined,
              }}
            >
              <div
                className="size-12 rounded-full flex items-center justify-center overflow-hidden"
                style={{ backgroundColor: coach.bgColor }}
              >
                {coach.avatarUrl ? (
                  <img
                    src={coach.avatarUrl}
                    alt={coach.personaName || coach.shortName}
                    className="size-10 rounded-full object-cover"
                  />
                ) : (
                  <coach.icon
                    className="size-6"
                    style={{ color: coach.color }}
                  />
                )}
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
            </button>
          );
        })}
      </div>

      {/* Dynamic section — changes with active coach */}
      <div
        key={activeCoachId}
        className="flex flex-col items-center gap-4 w-full max-w-2xl animate-fade-in"
      >
        {/* Avatar + identity */}
        <div className="flex flex-col items-center gap-2">
          <div
            className="size-20 rounded-full flex items-center justify-center overflow-hidden shadow-md"
            style={{ backgroundColor: activeCoach.bgColor }}
          >
            {activeCoach.avatarUrl ? (
              <img
                src={activeCoach.avatarUrl}
                alt={activeCoach.personaName || activeCoach.shortName}
                className="size-20 rounded-full object-cover"
              />
            ) : (
              <activeCoach.icon
                className="size-10"
                style={{ color: activeCoach.color }}
              />
            )}
          </div>
          <h2 className="text-xl font-bold text-gray-900">
            Bonjour, je suis{" "}
            <span style={{ color: activeCoach.color }}>
              {activeCoach.personaName || activeCoach.shortName}
            </span>
          </h2>
          <p className="text-sm text-gray-500 text-center max-w-sm">
            {activeCoach.description}
          </p>
        </div>

        {/* Question chips */}
        <div className="flex flex-col gap-2 w-full">
          {activeCoach.exampleQuestions.map((question, idx) => (
            <button
              key={idx}
              onClick={() => handleChipClick(question)}
              className={cn(
                "w-full px-4 py-3 rounded-xl text-left text-sm font-medium",
                "bg-white border-2 border-gray-200",
                "hover:shadow-sm transition-all duration-150",
              )}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  activeCoach.color;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "";
              }}
            >
              <span style={{ color: activeCoach.color }}>→</span>{" "}
              <span className="text-gray-700">{question}</span>
            </button>
          ))}
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
