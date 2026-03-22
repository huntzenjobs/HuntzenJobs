"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  User,
  CreditCard,
  Settings,
  UserCircle,
  Gift,
  Bell,
  Copy,
  Check,
  MousePointerClick,
  TrendingUp,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AvatarUpload } from "@/components/profile/avatar-upload";
import { ProfileForm } from "@/components/profile/profile-form";
import { SubscriptionCard } from "@/components/profile/subscription-card";
import { CareerScoreCard } from "@/components/career-score/career-score-card";
import { SettingsSection } from "@/components/profile/settings-section";
import { NotificationsSection } from "@/components/profile/notifications-section";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useSubscriptionApi } from "@/hooks/use-subscription-api";

interface ProfilePageClientProps {
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
  };
  profile: {
    id: string;
    email: string | null;
    full_name: string | null;
    avatar_url: string | null;
    preferred_language?: string;
    email_notifications?: boolean;
    newsletter_subscribed?: boolean;
  };
}

function ReferralWidget({
  userId,
  tProfile,
}: {
  userId: string;
  tProfile: (key: string) => string;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [stats, setStats] = useState({
    total_clicks: 0,
    total_signups: 0,
    total_conversions: 0,
  });
  const [tiers, setTiers] = useState<
    Array<{
      name: string;
      friends: number;
      reward_type: string;
      reward_value: number;
      description: string;
    }>
  >([]);
  const [friends, setFriends] = useState<
    Array<{ email: string; signed_up_at: string; converted: boolean }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const fetchCode = useCallback(async () => {
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || "";
      const res = await fetch(`${backendUrl}/api/referrals/boost-status`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setCode(data.referral_code);
      setStats({
        total_clicks: data.total_clicks ?? 0,
        total_signups: data.total_signups ?? 0,
        total_conversions: data.total_conversions ?? 0,
      });
      setTiers(data.tiers ?? []);
      setFriends(data.signups ?? []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCode();
  }, [fetchCode]);

  const referralLink = code
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/signup?ref=${code}`
    : "";

  const copyLink = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast.success(tProfile("toasts.linkCopied"));
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading)
    return <div className="h-32 animate-pulse bg-gray-100 rounded-xl" />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-black mb-2">
          {tProfile("referral.title")}
        </h2>
        <p className="text-gray-600">{tProfile("referral.description")}</p>
      </div>
      <Card className="border-2 border-[#00D9FF]/30 bg-[#00D9FF]/5">
        <CardContent className="pt-6 space-y-3">
          <p className="text-xs text-gray-500 font-medium">
            {tProfile("referral.yourLink")}
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-white border rounded-lg px-3 py-2 text-sm font-mono text-gray-700 overflow-hidden text-ellipsis whitespace-nowrap">
              {referralLink}
            </div>
            <Button
              size="sm"
              onClick={copyLink}
              className="shrink-0 bg-[#00D9FF] hover:bg-[#00C4EA] text-white"
            >
              {copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-gray-400">
            {tProfile("referral.code")}{" "}
            <span className="font-mono font-semibold">{code}</span>
          </p>
        </CardContent>
      </Card>
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            label: tProfile("referral.clicks"),
            value: stats.total_clicks,
            icon: MousePointerClick,
          },
          {
            label: tProfile("referral.signups"),
            value: stats.total_signups,
            icon: Gift,
          },
          {
            label: tProfile("referral.conversions"),
            value: stats.total_conversions,
            icon: TrendingUp,
          },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-4 text-center">
              <Icon className="h-5 w-5 mx-auto mb-1 text-[#00D9FF]" />
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {/* Tiers / Paliers */}
      {tiers.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">
            Paliers de récompenses
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {tiers.map((tier, i) => {
              const reached = stats.total_signups >= tier.friends;
              const current =
                !reached &&
                (i === 0 || stats.total_signups >= tiers[i - 1].friends);
              return (
                <Card
                  key={tier.name}
                  className={`border-2 ${reached ? "border-green-400 bg-green-50" : current ? "border-[#00D9FF] bg-[#00D9FF]/5" : "border-gray-200 opacity-60"}`}
                >
                  <CardContent className="pt-3 pb-3 text-center">
                    <p className="text-xs font-bold text-gray-500 uppercase">
                      {tier.name}
                    </p>
                    <p className="text-lg font-black mt-1">
                      {tier.friends} {tier.friends > 1 ? "amis" : "ami"}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {tier.description}
                    </p>
                    {reached && (
                      <p className="text-xs text-green-600 font-semibold mt-1">
                        ✓ Atteint
                      </p>
                    )}
                    {current && (
                      <p className="text-xs text-[#00D9FF] font-semibold mt-1">
                        En cours
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Liste des filleuls */}
      {friends.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">
            Vos filleuls ({friends.length})
          </h3>
          <div className="space-y-2">
            {friends.map((f, i) => (
              <div
                key={i}
                className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#00D9FF]/10 flex items-center justify-center text-xs font-bold text-[#00D9FF]">
                    {(f.email || "?")[0].toUpperCase()}
                  </div>
                  <span className="text-sm text-gray-700">
                    {f.email || "Utilisateur"}
                  </span>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${f.converted ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}`}
                >
                  {f.converted ? "Converti" : "Inscrit"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <strong>{tProfile("referral.howItWorks")}</strong>{" "}
        {tProfile("referral.howItWorksDescription")}
      </div>
    </div>
  );
}

export function ProfilePageClient({ user, profile }: ProfilePageClientProps) {
  const tProfile = useTranslations("profile");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [fullName, setFullName] = useState(profile.full_name || "");
  const { subscription } = useSubscriptionApi();
  const isPastDue = subscription?.status === "past_due";
  const cancelAtPeriodEnd = subscription?.cancel_at_period_end ?? false;
  const hasSubscriptionAlert = isPastDue || cancelAtPeriodEnd;

  // Handle avatar upload success
  const handleAvatarUpload = (newUrl: string) => {
    setAvatarUrl(newUrl);
  };

  // Handle profile save success
  const handleProfileSave = (newFullName: string) => {
    setFullName(newFullName);
  };

  return (
    <div className="space-y-6">
      {/* Hero Header - HuntZen Style */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-gradient-to-br from-white to-gray-50 p-8 rounded-2xl border border-gray-200 shadow-sm"
      >
        <div className="flex items-center gap-4 mb-3">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#00D9FF] to-[#00C4EA] flex items-center justify-center shadow-lg shadow-[#00D9FF]/30"
          >
            <UserCircle className="w-7 h-7 text-white" />
          </motion.div>
          <h1 className="text-4xl font-black text-black">
            {tProfile("pageTitle")}
          </h1>
        </div>
        <p className="text-base text-gray-700 leading-relaxed">
          {tProfile("pageDescription")}
        </p>
      </motion.div>

      {/* Main Content with Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white rounded-2xl border-2 border-gray-200 shadow-sm"
      >
        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0">
            <TabsTrigger
              value="profile"
              className="data-[state=active]:border-b-2 data-[state=active]:border-[#00D9FF] rounded-none px-6 py-4 transition-all data-[state=active]:text-[#00D9FF] font-medium"
            >
              <User className="w-4 h-4 mr-2" />
              {tProfile("tabs.profile")}
            </TabsTrigger>
            <TabsTrigger
              value="subscription"
              className="data-[state=active]:border-b-2 data-[state=active]:border-[#00D9FF] rounded-none px-6 py-4 transition-all data-[state=active]:text-[#00D9FF] font-medium"
            >
              <CreditCard className="w-4 h-4 mr-2" />
              {tProfile("tabs.subscription")}
              {hasSubscriptionAlert && (
                <span
                  className={`ml-2 inline-flex h-2 w-2 rounded-full ${isPastDue ? "bg-red-500" : "bg-amber-400"}`}
                  aria-label={
                    isPastDue
                      ? tProfile("alerts.paymentFailed")
                      : tProfile("alerts.cancellationScheduled")
                  }
                />
              )}
            </TabsTrigger>
            <TabsTrigger
              value="settings"
              className="data-[state=active]:border-b-2 data-[state=active]:border-[#00D9FF] rounded-none px-6 py-4 transition-all data-[state=active]:text-[#00D9FF] font-medium"
            >
              <Settings className="w-4 h-4 mr-2" />
              {tProfile("tabs.settings")}
            </TabsTrigger>
            <TabsTrigger
              value="notifications"
              className="data-[state=active]:border-b-2 data-[state=active]:border-[#00D9FF] rounded-none px-6 py-4 transition-all data-[state=active]:text-[#00D9FF] font-medium"
            >
              <Bell className="w-4 h-4 mr-2" />
              {tProfile("tabs.notifications")}
            </TabsTrigger>
            {/* Progression tab — hidden until feature is ready
            <TabsTrigger
              value="progression"
              className="data-[state=active]:border-b-2 data-[state=active]:border-[#00D9FF] rounded-none px-6 py-4 transition-all data-[state=active]:text-[#00D9FF] font-medium"
            >
              <TrendingUp className="w-4 h-4 mr-2" />
              {tProfile("tabs.progression")}
            </TabsTrigger>
            */}
            <TabsTrigger
              value="referral"
              className="data-[state=active]:border-b-2 data-[state=active]:border-[#00D9FF] rounded-none px-6 py-4 transition-all data-[state=active]:text-[#00D9FF] font-medium"
            >
              <Gift className="w-4 h-4 mr-2" />
              {tProfile("tabs.referral")}
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="p-8 space-y-8">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
              {/* Avatar Section */}
              <div className="lg:col-span-1 flex justify-center lg:justify-start">
                <AvatarUpload
                  userId={user.id}
                  currentAvatarUrl={avatarUrl}
                  userName={fullName}
                  userEmail={user.email}
                  onUploadSuccess={handleAvatarUpload}
                  size="xl"
                />
              </div>

              {/* Profile Form Section */}
              <div className="lg:col-span-2">
                <ProfileForm
                  userId={user.id}
                  initialFullName={fullName}
                  email={user.email}
                  emailVerified={user.emailVerified}
                  onSaveSuccess={handleProfileSave}
                />
              </div>
            </motion.div>
          </TabsContent>

          {/* Subscription Tab */}
          <TabsContent value="subscription" className="p-8">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="max-w-3xl space-y-6"
            >
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-black mb-2">
                  {tProfile("subscriptionSection.title")}
                </h2>
                <p className="text-gray-600">
                  {tProfile("subscriptionSection.description")}
                </p>
              </div>

              {/* Subscription Card with Plan & Quotas */}
              <SubscriptionCard />
            </motion.div>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="p-8">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="max-w-3xl"
            >
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-black mb-2">
                  {tProfile("settingsSection.title")}
                </h2>
                <p className="text-gray-600">
                  {tProfile("settingsSection.description")}
                </p>
              </div>

              <SettingsSection
                userId={user.id}
                initialSettings={{
                  preferred_language: profile.preferred_language,
                  email_notifications: profile.email_notifications,
                  newsletter_subscribed: profile.newsletter_subscribed,
                }}
              />
            </motion.div>
          </TabsContent>
          {/* Notifications Tab */}
          <TabsContent value="notifications" className="p-8">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="max-w-2xl"
            >
              <NotificationsSection />
            </motion.div>
          </TabsContent>

          <TabsContent value="progression" className="p-8">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="max-w-2xl"
            >
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-black mb-2">
                  {tProfile("progressionSection.title")}
                </h2>
                <p className="text-gray-600">
                  {tProfile("progressionSection.description")}
                </p>
              </div>
              <CareerScoreCard />
            </motion.div>
          </TabsContent>

          <TabsContent value="referral" className="p-8">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="max-w-2xl"
            >
              <ReferralWidget userId={user.id} tProfile={tProfile} />
            </motion.div>
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Help Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-[#00D9FF]/10 border-2 border-[#00D9FF]/30 rounded-2xl p-6"
      >
        <h3 className="font-bold text-black mb-2">{tProfile("help.title")}</h3>
        <p className="text-gray-700 text-sm mb-4">
          {tProfile("help.description")}
        </p>
        <div className="flex gap-3">
          <a
            href="mailto:support@huntzen.com"
            className="text-sm text-[#00D9FF] hover:text-black hover:underline font-medium transition-colors"
          >
            support@huntzen.com
          </a>
          <span className="text-gray-400">&bull;</span>
          <a
            href="/help"
            className="text-sm text-[#00D9FF] hover:text-black hover:underline font-medium transition-colors"
          >
            {tProfile("help.helpCenter")}
          </a>
        </div>
      </motion.div>
    </div>
  );
}
