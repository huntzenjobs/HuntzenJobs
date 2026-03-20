"use client";

import { useSubscription } from "@/contexts/subscription-context";
import { FeatureType } from "@/hooks/use-freemium-limits";
import { Search, FileText, Clock, Eye } from "lucide-react";

interface UsageCounterProps {
  feature: FeatureType;
  className?: string;
  showIcon?: boolean;
  showBar?: boolean;
  compact?: boolean;
}

const featureConfig: Record<
  FeatureType,
  {
    icon: React.ReactNode;
    label: string;
    maxLabel: (max: number) => string;
    formatValue: (value: number, max: number) => string;
  }
> = {
  job_search: {
    icon: <Search className="w-4 h-4" aria-hidden="true" />,
    label: "recherches",
    maxLabel: (max) => (max === Infinity ? "illimitees" : `/${max}`),
    formatValue: (value, max) =>
      max === Infinity ? "Illimite" : `${value}/${max}`,
  },
  job_view: {
    icon: <Eye className="w-4 h-4" aria-hidden="true" />,
    label: "offres",
    maxLabel: (max) => (max === Infinity ? "illimitees" : `/${max}`),
    formatValue: (value, max) =>
      max === Infinity ? "Illimite" : `${value}/${max}`,
  },
  cv_analysis: {
    icon: <FileText className="w-4 h-4" aria-hidden="true" />,
    label: "analyses",
    maxLabel: (max) => (max === Infinity ? "illimitees" : `/${max}`),
    formatValue: (value, max) =>
      max === Infinity ? "Illimite" : `${value}/${max}`,
  },
  assistant_messages: {
    icon: <Clock className="w-4 h-4" aria-hidden="true" />,
    label: "messages",
    maxLabel: (max) => (max === Infinity ? "illimités" : `/${max}`),
    formatValue: (value, max) =>
      max === Infinity ? "Illimité" : `${value}/${max}`,
  },
};

export function UsageCounter({
  feature,
  className = "",
  showIcon = true,
  showBar = true,
  compact = false,
}: UsageCounterProps) {
  const { getRemaining, limits, isFreePlan } = useSubscription();

  const remaining = getRemaining(feature);
  const config = featureConfig[feature];

  // Get max for this feature
  let max: number;
  switch (feature) {
    case "job_search":
      max = limits.job_searches_per_day;
      break;
    case "job_view":
      max = limits.jobs_visible;
      break;
    case "cv_analysis":
      max = limits.cv_analyses_per_day;
      break;
    case "assistant_messages":
      max = limits.assistant_messages_per_day;
      break;
    default:
      max = 0;
  }

  // Calculate percentage
  const used = max - remaining;
  const percentage = max === Infinity ? 0 : Math.min(100, (used / max) * 100);

  // Determine color based on remaining
  const getColor = () => {
    if (max === Infinity) return "text-green-600 bg-green-100";
    const ratio = remaining / max;
    if (ratio > 0.5) return "text-green-600 bg-green-100";
    if (ratio > 0.25) return "text-orange-600 bg-orange-100";
    return "text-red-600 bg-red-100";
  };

  const getBarColor = () => {
    if (max === Infinity) return "bg-green-500";
    const ratio = remaining / max;
    if (ratio > 0.5) return "bg-green-500";
    if (ratio > 0.25) return "bg-orange-500";
    return "bg-red-500";
  };

  if (!isFreePlan && max === Infinity) {
    // Don't show counter for unlimited features
    return null;
  }

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getColor()} ${className}`}
      >
        {showIcon && config.icon}
        {config.formatValue(used, max)}
      </span>
    );
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-white/90">
          {showIcon && config.icon}
          <span>
            {`${remaining} ${config.label}`}
            <span className="text-xs ml-1 text-white/60">
              {config.maxLabel(max)}
            </span>
          </span>
        </span>
      </div>

      {showBar && max !== Infinity && (
        <div
          className="h-2 bg-gray-100 rounded-full overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={remaining}
          aria-label={`${config.label}: ${remaining} restant(e)s sur ${max}`}
        >
          <div
            className={`h-full transition-all duration-300 ${getBarColor()}`}
            style={{ width: `${100 - percentage}%` }}
          />
        </div>
      )}
    </div>
  );
}

interface UsageSummaryProps {
  className?: string;
}

export function UsageSummary({ className = "" }: UsageSummaryProps) {
  const { plan, isFreePlan } = useSubscription();

  if (!isFreePlan) {
    return null;
  }

  return (
    <div className={className}>
      <h4 className="text-sm font-semibold mb-3 text-white/90">
        Utilisation du jour
      </h4>
      <div className="space-y-3">
        <UsageCounter feature="job_search" showBar />
        <UsageCounter feature="cv_analysis" showBar />
        <UsageCounter feature="assistant_messages" showBar />
      </div>
    </div>
  );
}
