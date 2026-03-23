"use client";

import { useEffect, useRef } from "react";
import { X, Minus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { SupportChatbot } from "./support-chatbot";
import { SupportTicketForm } from "./support-ticket-form";
import { SupportTicketList } from "./support-ticket-list";

interface SupportWidgetProps {
  activeTab: "chatbot" | "ticket";
  onTabChange: (tab: "chatbot" | "ticket") => void;
  onClose: () => void;
}

export function SupportWidget({
  activeTab,
  onTabChange,
  onClose,
}: SupportWidgetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const t = useTranslations("support.widget");

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Element;
      // Ignore clicks inside Radix UI portals (Select, DropdownMenu, etc.)
      // These render outside the widget DOM via portal but are still "inside" logically
      if (target.closest?.("[data-radix-popper-content-wrapper]")) return;
      if (panelRef.current && !panelRef.current.contains(target as Node)) {
        // Also exclude the FAB button (it handles its own toggle)
        onClose();
      }
    };
    // Slight delay to avoid closing immediately on open
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      className={cn(
        // Desktop: fixed panel bottom-right
        "fixed bottom-24 right-6 z-[59]",
        "w-[400px] h-[560px]",
        "flex flex-col",
        "bg-background border border-border rounded-xl shadow-2xl",
        "animate-in slide-in-from-bottom-4 fade-in duration-200",
        // Mobile: full screen
        "max-sm:bottom-0 max-sm:right-0 max-sm:w-full max-sm:h-full max-sm:rounded-none max-sm:border-0",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-huntzen-blue/10 to-huntzen-turquoise/10 rounded-t-xl max-sm:rounded-none">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="font-semibold text-sm">{t("title")}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onClose}
            aria-label={t("minimize")}
            className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            aria-label={t("close")}
            className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => onTabChange(v as "chatbot" | "ticket")}
        className="flex flex-col flex-1 min-h-0"
      >
        <TabsList className="w-full rounded-none border-b border-border bg-muted/50 h-auto p-0">
          <TabsTrigger
            value="chatbot"
            className="flex-1 rounded-none py-2.5 text-sm data-[state=active]:border-b-2 data-[state=active]:border-huntzen-blue data-[state=active]:bg-background"
          >
            {t("tabFaq")}
          </TabsTrigger>
          <TabsTrigger
            value="ticket"
            className="flex-1 rounded-none py-2.5 text-sm data-[state=active]:border-b-2 data-[state=active]:border-huntzen-blue data-[state=active]:bg-background"
          >
            {t("tabTicket")}
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="chatbot"
          className="flex-1 min-h-0 m-0 overflow-hidden"
        >
          <SupportChatbot onOpenTicket={() => onTabChange("ticket")} />
        </TabsContent>

        <TabsContent
          value="ticket"
          className="flex-1 min-h-0 m-0 overflow-y-auto"
        >
          <div className="p-4 space-y-4">
            <SupportTicketForm />
            <SupportTicketList />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
