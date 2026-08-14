"use client";
import { useState } from "react";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/hooks/use-notifications";
import { NotificationCenter } from "./notification-center";
import { useTranslations } from "next-intl";

interface NotificationBellProps {
  className?: string;
  tone?: "light" | "dark";
}

export function NotificationBell({
  className,
  tone = "dark",
}: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { unreadCount } = useNotifications();
  const t = useTranslations("a11y");
  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "relative flex size-11 items-center justify-center rounded-lg transition-colors hover:bg-accent",
          className,
        )}
        aria-label={t("notifications")}
      >
        <Bell
          className={cn(
            "w-5 h-5",
            tone === "light" ? "text-slate-600" : "text-white",
          )}
        />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      <NotificationCenter isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
