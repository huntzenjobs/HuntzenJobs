"use client";
import { useEffect } from "react";
import { X, Bell, Briefcase, TrendingUp, Gift, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotifications, type AppNotification } from "@/hooks/use-notifications";

const TYPE_CONFIG: Record<AppNotification["type"], { color: string; bgColor: string; Icon: React.ElementType }> = {
  job_alert:       { color: "text-green-600",  bgColor: "bg-green-50",  Icon: Briefcase },
  cv_feedback:     { color: "text-blue-600",   bgColor: "bg-blue-50",   Icon: TrendingUp },
  career_progress: { color: "text-blue-600",   bgColor: "bg-blue-50",   Icon: TrendingUp },
  referral_bonus:  { color: "text-violet-600", bgColor: "bg-violet-50", Icon: Gift },
  promo_code:      { color: "text-orange-600", bgColor: "bg-orange-50", Icon: Tag },
  interview_ready: { color: "text-amber-600",  bgColor: "bg-amber-50",  Icon: Bell },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "À l'instant";
  if (h < 24) return `Il y a ${h}h`;
  return `Il y a ${Math.floor(h / 24)}j`;
}

interface NotificationCenterProps { isOpen: boolean; onClose: () => void; }

export function NotificationCenter({ isOpen, onClose }: NotificationCenterProps) {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label="Centre de notifications">
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-80 bg-background border-l shadow-xl z-50 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4" />
            <span className="font-semibold text-sm">Notifications</span>
            {unreadCount > 0 && <span className="text-xs bg-red-100 text-red-600 rounded-full px-1.5">{unreadCount}</span>}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button onClick={markAllAsRead} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Tout lire
              </button>
            )}
            <button onClick={onClose} aria-label="Fermer" className="p-1 rounded hover:bg-accent transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Bell className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">Aucune notification</p>
            </div>
          ) : (
            notifications.map((n) => {
              const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.interview_ready;
              const { Icon } = cfg;
              return (
                <button key={n.id} onClick={() => !n.read && markAsRead(n.id)}
                  className={cn("w-full text-left px-4 py-3 border-b hover:bg-accent/50 transition-colors flex gap-3", !n.read && "bg-blue-50/40 dark:bg-blue-950/20")}>
                  <div className={cn("mt-0.5 p-1.5 rounded-full flex-shrink-0", cfg.bgColor)}>
                    <Icon className={cn("w-3.5 h-3.5", cfg.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-medium truncate", !n.read && "font-semibold")}>{n.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                  {!n.read && <div className="mt-1.5 w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
