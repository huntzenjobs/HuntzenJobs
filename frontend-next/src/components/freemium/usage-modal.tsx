"use client";

import { useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useSubscription } from "@/contexts/subscription-context";
import { QuotaResetTimer } from "@/components/freemium/usage-counter";
import {
  Crown,
  Sparkles,
  Zap,
  Gift,
  TrendingUp,
  FileText,
  MessageSquare,
  Briefcase,
  Bookmark,
  Clock,
  RefreshCw,
} from "lucide-react";
import { CareerScoreCard } from "@/components/career-score/career-score-card";
import { cn } from "@/lib/utils";
import { usePlansConfig } from "@/hooks/use-plans-config";
import { useTranslations } from "next-intl";

interface UsageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Visual-only config — names come from usePlansConfig() (DB)
const PLAN_VISUAL: Record<
  string,
  { icon: React.ReactNode; color: string; bgGradient: string }
> = {
  free: {
    icon: <Gift className="w-5 h-5" />,
    color: "bg-gray-500",
    bgGradient: "from-gray-400 to-gray-500",
  },
  starter: {
    icon: <Sparkles className="w-5 h-5" />,
    color: "bg-blue-500",
    bgGradient: "from-blue-500 to-blue-600",
  },
  pro: {
    icon: <Zap className="w-5 h-5" />,
    color: "bg-violet-500",
    bgGradient: "from-violet-500 to-purple-600",
  },
  premium: {
    icon: <Crown className="w-5 h-5" />,
    color: "bg-amber-500",
    bgGradient: "from-amber-500 to-orange-500",
  },
};

interface QuotaCardProps {
  title: string;
  icon: React.ReactNode;
  used: number;
  limit: number;
  unit?: string;
  color: string;
  t: (key: string, values?: Record<string, string | number>) => string;
}

function QuotaCard({
  title,
  icon,
  used,
  limit,
  unit = "",
  color,
  t,
}: QuotaCardProps) {
  const isUnlimited = limit === Infinity;
  const percentage = isUnlimited ? 0 : Math.min((used / limit) * 100, 100);
  const remaining = isUnlimited ? Infinity : Math.max(limit - used, 0);

  const getStatusColor = () => {
    if (isUnlimited) return "text-green-600";
    if (percentage < 50) return "text-green-600";
    if (percentage < 80) return "text-orange-600";
    return "text-red-600";
  };

  const getProgressColor = () => {
    if (isUnlimited) return "bg-green-500";
    if (percentage < 50) return "bg-green-500";
    if (percentage < 80) return "bg-orange-500";
    return "bg-red-500";
  };

  return (
    <div className="bg-white border-2 border-gray-100 rounded-xl p-4 space-y-3 hover:border-gray-200 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn("p-2 rounded-lg", color)}>{icon}</div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
        </div>
        <div className={cn("text-sm font-bold", getStatusColor())}>
          {isUnlimited ? "∞" : `${remaining}${unit}`}
        </div>
      </div>

      {!isUnlimited && (
        <>
          <Progress
            value={percentage}
            className="h-2"
            indicatorClassName={getProgressColor()}
          />
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              {used > 1
                ? t("quota.usedPlural", { used, unit })
                : t("quota.usedSingular", { used, unit })}
            </span>
            <span>{t("quota.outOf", { limit, unit })}</span>
          </div>
        </>
      )}

      {isUnlimited && (
        <p className="text-xs text-green-600 font-medium">
          {t("quota.unlimited")}
        </p>
      )}

      {!isUnlimited && remaining === 0 && (
        <p className="text-xs text-red-600 font-medium">{t("quota.reached")}</p>
      )}
    </div>
  );
}

