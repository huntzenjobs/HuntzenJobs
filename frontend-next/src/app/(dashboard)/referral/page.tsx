"use client";
import { useState, useEffect, useCallback } from "react";
import { Copy, Share2, Gift, CheckCircle } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { ReferralProgressBar } from "@/components/referral/referral-progress-bar";
import { ReferralTierCard } from "@/components/referral/referral-tier-card";
import { ReferralFriendsList } from "@/components/referral/referral-friends-list";
import { cn } from "@/lib/utils";

interface BoostStatus {
  referral_code: string; referral_link: string; total_clicks: number;
  total_signups: number; total_validated: number; current_tier: number;
  next_tier: number | null; friends_to_next: number;
  tiers: Array<{ friends: number; reward_type: string; label: string; days?: number; plan?: string; discount_percent?: number; }>;
  rewards_earned: Array<{ reward_type: string; reward_value: Record<string, unknown>; applied_at: string; }>;
  recent_referrals: Array<{ status: "validated" | "registered"; created_at: string; }>;
}

export default function ReferralPage() {
  const { session } = useAuth();
  const [status, setStatus] = useState<BoostStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/referrals/boost-status`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) setStatus(await res.json());
    } finally { setIsLoading(false); }
  }, [session?.access_token]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleCopy = async () => {
    if (!status?.referral_link) return;
    await navigator.clipboard.writeText(status.referral_link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsApp = () => {
    if (!status?.referral_link) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(`Rejoins HuntZen et trouve ton prochain job plus vite ! ${status.referral_link}`)}`, "_blank");
  };

  if (isLoading) {
    return <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">{[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-gray-100 animate-pulse" />)}</div>;
  }
  if (!status) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="text-center py-6 px-4 rounded-2xl bg-gradient-to-br from-blue-600/5 to-teal-500/10 border">
        <div className="inline-flex p-3 rounded-full bg-blue-600/10 mb-3"><Gift className="w-6 h-6 text-blue-600" /></div>
        <h1 className="text-2xl font-bold mb-1">HuntZen Boost</h1>
        <p className="text-sm text-muted-foreground">Invitez. Débloquez. Progressez.</p>
        <p className="text-xs text-muted-foreground mt-1">Parrainez des amis et débloquez des récompenses exclusives.</p>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <p className="text-sm font-semibold mb-3">Ton lien de parrainage</p>
        <div className="flex gap-2">
          <div className="flex-1 text-xs font-mono bg-muted rounded-lg px-3 py-2.5 truncate text-muted-foreground">{status.referral_link}</div>
          <button onClick={handleCopy} className={cn("px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5", copied ? "bg-green-100 text-green-700" : "bg-blue-600 text-white hover:bg-blue-700")}>
            {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copié !" : "Copier"}
          </button>
          <button onClick={handleWhatsApp} className="px-3 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm font-medium transition-colors flex items-center gap-1.5">
            <Share2 className="w-4 h-4" />WhatsApp
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4">
          {[{ label: "Clics", value: status.total_clicks }, { label: "Inscrits", value: status.total_signups }, { label: "Validés", value: status.total_validated }].map((s) => (
            <div key={s.label} className="text-center p-2 rounded-lg bg-muted/50">
              <p className="text-xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <p className="text-sm font-semibold mb-4">Ta progression</p>
        <ReferralProgressBar totalValidated={status.total_validated} currentTier={status.current_tier} nextTier={status.next_tier} friendsToNext={status.friends_to_next} tiers={status.tiers} />
      </div>

      <div>
        <p className="text-sm font-semibold mb-3">Récompenses</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {status.tiers.map((tier, i) => (
            <ReferralTierCard key={i} tier={tier} index={i} isUnlocked={status.total_validated >= tier.friends} isCurrent={i === status.current_tier} />
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <p className="text-sm font-semibold mb-4">Tes filleuls</p>
        <ReferralFriendsList friends={status.recent_referrals} />
      </div>
    </div>
  );
}
