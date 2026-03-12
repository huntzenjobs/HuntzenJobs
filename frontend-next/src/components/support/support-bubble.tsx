"use client";

import { useState } from "react";
import { MessageCircleQuestion } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSupportTicket } from "@/hooks/use-support";
import { SupportWidget } from "./support-widget";

export function SupportBubble() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"chatbot" | "ticket">("chatbot");
  const { myTickets } = useSupportTicket();

  const openTicketCount = myTickets.filter(
    (t) => t.status === "open" || t.status === "in_progress"
  ).length;

  return (
    <>
      {/* FAB Button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Aide et Support"
        title="Aide & Support"
        className={cn(
          "fixed bottom-6 right-6 z-[60]",
          "w-14 h-14 rounded-full",
          "bg-gradient-to-br from-huntzen-blue to-blue-600",
          "text-white shadow-glow-blue",
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
          onTabChange={setActiveTab}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
