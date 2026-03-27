"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Eye,
  GraduationCap,
  Briefcase,
  Users,
  Share2,
  Megaphone,
  MoreHorizontal,
  ArrowLeft,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PromoCodeInput,
  type CodeValidationResult,
} from "@/components/auth/promo-code-input";

const TOTAL_STEPS = 7;

interface RadioCardProps {
  selected: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  label: string;
}

function RadioCard({ selected, onClick, icon, label }: RadioCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all duration-200",
        selected
          ? "border-[#00D9FF] bg-[#00D9FF]/10 text-white"
          : "border-white/10 bg-white/5 text-gray-300 hover:border-white/30 hover:bg-white/10",
      )}
    >
      {icon && (
        <span
          className={cn(
            "flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center",
            selected
              ? "bg-[#00D9FF]/20 text-[#00D9FF]"
              : "bg-white/10 text-gray-400",
          )}
        >
          {icon}
        </span>
      )}
      <span className="font-medium text-sm">{label}</span>
    </button>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const progress = (current / total) * 100;
  return (
    <div className="w-full">
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-[#00D9FF] rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
        />
      </div>
    </div>
  );
}

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -80 : 80,
    opacity: 0,
  }),
};

function OnboardingWizard() {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo");

  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [loading, setLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  // Step 1 - Identity
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  // Step 2 - Situation
  const [situation, setSituation] = useState("");

  // Step 3 - Job search
  const [jobTitle, setJobTitle] = useState("");
  const [location, setLocation] = useState("");

  // Step 4 - Experience
  const [experience, setExperience] = useState("");

  // Step 5 - Discovery
  const [discoverySource, setDiscoverySource] = useState("");

  // User ID for referral registration
  const [userId, setUserId] = useState<string | null>(null);

  // Guard: if already onboarded, redirect
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.replace("/login");
          return;
        }

        if (!cancelled) setUserId(user.id);

        if (user.user_metadata?.onboarding_completed) {
          router.replace("/jobs");
        } else {
          // Pre-fill name from user_metadata if available
          const fullName = user.user_metadata?.full_name || "";
          if (fullName && !cancelled) {
            const parts = fullName.trim().split(" ");
            setFirstName(parts[0] || "");
            setLastName(parts.slice(1).join(" ") || "");
          }
          if (!cancelled) setIsChecking(false);
        }
      } catch {
        if (!cancelled) setIsChecking(false);
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const goNext = useCallback(() => {
    if (step < TOTAL_STEPS) {
      setDirection(1);
      setStep((s) => s + 1);
    }
  }, [step]);

  const goPrev = useCallback(() => {
    if (step > 1) {
      setDirection(-1);
      setStep((s) => s - 1);
    }
  }, [step]);

  const canProceed = useCallback(() => {
    switch (step) {
      case 1:
        return firstName.trim().length > 0 && lastName.trim().length > 0;
      case 2:
        return situation.length > 0;
      case 3:
        return true; // optional
      case 4:
        return experience.length > 0;
      case 5:
        return discoverySource.length > 0;
      case 6:
        return true; // promo code step, optional
      case 7:
        return true; // plans step, always can proceed
      default:
        return false;
    }
  }, [step, firstName, lastName, situation, experience, discoverySource]);

  // Navigate to final destination (after step 6 or skip)
  const navigateToApp = useCallback(() => {
    if (redirectTo && redirectTo.startsWith("/")) {
      router.push(redirectTo);
    } else {
      const params = new URLSearchParams();
      if (jobTitle.trim()) params.set("q", jobTitle.trim());
      if (location.trim()) params.set("location", location.trim());
      router.push(`/jobs${params.toString() ? `?${params}` : ""}`);
    }
  }, [redirectTo, jobTitle, location, router]);

  const handleComplete = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

      // 1. Save to user_metadata
      await supabase.auth.updateUser({
        data: {
          onboarding_completed: true,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          full_name: fullName,
          situation,
          job_title: jobTitle.trim(),
          location: location.trim(),
          experience,
          discovery_source: discoverySource,
        },
      });

      // 2. Update profiles table
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("profiles")
          .update({ full_name: fullName })
          .eq("id", user.id);
      }

      // 3. POST to backend for admin analytics (fire-and-forget)
      if (user) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const backendUrl =
          process.env.NEXT_PUBLIC_API_URL ||
          process.env.NEXT_PUBLIC_BACKEND_URL ||
          "";
        fetch(`${backendUrl}/api/auth/onboarding-data`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || ""}`,
          },
          body: JSON.stringify({
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            situation,
            job_title: jobTitle.trim(),
            location: location.trim(),
            experience,
            discovery_source: discoverySource,
          }),
        }).catch(() => {});
      }

      // 4. Go to step 6 (promo code) instead of redirecting
      setLoading(false);
      setDirection(1);
      setStep(6);
    } catch {
      router.push("/jobs");
    }
  }, [
    firstName,
    lastName,
    situation,
    jobTitle,
    location,
    experience,
    discoverySource,
    redirectTo,
    router,
  ]);

  const handleSkip = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      await supabase.auth.updateUser({
        data: { onboarding_completed: true },
      });
      if (redirectTo && redirectTo.startsWith("/")) {
        router.push(redirectTo);
      } else {
        router.push("/jobs");
      }
    } catch {
      router.push("/jobs");
    }
  }, [redirectTo, router]);

  if (isChecking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900" />
    );
  }

  const isLastStep = step === TOTAL_STEPS;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-3xl font-black text-white">
            Hunt<span className="text-[#00D9FF]">Zen</span>
          </span>
        </div>

        {/* Progress */}
        <div className="mb-6 space-y-2">
          <ProgressBar current={step} total={TOTAL_STEPS} />
          <p className="text-xs text-gray-500 text-center">
            {t("step", { current: step, total: TOTAL_STEPS })}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white/5 backdrop-blur-md rounded-3xl p-8 border border-white/10 overflow-hidden">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              {/* Step 1 - Identity */}
              {step === 1 && (
                <div className="space-y-5">
                  <div>
                    <h1 className="text-2xl font-black text-white mb-1">
                      {t("identity.title")}
                    </h1>
                    <p className="text-gray-400 text-sm">
                      {t("identity.subtitle")}
                    </p>
                  </div>
                  <div>
                    <Label
                      htmlFor="firstName"
                      className="text-gray-300 font-medium mb-2 block"
                    >
                      {t("identity.firstName")}
                    </Label>
                    <Input
                      id="firstName"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder={t("identity.firstNamePlaceholder")}
                      className="bg-white/10 border-white/20 text-white placeholder:text-gray-500 h-12 text-base focus:border-[#00D9FF] focus:ring-[#00D9FF]"
                      autoFocus
                    />
                  </div>
                  <div>
                    <Label
                      htmlFor="lastName"
                      className="text-gray-300 font-medium mb-2 block"
                    >
                      {t("identity.lastName")}
                    </Label>
                    <Input
                      id="lastName"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder={t("identity.lastNamePlaceholder")}
                      className="bg-white/10 border-white/20 text-white placeholder:text-gray-500 h-12 text-base focus:border-[#00D9FF] focus:ring-[#00D9FF]"
                    />
                  </div>
                </div>
              )}

              {/* Step 2 - Situation */}
              {step === 2 && (
                <div className="space-y-5">
                  <div>
                    <h1 className="text-2xl font-black text-white mb-1">
                      {t("situation.title")}
                    </h1>
                    <p className="text-gray-400 text-sm">
                      {t("situation.subtitle")}
                    </p>
                  </div>
                  <div className="space-y-3">
                    <RadioCard
                      selected={situation === "active"}
                      onClick={() => setSituation("active")}
                      icon={<Search className="w-5 h-5" />}
                      label={t("situation.active")}
                    />
                    <RadioCard
                      selected={situation === "watching"}
                      onClick={() => setSituation("watching")}
                      icon={<Eye className="w-5 h-5" />}
                      label={t("situation.watching")}
                    />
                    <RadioCard
                      selected={situation === "student"}
                      onClick={() => setSituation("student")}
                      icon={<GraduationCap className="w-5 h-5" />}
                      label={t("situation.student")}
                    />
                    <RadioCard
                      selected={situation === "employed"}
                      onClick={() => setSituation("employed")}
                      icon={<Briefcase className="w-5 h-5" />}
                      label={t("situation.employed")}
                    />
                  </div>
                </div>
              )}

              {/* Step 3 - Job Search */}
              {step === 3 && (
                <div className="space-y-5">
                  <div>
                    <h1 className="text-2xl font-black text-white mb-1">
                      {t("jobSearch.title")}
                    </h1>
                    <p className="text-gray-400 text-sm">
                      {t("jobSearch.subtitle")}
                    </p>
                  </div>
                  <div>
                    <Label
                      htmlFor="jobTitle"
                      className="text-gray-300 font-medium mb-2 block"
                    >
                      {t("jobSearch.jobTitle")}
                    </Label>
                    <Input
                      id="jobTitle"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      placeholder={t("jobSearch.jobTitlePlaceholder")}
                      className="bg-white/10 border-white/20 text-white placeholder:text-gray-500 h-12 text-base focus:border-[#00D9FF] focus:ring-[#00D9FF]"
                      autoFocus
                    />
                  </div>
                  <div>
                    <Label
                      htmlFor="location"
                      className="text-gray-300 font-medium mb-2 block"
                    >
                      {t("jobSearch.location")}
                    </Label>
                    <Input
                      id="location"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder={t("jobSearch.locationPlaceholder")}
                      className="bg-white/10 border-white/20 text-white placeholder:text-gray-500 h-12 text-base focus:border-[#00D9FF] focus:ring-[#00D9FF]"
                    />
                  </div>
                </div>
              )}

              {/* Step 4 - Experience */}
              {step === 4 && (
                <div className="space-y-5">
                  <div>
                    <h1 className="text-2xl font-black text-white mb-1">
                      {t("experience.title")}
                    </h1>
                    <p className="text-gray-400 text-sm">
                      {t("experience.subtitle")}
                    </p>
                  </div>
                  <div className="space-y-3">
                    <RadioCard
                      selected={experience === "junior"}
                      onClick={() => setExperience("junior")}
                      label={t("experience.junior")}
                    />
                    <RadioCard
                      selected={experience === "confirmed"}
                      onClick={() => setExperience("confirmed")}
                      label={t("experience.confirmed")}
                    />
                    <RadioCard
                      selected={experience === "senior"}
                      onClick={() => setExperience("senior")}
                      label={t("experience.senior")}
                    />
                    <RadioCard
                      selected={experience === "expert"}
                      onClick={() => setExperience("expert")}
                      label={t("experience.expert")}
                    />
                  </div>
                </div>
              )}

              {/* Step 5 - Discovery */}
              {step === 5 && (
                <div className="space-y-5">
                  <div>
                    <h1 className="text-2xl font-black text-white mb-1">
                      {t("discovery.title")}
                    </h1>
                    <p className="text-gray-400 text-sm">
                      {t("discovery.subtitle")}
                    </p>
                  </div>
                  <div className="space-y-3">
                    <RadioCard
                      selected={discoverySource === "word_of_mouth"}
                      onClick={() => setDiscoverySource("word_of_mouth")}
                      icon={<Users className="w-5 h-5" />}
                      label={t("discovery.wordOfMouth")}
                    />
                    <RadioCard
                      selected={discoverySource === "social"}
                      onClick={() => setDiscoverySource("social")}
                      icon={<Share2 className="w-5 h-5" />}
                      label={t("discovery.social")}
                    />
                    <RadioCard
                      selected={discoverySource === "seo"}
                      onClick={() => setDiscoverySource("seo")}
                      icon={<Search className="w-5 h-5" />}
                      label={t("discovery.seo")}
                    />
                    <RadioCard
                      selected={discoverySource === "ads"}
                      onClick={() => setDiscoverySource("ads")}
                      icon={<Megaphone className="w-5 h-5" />}
                      label={t("discovery.ads")}
                    />
                    <RadioCard
                      selected={discoverySource === "other"}
                      onClick={() => setDiscoverySource("other")}
                      icon={<MoreHorizontal className="w-5 h-5" />}
                      label={t("discovery.other")}
                    />
                  </div>
                </div>
              )}

              {/* Step 6 - Promo Code */}
              {step === 6 && (
                <div className="space-y-5">
                  <div className="text-center">
                    <h1 className="text-2xl font-black text-white mb-2">
                      {t("promoCode.title")}
                    </h1>
                    <p className="text-gray-400 text-sm">
                      {t("promoCode.subtitle")}
                    </p>
                  </div>
                  <PromoCodeInput
                    defaultOpen
                    onCodeValidated={(
                      code: string,
                      result: CodeValidationResult,
                    ) => {
                      // Store as backup (auth-context will retry if POST fails)
                      document.cookie = `huntzen_referral_code=${code}; path=/; max-age=${30 * 24 * 60 * 60}; SameSite=Lax`;
                      localStorage.setItem("huntzen_referral_code", code);

                      // Register referral immediately if applicable
                      if (result.type === "referral" && userId) {
                        const backendUrl =
                          process.env.NEXT_PUBLIC_API_URL ||
                          process.env.NEXT_PUBLIC_BACKEND_URL ||
                          "";
                        fetch(`${backendUrl}/api/referrals/register`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ code, new_user_id: userId }),
                        })
                          .then((res) => {
                            if (res.ok) {
                              localStorage.setItem(
                                "huntzen_referral_registered",
                                "true",
                              );
                              localStorage.removeItem("huntzen_referral_code");
                              document.cookie =
                                "huntzen_referral_code=; path=/; max-age=0; SameSite=Lax";
                            }
                          })
                          .catch(() => {
                            // Silently continue — auth-context will retry
                          });
                      }
                    }}
                    className="[&_input]:bg-white/10 [&_input]:border-white/20 [&_input]:text-white [&_input]:placeholder:text-gray-500"
                  />
                </div>
              )}

              {/* Step 7 - Plans */}
              {step === 7 && (
                <div className="space-y-5">
                  <div className="text-center">
                    <h1 className="text-2xl font-black text-white mb-2">
                      {t("plans.title")}
                    </h1>
                    <p className="text-gray-400 text-sm">
                      {t("plans.subtitle")}
                    </p>
                  </div>
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => router.push("/pricing")}
                      className="w-full p-4 rounded-xl border-2 border-[#00D9FF]/30 bg-[#00D9FF]/5 text-left transition-all hover:border-[#00D9FF] hover:bg-[#00D9FF]/10"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-white text-sm">
                            {t("plans.seePlans")}
                          </p>
                          <p className="text-gray-400 text-xs mt-1">
                            {t("plans.seePlansDesc")}
                          </p>
                        </div>
                        <ArrowRight className="w-5 h-5 text-[#00D9FF] flex-shrink-0" />
                      </div>
                    </button>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-white/5 rounded-lg p-3">
                        <p className="text-lg font-black text-[#00D9FF]">5x</p>
                        <p className="text-[10px] text-gray-400">
                          {t("plans.stat1")}
                        </p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-3">
                        <p className="text-lg font-black text-[#00D9FF]">
                          24/7
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {t("plans.stat2")}
                        </p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-3">
                        <p className="text-lg font-black text-[#00D9FF]">87%</p>
                        <p className="text-[10px] text-gray-400">
                          {t("plans.stat3")}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 gap-3">
            {step > 1 && step < 7 ? (
              <Button
                type="button"
                variant="ghost"
                onClick={goPrev}
                className="text-gray-400 hover:text-white hover:bg-white/10"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t("previous")}
              </Button>
            ) : (
              <div />
            )}

            {step === 7 ? (
              <Button
                type="button"
                onClick={navigateToApp}
                variant="ghost"
                className="text-gray-400 hover:text-white hover:bg-white/10 text-sm ml-auto"
              >
                {t("plans.skip")}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button
                type="button"
                disabled={loading || (!canProceed() && step !== 3)}
                onClick={step === 5 ? handleComplete : goNext}
                className="bg-[#00D9FF] hover:bg-[#00C4EA] text-white font-bold px-8 h-12"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : step === 5 ? (
                  <>
                    {t("start")}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                ) : (
                  <>
                    {t("next")}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Skip link */}
          <div className="text-center mt-4">
            <button
              onClick={handleSkip}
              disabled={loading}
              className="text-gray-500 hover:text-gray-400 text-sm transition-colors disabled:opacity-50"
            >
              {t("skip")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900" />
      }
    >
      <OnboardingWizard />
    </Suspense>
  );
}
