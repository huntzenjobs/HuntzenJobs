"use client";
import { useState, useEffect, useCallback } from "react";
import { Copy, Share2, Gift, CheckCircle } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { ReferralProgressBar } from "@/components/referral/referral-progress-bar";
import { ReferralTierCard } from "@/components/referral/referral-tier-card";
import { ReferralFriendsList } from "@/components/referral/referral-friends-list";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface BoostStatus {
  referral_code: string;
  referral_link: string;
  total_clicks: number;
  total_signups: number;
  total_validated: number;
  current_tier: number;
  next_tier: number | null;
  friends_to_next: number;
  tiers: Array<{
    friends: number;
    reward_type: string;
    label: string;
    days?: number;
    plan?: string;
    discount_percent?: number;
  }>;
  rewards_earned: Array<{
    reward_type: string;
    reward_value: Record<string, unknown>;
    applied_at: string;
  }>;
  recent_referrals: Array<{
    status: "validated" | "registered";
    created_at: string;
  }>;
}

export default function ReferralPage() {
  const t = useTranslations("referral");
  const { session } = useAuth();
  const [status, setStatus] = useState<BoostStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!session?.access_token) {
      setIsLoading(false);
      return;
    }
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/referrals/boost-status`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );
      if (res.ok) setStatus(await res.json());
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleCopy = async () => {
    if (!status?.referral_link) return;
    await navigator.clipboard.writeText(status.referral_link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsApp = () => {
    if (!status?.referral_link) return;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(t("link.whatsappMessage", { link: status.referral_link }))}`,
      "_blank",
    );
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }
  if (!status) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-muted-foreground mb-4">{t("errorLoad")}</p>
        <button
          onClick={fetchStatus}
          className="text-sm text-blue-600 hover:underline"
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="text-center py-6 px-4 rounded-2xl bg-gradient-to-br from-blue-600/5 to-teal-500/10 border">
        <div className="inline-flex p-3 rounded-full bg-blue-600/10 mb-3">
          <Gift className="w-6 h-6 text-blue-600" />
        </div>
        <h1 className="text-2xl font-bold mb-1">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("tagline")}</p>
        <p className="text-xs text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <p className="text-sm font-semibold mb-3">{t("link.title")}</p>
        <div className="flex gap-2">
          <div className="flex-1 text-xs font-mono bg-muted rounded-lg px-3 py-2.5 truncate text-muted-foreground">
            {status?.referral_link}
          </div>
          <button
            onClick={handleCopy}
            className={cn(
              "px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
              copied
                ? "bg-green-100 text-green-700"
                : "bg-blue-600 text-white hover:bg-blue-700",
            )}
          >
            {copied ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            {copied ? t("link.copied") : t("link.copy")}
          </button>
          <button
            onClick={handleWhatsApp}
            className="px-3 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm font-medium transition-colors flex items-center gap-1.5"
          >
            <Share2 className="w-4 h-4" />
            {t("link.whatsapp")}
          </button>
          <button
            onClick={() => {
              if (!status?.referral_link) return;
              window.open(
                `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(status.referral_link)}`,
                "_blank",
                "noopener,noreferrer",
              );
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0A66C2] text-white text-sm font-medium hover:bg-[#004182] transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
            {t("link.linkedin")}
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4">
          {[
            { label: t("stats.clicks"), value: status.total_clicks },
            { label: t("stats.signups"), value: status.total_signups },
            { label: t("stats.validated"), value: status.total_validated },
          ].map((s) => (
            <div
              key={s.label}
              className="text-center p-2 rounded-lg bg-muted/50"
            >
              <p className="text-xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <p className="text-sm font-semibold mb-4">{t("sections.progress")}</p>
        <ReferralProgressBar
          totalValidated={status.total_validated}
          currentTier={status.current_tier}
          nextTier={status.next_tier}
          friendsToNext={status.friends_to_next}
          tiers={status.tiers}
        />
      </div>

      <div>
        <p className="text-sm font-semibold mb-3">{t("sections.rewards")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {status.tiers.map((tier, i) => (
            <ReferralTierCard
              key={i}
              tier={tier}
              index={i}
              isUnlocked={status.total_validated >= tier.friends}
              isCurrent={i === status.current_tier}
            />
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <p className="text-sm font-semibold mb-4">{t("sections.friends")}</p>
        <ReferralFriendsList friends={status.recent_referrals} />
      </div>
    </div>
  );
}
