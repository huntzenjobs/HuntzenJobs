"use client";

import { useState } from "react";
import { RefreshCw, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCareerScore } from "@/hooks/use-career-score";

interface SubBarProps {
  label: string;
  value: number;
  max: number;
  color: string;
}

function SubBar({ label, value, max, color }: SubBarProps) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}/{max}</span>
      </div>
      <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

interface CareerScoreCardProps {
  className?: string;
  compact?: boolean;
}

export function CareerScoreCard({ className, compact = false }: CareerScoreCardProps) {
  const { score, isLoading, recalculate } = useCareerScore();
  const [isRecalculating, setIsRecalculating] = useState(false);

  const handleRecalculate = async () => {
    setIsRecalculating(true);
    await recalculate();
    setIsRecalculating(false);
  };

  if (isLoading) {
    return (
      <div className={cn("rounded-xl border bg-card p-5 animate-pulse", className)}>
        <div className="h-4 w-32 bg-gray-200 rounded mb-4" />
        <div className="flex gap-4 items-center mb-4">
          <div className="w-16 h-16 rounded-full bg-gray-200" />
          <div className="flex-1 space-y-2">
            <div className="h-2 bg-gray-200 rounded" />
            <div className="h-2 bg-gray-200 rounded w-3/4" />
            <div className="h-2 bg-gray-200 rounded w-1/2" />
          </div>
        </div>
      </div>
    );
  }

  if (!score) return null;

  const getScoreColor = (s: number) => {
    if (s >= 70) return "text-green-600";
    if (s >= 50) return "text-amber-500";
    return "text-red-500";
  };

  const getRingColor = (s: number) => {
    if (s >= 70) return "#22c55e";
    if (s >= 50) return "#f59e0b";
    return "#ef4444";
  };

  const circumference = 2 * Math.PI * 28;
  const offset = circumference - (score.total_score / 100) * circumference;

  return (
    <div className={cn("rounded-xl border bg-card p-5", className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-semibold">Career Score</span>
        </div>
        <button
          onClick={handleRecalculate}
          disabled={isRecalculating}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Recalculer"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isRecalculating && "animate-spin")} />
        </button>
      </div>

      <div className="flex items-start gap-5">
        <div className="relative flex-shrink-0" style={{ width: 64, height: 64 }}>
          <svg className="transform -rotate-90" width={64} height={64}>
            <circle cx={32} cy={32} r={28} fill="none" stroke="currentColor"
              strokeWidth={6} className="text-gray-100" />
            <circle cx={32} cy={32} r={28} fill="none"
              stroke={getRingColor(score.total_score)}
              strokeWidth={6} strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={offset}
              className="transition-all duration-1000 ease-out" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn("text-lg font-bold leading-none", getScoreColor(score.total_score))}>
              {score.total_score}
            </span>
            <span className="text-[9px] text-muted-foreground leading-none">/100</span>
          </div>
        </div>

        <div className="flex-1 space-y-2">
          <SubBar label="Activité" value={score.activity_score} max={40} color="bg-blue-600" />
          <SubBar label="IA" value={score.ai_score} max={40} color="bg-teal-500" />
          <SubBar label="XP" value={score.xp_score} max={20} color="bg-violet-500" />
        </div>
      </div>

      {score.ai_justification && (
        <p className="mt-3 text-xs text-muted-foreground italic leading-relaxed">
          {score.ai_justification}
        </p>
      )}

      {score.total_score >= 60 && (
        <p className="mt-2 text-xs text-green-600 font-medium">
          Ton profil devient vraiment intéressant pour les recruteurs.
        </p>
      )}
    </div>
  );
}
