"use client";

import { useEffect, useState } from "react";
import { useSubscription } from "@/contexts/subscription-context";
import { FeatureType } from "@/hooks/use-freemium-limits";
import { Search, FileText, Clock, Eye, Users, Bookmark } from "lucide-react";
import { useTranslations } from "next-intl";

interface UsageCounterProps {
  feature: FeatureType;
  className?: string;
  showIcon?: boolean;
  showBar?: boolean;
  compact?: boolean;
}

interface FeatureConfig {
  icon: React.ReactNode;
  labelKey: string;
  maxLabel: (max: number, t: (key: string) => string) => string;
  formatValue: (
    value: number,
    max: number,
    t: (key: string) => string,
  ) => string;
}

const featureConfig: Record<FeatureType, FeatureConfig> = {
  job_search: {
    icon: <Search className="w-4 h-4" aria-hidden="true" />,
    labelKey: "features.jobSearch.label",
    maxLabel: (max, t) =>
      max === Infinity ? t("features.unlimited") : `/${max}${t("perDay")}`,
    formatValue: (value, max, t) =>
      max === Infinity
        ? t("features.unlimitedShort")
        : `${value}/${max}${t("perDay")}`,
  },
  job_view: {
    icon: <Eye className="w-4 h-4" aria-hidden="true" />,
    labelKey: "features.jobView.label",
    maxLabel: (max, t) =>
      max === Infinity ? t("features.unlimited") : `/${max}${t("perDay")}`,
    formatValue: (value, max, t) =>
      max === Infinity
        ? t("features.unlimitedShort")
        : `${value}/${max}${t("perDay")}`,
  },
  cv_analysis: {
    icon: <FileText className="w-4 h-4" aria-hidden="true" />,
    labelKey: "features.cvAnalysis.label",
    maxLabel: (max, t) =>
      max === Infinity ? t("features.unlimited") : `/${max}${t("perDay")}`,
    formatValue: (value, max, t) =>
      max === Infinity
        ? t("features.unlimitedShort")
        : `${value}/${max}${t("perDay")}`,
  },
  assistant_messages: {
    icon: <Clock className="w-4 h-4" aria-hidden="true" />,
    labelKey: "features.assistantMessages.label",
    maxLabel: (max, t) =>
      max === Infinity ? t("features.unlimited") : `/${max}${t("perDay")}`,
    formatValue: (value, max, t) =>
      max === Infinity
        ? t("features.unlimitedShort")
        : `${value}/${max}${t("perDay")}`,
  },
  recruiter_search: {
    icon: <Users className="w-4 h-4" aria-hidden="true" />,
    labelKey: "features.recruiterSearch.label",
    maxLabel: (max, t) =>
      max === Infinity ? t("features.unlimited") : `/${max}${t("perDay")}`,
    formatValue: (value, max, t) =>
      max === Infinity
        ? t("features.unlimitedShort")
        : `${value}/${max}${t("perDay")}`,
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
  const tUsage = useTranslations("usageCounter");

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
    case "recruiter_search":
      max = 0;
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
        {config.formatValue(used, max, tUsage)}
      </span>
    );
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-white/90">
          {showIcon && config.icon}
          <span>
            {`${remaining} ${tUsage(config.labelKey)}`}
            <span className="text-xs ml-1 text-white/60">
              {config.maxLabel(max, tUsage)}
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
          aria-label={tUsage("aria.remaining", {
            label: tUsage(config.labelKey),
            remaining: String(remaining),
            max: String(max),
          })}
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

function SavedJobsCounter() {
  const { savedJobsUsed, savedJobsLimit } = useSubscription();
  const tUsage = useTranslations("usageCounter");

  const isUnlimited = savedJobsLimit === -1;
  if (isUnlimited) return null;

  const remaining = Math.max(0, savedJobsLimit - savedJobsUsed);
  const percentage =
    savedJobsLimit > 0
      ? Math.min(100, (savedJobsUsed / savedJobsLimit) * 100)
      : 0;

  const getBarColor = () => {
    const ratio = remaining / savedJobsLimit;
    if (ratio > 0.5) return "bg-green-500";
    if (ratio > 0.25) return "bg-orange-500";
    return "bg-red-500";
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-white/90">
          <Bookmark className="w-4 h-4" aria-hidden="true" />
          <span>
            {`${remaining} ${tUsage("features.savedJobs.label")}`}
            <span className="text-xs ml-1 text-white/60">
              /{savedJobsLimit}
            </span>
          </span>
        </span>
      </div>
      <div
        className="h-2 bg-gray-100 rounded-full overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={savedJobsLimit}
        aria-valuenow={remaining}
      >
        <div
          className={`h-full transition-all duration-300 ${getBarColor()}`}
          style={{ width: `${100 - percentage}%` }}
        />
      </div>
    </div>
  );
}

export function UsageSummary({ className = "" }: UsageSummaryProps) {
  const { plan, isFreePlan } = useSubscription();
  const tUsage = useTranslations("usageCounter");

  // Plan Carrière (premium) = tout illimité, pas besoin du timer
  if (plan === "premium") return null;

  return (
    <div className={className}>
      {(isFreePlan || plan === "starter") && (
        <>
          <h4 className="text-sm font-semibold mb-3 text-white/90">
            {tUsage("dailyUsage")}
          </h4>
          <div className="space-y-3">
            <UsageCounter feature="job_search" showBar />
            <UsageCounter feature="cv_analysis" showBar />
            <UsageCounter feature="assistant_messages" showBar />
          </div>
          <div className="flex items-center gap-1.5 mt-2 mb-3 text-xs text-white/50">
            <Clock className="w-3 h-3" />
            <QuotaResetTimer />
          </div>
          <h4 className="text-sm font-semibold mb-3 text-white/90">
            {tUsage("generalUsage")}
          </h4>
          <div className="space-y-3">
            <SavedJobsCounter />
          </div>
        </>
      )}
    </div>
  );
}

export function QuotaResetTimer({ className = "" }: { className?: string }) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    const compute = () => {
      const now = new Date();
      const next = new Date();
      next.setUTCHours(24, 0, 0, 0);
      const diff = next.getTime() - now.getTime();
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      setLabel(`Recharge dans ${h}h ${m}m`);
    };
    compute();
    const id = setInterval(compute, 60_000);
    return () => clearInterval(id);
  }, []);

  return <span className={className}>{label}</span>;
}
