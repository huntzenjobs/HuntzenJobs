"use client";

import { useEffect, useState } from "react";
import { MessageCircleQuestion } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSupportTicket } from "@/hooks/use-support";
import { SupportWidget } from "./support-widget";
import {
  COOKIE_CONSENT_EVENT,
  COOKIE_CONSENT_KEY,
} from "@/components/layout/cookie-banner";
import { useTranslations } from "next-intl";

export function SupportBubble() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"chatbot" | "ticket">("chatbot");
  const [hasConsentChoice, setHasConsentChoice] = useState(false);
  const ticketController = useSupportTicket();
  const t = useTranslations("support.widget");

  useEffect(() => {
    setHasConsentChoice(localStorage.getItem(COOKIE_CONSENT_KEY) !== null);

    const handleConsent = () => setHasConsentChoice(true);
    window.addEventListener(COOKIE_CONSENT_EVENT, handleConsent);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, handleConsent);
  }, []);

  const openTicketCount = ticketController.myTickets.filter(
    (t) => t.status === "open" || t.status === "in_progress"
  ).length;

  if (!hasConsentChoice) return null;

  return (
    <>
      {/* FAB Button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={t("buttonLabel")}
        title={t("buttonLabel")}
        className={cn(
          "fixed bottom-6 right-6 z-[60]",
          "w-14 h-14 rounded-full",
          "border border-huntzen-turquoise/40 bg-slate-950",
          "text-white shadow-lg shadow-slate-950/20",
          "flex items-center justify-center",
          "transition-transform duration-150 hover:scale-110 active:scale-95",
          isOpen && "scale-95"
        )}
      >
        <MessageCircleQuestion className="w-6 h-6" />
        {openTicketCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
            {openTicketCount > 9 ? "9+" : openTicketCount}
          </span>
        )}
      </button>

      {/* Widget Panel */}
      {isOpen && (
        <SupportWidget
          activeTab={activeTab}
          ticketController={ticketController}
          onTabChange={setActiveTab}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
