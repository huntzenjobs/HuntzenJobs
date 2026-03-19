"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";

export default function OnboardingPage() {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const [jobTitle, setJobTitle] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);

  // Guard: if already onboarded (manual navigation), redirect immediately.
  // isChecking prevents flash of form before redirect resolves.
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const check = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.user_metadata?.onboarding_completed) {
        router.replace("/jobs");
      } else {
        setIsChecking(false);
      }
    };
    check();
  }, [router]);

  if (isChecking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900" />
    );
  }

  const markOnboardingDone = async () => {
    const supabase = createClient();
    await supabase.auth.updateUser({
      data: { onboarding_completed: true },
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await markOnboardingDone();
      const params = new URLSearchParams();
      if (jobTitle) params.set("q", jobTitle);
      if (location) params.set("location", location);
      router.push(`/jobs${params.toString() ? `?${params}` : ""}`);
    } catch {
      router.push("/jobs");
    }
  };

  const handleSkip = async () => {
    await markOnboardingDone();
    router.push("/jobs");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg"
      >
        {/* Logo */}
        <div className="text-center mb-10">
          <span className="text-3xl font-black text-white">
            Hunt<span className="text-[#00D9FF]">Zen</span>
          </span>
        </div>

        <div className="bg-white/5 backdrop-blur-md rounded-3xl p-8 border border-white/10">
          <h1 className="text-3xl font-black text-white mb-2">{t("title")}</h1>
          <p className="text-gray-400 mb-8">{t("subtitle")}</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label
                htmlFor="jobTitle"
                className="text-gray-300 font-medium mb-2 block"
              >
                {t("jobTitle.label")}
              </Label>
              <Input
                id="jobTitle"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder={t("jobTitle.placeholder")}
                className="bg-white/10 border-white/20 text-white placeholder:text-gray-500 h-12 text-base focus:border-[#00D9FF] focus:ring-[#00D9FF]"
                autoFocus
              />
            </div>

            <div>
              <Label
                htmlFor="location"
                className="text-gray-300 font-medium mb-2 block"
              >
                {t("location.label")}
              </Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={t("location.placeholder")}
                className="bg-white/10 border-white/20 text-white placeholder:text-gray-500 h-12 text-base focus:border-[#00D9FF] focus:ring-[#00D9FF]"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 text-base font-bold bg-[#00D9FF] hover:bg-[#00C4EA] text-white mt-4"
            >
              {t("cta")}
            </Button>
          </form>

          <div className="text-center mt-4">
            <button
              onClick={handleSkip}
              className="text-gray-500 hover:text-gray-400 text-sm transition-colors"
            >
              {t("skip")}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