export function UsageModal({ isOpen, onClose }: UsageModalProps) {
  const {
    plan,
    planName,
    limits,
    usage,
    openPricingModal,
    isFreePlan,
    refreshQuotas,
    isLoaded,
    savedJobsUsed,
    savedJobsLimit,
  } = useSubscription();

  const t = useTranslations("usageModal");

  // Refetch live quotas every time the modal opens
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      refreshQuotas();
    }
    prevOpenRef.current = isOpen;
  }, [isOpen, refreshQuotas]);

  const planVisual = PLAN_VISUAL[plan] ?? PLAN_VISUAL.free;
  const { getPlan } = usePlansConfig();
  const planData = getPlan(plan);

  const handleUpgrade = () => {
    onClose();
    openPricingModal();
  };

  // Assistant messages usage — use API limits (source of truth)
  const assistantMessagesUsed = usage?.assistantMessagesUsedToday ?? 0;
  const assistantMessagesLimit = limits.assistant_messages_per_day;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] md:max-w-2xl max-h-[90vh] overflow-y-auto bg-white text-gray-900">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl font-bold">
              {t("title")}
            </DialogTitle>
            {!isLoaded && (
              <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Current Plan */}
          <div
            className={cn(
              "p-5 rounded-xl border-2",
              isFreePlan
                ? "bg-gray-50 border-gray-200"
                : "bg-gradient-to-br from-violet-50 to-purple-50 border-violet-200",
            )}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "p-2.5 rounded-lg bg-gradient-to-br text-white",
                    planVisual.bgGradient,
                  )}
                >
                  {planVisual.icon}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    {t("planTitle", {
                      planName: planData?.display_name ?? plan,
                    })}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {isFreePlan ? t("freeSubtitle") : t("activeSubtitle")}
                  </p>
                </div>
              </div>
              {!isFreePlan && (
                <Badge className="bg-green-500">{t("activeBadge")}</Badge>
              )}
            </div>

            {isFreePlan && (
              <Button
                onClick={handleUpgrade}
                className="w-full mt-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                {t("upgradeCta")}
              </Button>
            )}
          </div>

          <Separator />

          {/* Career Score */}
          {/* Career Score — hidden until feature is ready
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-gray-900">
              {t("progressTitle")}
            </h3>
            <CareerScoreCard />
          </div>

          <Separator />
          */}

          {/* Daily Quotas */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                {t("dailyUsageTitle")}
              </h3>
              {plan !== "premium" && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Clock className="w-3.5 h-3.5" />
                  <QuotaResetTimer />
                </div>
              )}
            </div>

            <div className="grid gap-4">
              {/* CV Analysis */}
              <QuotaCard
                title={`${t("cvAnalysis")} ${t("perDay")}`}
                icon={<FileText className="w-4 h-4 text-white" />}
                used={usage?.cvAnalysesToday || 0}
                limit={limits.cv_analyses_per_day}
                color="bg-blue-500"
                t={t}
              />

              {/* Assistant Messages */}
              <QuotaCard
                title={`${t("assistantMessages")} ${t("perDay")}`}
                icon={<MessageSquare className="w-4 h-4 text-white" />}
                used={assistantMessagesUsed}
                limit={assistantMessagesLimit}
                unit=" msg"
                color="bg-violet-500"
                t={t}
              />

              {/* Job Searches */}
              <QuotaCard
                title={`${t("jobSearches")} ${t("perDay")}`}
                icon={<Briefcase className="w-4 h-4 text-white" />}
                used={usage?.searchesToday || 0}
                limit={limits.job_searches_per_day}
                color="bg-green-500"
                t={t}
              />
            </div>
          </div>

          {/* General Quotas (total, not daily) */}
          {savedJobsLimit !== -1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {t("generalUsageTitle")}
              </h3>
              <div className="grid gap-4">
                <QuotaCard
                  title={t("savedJobs")}
                  icon={<Bookmark className="w-4 h-4 text-white" />}
                  used={savedJobsUsed}
                  limit={savedJobsLimit}
                  color="bg-amber-500"
                  t={t}
                />
              </div>
            </div>
          )}

          {/* Upgrade CTA for free users */}
          {isFreePlan && (
            <>
              <Separator />
              <div className="bg-gradient-to-r from-violet-50 to-purple-50 border-2 border-violet-200 rounded-xl p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <Crown className="w-6 h-6 text-violet-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="font-semibold text-violet-900">
                      {t("unlockTitle")}
                    </h4>
                    <p className="text-sm text-violet-700">
                      {t("unlockDescription")}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={handleUpgrade}
                  className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
                >
                  {t("seePlans")}
                </Button>
              </div>
            </>
          )}

          {/* Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900">
              <span className="font-semibold">{t("tipLabel")}</span>{" "}
              {t("tipText")}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
