"use client";
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
  const maxFriends = tiers[tiers.length - 1]?.friends ?? 10;
  const progress = Math.min(100, (totalValidated / maxFriends) * 100);
  return (
    <div className="space-y-3">
      <div className="flex justify-between text-xs text-muted-foreground">
        {tiers.map((t) => (
          <span key={t.friends} className={cn("font-medium", totalValidated >= t.friends && "text-teal-500")}>{t.friends}</span>
        ))}
      </div>
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-blue-600 to-teal-500 rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
      </div>
      {nextTier !== null && friendsToNext > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Encore <span className="font-semibold text-foreground">{friendsToNext} ami{friendsToNext > 1 ? "s" : ""}</span> pour débloquer {tiers[nextTier]?.label}
        </p>
      )}
      {friendsToNext === 0 && <p className="text-xs text-green-600 font-medium text-center">Tous les paliers débloqués !</p>}
    </div>
  );
}
