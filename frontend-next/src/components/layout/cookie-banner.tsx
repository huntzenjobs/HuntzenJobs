"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { X, Cookie } from "lucide-react";
import { useTranslations } from "next-intl";

export const COOKIE_CONSENT_KEY = "huntzen_cookie_consent";
export const COOKIE_CONSENT_EVENT = "huntzen:cookie-consent";

type ConsentStatus = "accepted" | "declined" | null;

export function CookieBanner() {
  const [status, setStatus] = useState<ConsentStatus | "loading">("loading");
  const t = useTranslations("cookies");

  useEffect(() => {
    const stored = localStorage.getItem(
      COOKIE_CONSENT_KEY,
    ) as ConsentStatus | null;
    setStatus(stored);
  }, []);

  const handleAccept = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
    window.dispatchEvent(
      new CustomEvent(COOKIE_CONSENT_EVENT, { detail: "accepted" }),
    );
    setStatus("accepted");
  };

  const handleDecline = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "declined");
    window.dispatchEvent(
      new CustomEvent(COOKIE_CONSENT_EVENT, { detail: "declined" }),
    );
    setStatus("declined");
  };

  // Cacher si deja repondu ou en cours de chargement
  if (status !== null) return null;

  return (
    <div
      role="dialog"
      aria-label={t("ariaLabel")}
      aria-modal="false"
      className="fixed bottom-0 left-0 right-0 z-50 p-1.5 sm:p-6 pb-safe"
    >
      <div className="max-w-4xl mx-auto bg-gray-900 border border-gray-700 rounded-xl sm:rounded-2xl shadow-2xl p-2.5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
        {/* Icon */}
        <div className="hidden sm:flex shrink-0 w-10 h-10 bg-[#00D9FF]/10 rounded-xl items-center justify-center">
          <Cookie className="w-5 h-5 text-[#00D9FF]" />
        </div>

        {/* Text */}
        <div className="flex-1 text-[11px] sm:text-sm text-gray-300 leading-snug sm:leading-relaxed">
          <p>
            {t("message")}{" "}
            <Link
              href="/privacy"
              className="text-[#00D9FF] hover:underline font-medium"
            >
              {t("learnMore")}
            </Link>
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDecline}
            className="flex-1 sm:flex-none border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white"
          >
            {t("decline")}
          </Button>
          <Button
            size="sm"
            onClick={handleAccept}
            className="flex-1 sm:flex-none bg-[#00D9FF] text-black font-semibold hover:bg-[#00D9FF]/90"
          >
            {t("accept")}
          </Button>
          <button
            onClick={handleDecline}
            aria-label={t("close")}
            className="min-w-9 min-h-9 sm:min-w-[44px] sm:min-h-[44px] flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
