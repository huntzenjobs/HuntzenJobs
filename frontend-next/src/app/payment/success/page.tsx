"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Loader2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { useTranslations } from "next-intl";

type VerificationStatus = "polling" | "success" | "timeout" | "error";

export default function PaymentSuccessPage() {
  const t = useTranslations("payment.success");
  const searchParams = useSearchParams();
  const router = useRouter();
  const { session } = useAuth();

  const [status, setStatus] = useState<VerificationStatus>("polling");
  const [message, setMessage] = useState(t("verifying"));
  const [pollingAttempts, setPollingAttempts] = useState(0);

  useEffect(() => {
    const sessionId = searchParams.get("session_id");

    if (!sessionId) {
      setStatus("error");
      setMessage(t("invalidSession"));
      return;
    }

    if (!session?.access_token) {
      setMessage(t("waitingAuth"));
      return;
    }

    // Polling avec retry intelligent au lieu de wait fixe 2s
    const MAX_ATTEMPTS = 20;
    const POLL_INTERVAL = 1000; // 1 seconde

    let currentAttempt = 0;
    let pollingInterval: NodeJS.Timeout;

    const checkSubscriptionStatus = async () => {
      try {
        currentAttempt++;
        setPollingAttempts(currentAttempt);
        setMessage(
          t("verifyingAttempt", { attempt: currentAttempt, max: MAX_ATTEMPTS }),
        );

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/subscription/current`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              "Content-Type": "application/json",
            },
          },
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const planName = data.subscription?.plan_name;

        if (planName && planName !== "free") {
          if (pollingInterval) clearInterval(pollingInterval);

          await fetch(
            `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/subscription/sync-cache`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${session.access_token}`,
                "Content-Type": "application/json",
              },
            },
          );

          localStorage.removeItem("huntzen_subscription_cache");
          localStorage.removeItem("huntzen_subscription_cache_expiry");
          window.dispatchEvent(new CustomEvent("subscription-changed"));

          setStatus("success");
          setMessage(t("verifying"));

          setTimeout(() => {
            router.push("/profile");
          }, 3000);

          return true;
        }

        if (currentAttempt >= MAX_ATTEMPTS) {
          console.warn("[PaymentSuccess] Timeout atteint, fallback vers sync");

          if (pollingInterval) clearInterval(pollingInterval);

          await fetch(
            `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/subscription/sync-cache`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${session.access_token}`,
                "Content-Type": "application/json",
              },
            },
          );

          window.dispatchEvent(new CustomEvent("subscription-changed"));

          setStatus("timeout");
          setMessage(t("timeoutMessage"));

          setTimeout(() => {
            router.push("/profile");
          }, 5000);

          return false;
        }

        return false;
      } catch (error) {
        console.error("[PaymentSuccess] Polling error:", error);

        if (currentAttempt >= MAX_ATTEMPTS) {
          if (pollingInterval) clearInterval(pollingInterval);
          setStatus("error");
          setMessage(t("errorMessage"));
        }

        return false;
      }
    };

    checkSubscriptionStatus();
    pollingInterval = setInterval(checkSubscriptionStatus, POLL_INTERVAL);

    return () => {
      if (pollingInterval) clearInterval(pollingInterval);
    };
  }, [searchParams, router, session?.access_token]);

  // Polling state
  if (status === "polling") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-violet-50/30 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <Loader2 className="w-16 h-16 text-violet-600 animate-spin mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{message}</h2>
          {pollingAttempts > 0 && (
            <div className="mt-4 w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-violet-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(pollingAttempts / 10) * 100}%` }}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Timeout state
  if (status === "timeout") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-orange-50/30 to-yellow-50/30 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 text-center">
          <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Loader2 className="w-10 h-10 text-orange-600 animate-spin" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            {t("processingTitle")}
          </h1>
          <p className="text-gray-600 mb-4">{message}</p>
          <p className="text-sm text-gray-500 mb-8">
            {t("processingSubtitle")}
          </p>
          <Button
            onClick={() => router.push("/profile")}
            className="w-full h-12 text-lg font-semibold"
          >
            {t("goToProfile")}
          </Button>
        </div>
      </div>
    );
  }

  // Error state
  if (status === "error") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-red-50/30 to-orange-50/30 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 text-center">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-10 h-10 text-red-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            {t("errorTitle")}
          </h1>
          <p className="text-gray-600 mb-8">{message}</p>
          <div className="space-y-3">
            <Button
              onClick={() => router.push("/profile")}
              className="w-full h-12 text-lg font-semibold"
            >
              {t("viewProfile")}
            </Button>
            <Link href="/pricing">
              <Button
                variant="outline"
                className="w-full h-12 text-lg font-semibold"
              >
                {t("backToPricing")}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-violet-50/30 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-12 text-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-5">
            <div className="absolute top-10 right-10 w-64 h-64 bg-violet-500 rounded-full blur-3xl"></div>
            <div className="absolute bottom-10 left-10 w-48 h-48 bg-blue-500 rounded-full blur-3xl"></div>
          </div>

          <div className="relative z-10">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-green-400 to-green-600 rounded-full mb-6 shadow-2xl shadow-green-200 animate-in zoom-in duration-500">
              <CheckCircle2 className="w-12 h-12 text-white" strokeWidth={3} />
            </div>

            <div className="absolute top-0 left-1/2 -translate-x-1/2 text-4xl animate-in fade-in slide-in-from-top-10 duration-700">
              🎉
            </div>

            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {t("successTitle")}
            </h1>

            <p className="text-xl text-gray-600 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
              {t("successSubtitle")}
            </p>

            <div className="bg-gradient-to-br from-violet-50 to-blue-50 rounded-2xl p-6 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
              <div className="flex items-center gap-3 text-left">
                <Sparkles className="w-6 h-6 text-violet-600 flex-shrink-0" />
                <p className="text-gray-700 leading-relaxed">
                  {t("subscriptionActive")}
                </p>
              </div>
            </div>

            <div className="text-left mb-8 space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <span className="text-gray-700">{t("benefit1")}</span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <span className="text-gray-700">{t("benefit2")}</span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <span className="text-gray-700">{t("benefit3")}</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-400">
              <Link href="/jobs" className="flex-1">
                <Button className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all">
                  {t("startSearch")}
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link href="/profile" className="flex-1">
                <Button
                  variant="outline"
                  className="w-full h-14 text-lg font-semibold border-2 hover:bg-gray-50"
                >
                  {t("viewMyProfile")}
                </Button>
              </Link>
            </div>

            <p className="text-sm text-gray-500 mt-8">{t("emailSent")}</p>
          </div>
        </div>

        <p className="text-center text-sm text-gray-600 mt-6">
          {t("question")}{" "}
          <Link
            href="/help"
            className="text-violet-600 hover:text-violet-700 font-medium underline"
          >
            {t("contactSupport")}
          </Link>
        </p>
      </div>
    </div>
  );
}
