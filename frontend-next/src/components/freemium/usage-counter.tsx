"use client";

import { useSubscription } from "@/contexts/subscription-context";
import { FeatureType } from "@/hooks/use-freemium-limits";
import {
  Bookmark,
  Clock,
  Eye,
  FileText,
  Search,
  Target,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

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
  ats_score: {
    icon: <FileText className="w-4 h-4" aria-hidden="true" />,
    labelKey: "features.atsScore.label",
    maxLabel: (max, t) =>
      max === Infinity ? t("features.unlimited") : `/${max}${t("perDay")}`,
    formatValue: (value, max, t) =>
      max === Infinity
        ? t("features.unlimitedShort")
        : `${value}/${max}${t("perDay")}`,
  },
  matching_score: {
    icon: <Target className="w-4 h-4" aria-hidden="true" />,
    labelKey: "features.matchingScore.label",
    maxLabel: (max, t) =>
      max === Infinity ? t("features.unlimited") : `/${max}${t("perDay")}`,
    formatValue: (value, max, t) =>
      max === Infinity
        ? t("features.unlimitedShort")
        : `${value}/${max}${t("perDay")}`,
  },
  saved_jobs: {
    icon: <Bookmark className="w-4 h-4" aria-hidden="true" />,
    labelKey: "features.savedJobs.label",
    maxLabel: (max, t) =>
      max === Infinity ? t("features.unlimited") : `/${max}`,
    formatValue: (value, max, t) =>
      max === Infinity ? t("features.unlimitedShort") : `${value}/${max}`,
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
  cv_adapt: {
    icon: <FileText className="w-4 h-4" aria-hidden="true" />,
    labelKey: "features.cvAdapt.label",
    maxLabel: (max, t) =>
      max === Infinity ? t("features.unlimited") : `/${max}${t("perDay")}`,
    formatValue: (value, max, t) =>
      max === Infinity
        ? t("features.unlimitedShort")
        : `${value}/${max}${t("perDay")}`,
  },
  cover_letter: {
    icon: <FileText className="w-4 h-4" aria-hidden="true" />,
    labelKey: "features.coverLetter.label",
    maxLabel: (max, t) =>
      max === Infinity ? t("features.unlimited") : `/${max}${t("perDay")}`,
    formatValue: (value, max, t) =>
      max === Infinity
        ? t("features.unlimitedShort")
        : `${value}/${max}${t("perDay")}`,
  },
  coach: {
    icon: <Clock className="w-4 h-4" aria-hidden="true" />,
    labelKey: "features.coach.label",
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
  const { getRemaining, limits, isFreePlan, quotas } = useSubscription();
  const tUsage = useTranslations("usageCounter");

  const remaining = getRemaining(feature);
  const config = featureConfig[feature];

  // Get max for this feature (from limits or directly from API quotas)
  let max: number;
  switch (feature) {
    case "job_search":
      max = limits.job_searches_per_day;
      break;
    case "job_view":
      max = limits.jobs_visible;
      break;
    case "ats_score":
      max = limits.ats_scores_per_day;
      break;
    case "matching_score":
      max = limits.matching_scores_per_day;
      break;
    case "assistant_messages":
      max = limits.assistant_messages_per_day;
      break;
    case "saved_jobs":
      max = limits.saved_jobs_per_day;
      break;
    case "recruiter_search": {
      const q = quotas?.recruiter_search;
      if (q) {
        max = q.limit === -1 ? Infinity : q.limit;
      } else {
        max = limits.recruiter_searches_per_day;
      }
      break;
    }
    case "cv_adapt": {
      const q = quotas?.cv_adapt;
      max = q ? (q.limit === -1 ? Infinity : q.limit) : 0;
      break;
    }
    case "cover_letter": {
      const q = quotas?.cover_letter;
      max = q ? (q.limit === -1 ? Infinity : q.limit) : 0;
      break;
    }
    default:
      max = 0;
  }

  // Calculate percentage
  const used =
    max && remaining !== undefined ? Math.max(0, max - remaining) : 0;
  const percentage =
    max === Infinity || !max ? 0 : Math.min(100, (used / max) * 100);

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
        {max === Infinity ? tUsage("features.unlimitedShort") : remaining}
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

export function UsageSummary({ className = "" }: UsageSummaryProps) {
  const { plan, isFreePlan } = useSubscription();
  const tUsage = useTranslations("usageCounter");

  // Paid unlimited plans (pro/premium) don't need the summary
  if (plan === "pro" || plan === "premium") return null;

  return (
    <div className={className}>
      <>
        <h4 className="text-sm font-semibold mb-3 text-white/90">
          {tUsage("dailyUsage")}
        </h4>
        <div className="space-y-3">
          <UsageCounter feature="job_search" showBar />
          <UsageCounter feature="ats_score" showBar />
          <UsageCounter feature="matching_score" showBar />
          <UsageCounter feature="cv_adapt" showBar />
          <UsageCounter feature="assistant_messages" showBar />
          <UsageCounter feature="recruiter_search" showBar />
          <UsageCounter feature="cover_letter" showBar />
        </div>
        <div className="flex items-center gap-1.5 mt-2 mb-3 text-xs text-white/50">
          <Clock className="w-3 h-3" />
          <QuotaResetTimer />
        </div>
        <h4 className="text-sm font-semibold mb-3 text-white/90">
          {tUsage("generalUsage")}
        </h4>
        <div className="space-y-3">
          <UsageCounter feature="saved_jobs" showBar />
        </div>
      </>
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
