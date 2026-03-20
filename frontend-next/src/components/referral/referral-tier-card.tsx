"use client";
import { useTranslations } from "next-intl";
import { CheckCircle2, Lock, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Tier { friends: number; reward_type: string; label: string; days?: number; plan?: string; discount_percent?: number; }
interface ReferralTierCardProps { tier: Tier; index: number; isUnlocked: boolean; isCurrent: boolean; }

export function ReferralTierCard({ tier, index, isUnlocked, isCurrent }: ReferralTierCardProps) {
  const t = useTranslations("referral.tier");
  return (
    <div className={cn("rounded-xl border p-4 transition-all", isUnlocked && "border-teal-400/40 bg-teal-50/30", isCurrent && "ring-2 ring-teal-400", !isUnlocked && "opacity-60")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground mb-1">{t("label", { index: index + 1, count: tier.friends })}</p>
          <p className="text-sm font-semibold">{tier.label}</p>
        </div>
        <div className="flex-shrink-0 mt-0.5">
          {isUnlocked ? <CheckCircle2 className="w-5 h-5 text-teal-500" /> : isCurrent ? <Clock className="w-5 h-5 text-amber-500" /> : <Lock className="w-5 h-5 text-muted-foreground/50" />}
        </div>
      </div>
      <p className="mt-2 text-xs font-medium">
        {isUnlocked ? <span className="text-teal-600">{t("reached")}</span> : isCurrent ? <span className="text-amber-500">{t("inProgress")}</span> : <span className="text-muted-foreground">{t("locked")}</span>}
      </p>
    </div>
  );
}
