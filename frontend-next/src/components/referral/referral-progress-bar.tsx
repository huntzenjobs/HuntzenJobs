"use client";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface Tier { friends: number; label: string; }
interface ReferralProgressBarProps {
  totalValidated: number;
  currentTier: number;
  nextTier: number | null;
  friendsToNext: number;
  tiers: Tier[];
}

export function ReferralProgressBar({ totalValidated, nextTier, friendsToNext, tiers }: ReferralProgressBarProps) {
  const t = useTranslations("referral.progress");
  const maxFriends = tiers[tiers.length - 1]?.friends ?? 10;
  const progress = Math.min(100, (totalValidated / maxFriends) * 100);
  return (
    <div className="space-y-3">
      <div className="flex justify-between text-xs text-muted-foreground">
        {tiers.map((tier) => (
          <span key={tier.friends} className={cn("font-medium", totalValidated >= tier.friends && "text-teal-500")}>{tier.friends}</span>
        ))}
      </div>
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-blue-600 to-teal-500 rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
      </div>
      {nextTier !== null && friendsToNext > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          {t("remaining", { count: friendsToNext, label: tiers[nextTier]?.label })}
        </p>
      )}
      {friendsToNext === 0 && <p className="text-xs text-green-600 font-medium text-center">{t("allUnlocked")}</p>}
    </div>
  );
}
