"use client";
import { useTranslations } from "next-intl";
import { UserCheck, UserPlus, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface Friend {
  status: "validated" | "registered";
  signed_up_at: string;
  name?: string;
}
interface ReferralFriendsListProps {
  friends: Friend[];
}

export function ReferralFriendsList({ friends }: ReferralFriendsListProps) {
  const t = useTranslations("referral.friends");

  function timeAgo(iso: string): string {
    if (!iso) return "";
    const date = new Date(iso);
    if (isNaN(date.getTime())) return "";
    const d = Math.floor((Date.now() - date.getTime()) / 86_400_000);
    if (d === 0) return t("today");
    if (d === 1) return t("yesterday");
    return t("daysAgo", { count: d });
  }

  if (friends.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Users className="w-8 h-8 mb-2 opacity-30" />
        <p className="text-sm">{t("emptyTitle")}</p>
        <p className="text-xs mt-1">{t("emptySubtitle")}</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {friends.map((f, i) => (
        <div
          key={i}
          className="flex items-center gap-3 py-2 border-b last:border-0"
        >
          <div
            className={cn(
              "p-1.5 rounded-full",
              f.status === "validated"
                ? "bg-green-50 text-green-600"
                : "bg-blue-50 text-blue-600",
            )}
          >
            {f.status === "validated" ? (
              <UserCheck className="w-4 h-4" />
            ) : (
              <UserPlus className="w-4 h-4" />
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">
              {f.name ||
                (f.status === "validated" ? t("validated") : t("registered"))}
            </p>
            <p className="text-xs text-muted-foreground">
              {timeAgo(f.signed_up_at)}
            </p>
          </div>
          <span
            className={cn(
              "text-xs font-medium px-2 py-0.5 rounded-full",
              f.status === "validated"
                ? "bg-green-100 text-green-700"
                : "bg-blue-100 text-blue-700",
            )}
          >
            {f.status === "validated"
              ? t("badgeValidated")
              : t("badgeRegistered")}
          </span>
        </div>
      ))}
    </div>
  );
}
