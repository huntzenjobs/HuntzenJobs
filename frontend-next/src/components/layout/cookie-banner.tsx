"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { X, Cookie } from "lucide-react";

const CONSENT_KEY = "huntzen_cookie_consent";

type ConsentStatus = "accepted" | "declined" | null;

export function CookieBanner() {
  const [status, setStatus] = useState<ConsentStatus | "loading">("loading");

  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_KEY) as ConsentStatus | null;
    setStatus(stored);
  }, []);

  const handleAccept = () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    setStatus("accepted");
  };

  const handleDecline = () => {
    localStorage.setItem(CONSENT_KEY, "declined");
    setStatus("declined");
  };

  // Cacher si déjà répondu ou en cours de chargement
  if (status !== null) return null;

  return (
    <div
      role="dialog"
      aria-label="Gestion des cookies"
      aria-modal="false"
      className="fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-6"
    >
      <div className="max-w-4xl mx-auto bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        {/* Icon */}
        <div className="shrink-0 w-10 h-10 bg-[#00D9FF]/10 rounded-xl flex items-center justify-center">
          <Cookie className="w-5 h-5 text-[#00D9FF]" />
        </div>

        {/* Text */}
        <div className="flex-1 text-sm text-gray-300 leading-relaxed">
          <p>
            Nous utilisons des cookies pour améliorer votre expérience sur HuntZen Jobs.
            Les cookies essentiels sont nécessaires au fonctionnement du site.{" "}
            <Link href="/privacy" className="text-[#00D9FF] hover:underline font-medium">
              En savoir plus
            </Link>
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDecline}
            className="flex-1 sm:flex-none border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white"
          >
            Refuser
          </Button>
          <Button
            size="sm"
            onClick={handleAccept}
            className="flex-1 sm:flex-none bg-[#00D9FF] text-black font-semibold hover:bg-[#00D9FF]/90"
          >
            Accepter
          </Button>
          <button
            onClick={handleDecline}
            aria-label="Fermer"
            className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
