"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Users,
  Package,
  BarChart3,
  FileText,
  Gift,
  ShieldCheck,
  LayoutDashboard,
  Briefcase,
  Target,
  Bot,
  Tag,
  LifeBuoy,
  Zap,
  FlaskConical,
  MessageSquarePlus,
  UserCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function AdminNav() {
  const pathname = usePathname();
  const [pendingWebhooks, setPendingWebhooks] = useState(0);

  useEffect(() => {
    async function fetchStats() {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch(`${BACKEND_URL}/api/admin/stats`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        setPendingWebhooks(data.webhook_failures_pending || 0);
      } catch {}
    }
    fetchStats();
    const interval = setInterval(fetchStats, 60_000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/live", label: "⚡ Live", icon: Zap },
    { href: "/admin/stress", label: "Stress Test", icon: FlaskConical },
    { href: "/admin/users", label: "Utilisateurs", icon: Users },
    { href: "/admin/plans", label: "Packages", icon: Package },
    { href: "/admin/coaches", label: "Coaches IA", icon: UserCheck },
    { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
    {
      href: "/admin/logs",
      label: "Logs",
      icon: FileText,
      badge: pendingWebhooks > 0 ? pendingWebhooks : undefined,
    },
    { href: "/admin/referrals", label: "Parrainage", icon: Gift },
    {
      href: "/admin/recruiter-requests",
      label: "Consultations",
      icon: Briefcase,
    },
    { href: "/admin/segments", label: "Rétention", icon: Target },
    { href: "/admin/prompts", label: "Prompts IA", icon: Bot },
    { href: "/admin/coupons", label: "Codes promo", icon: Tag },
    { href: "/admin/support", label: "Support", icon: LifeBuoy },
    {
      href: "/admin/suggestions",
      label: "Suggestions",
      icon: MessageSquarePlus,
    },
  ];

  return (
    <aside className="flex w-full shrink-0 flex-col border-b bg-card lg:min-h-screen lg:w-56 lg:border-b-0 lg:border-r">
      <div className="border-b p-3 lg:p-4">
        <Link
          href="/admin/users"
          className="flex items-center gap-2 font-semibold text-sm"
        >
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span>Admin Panel</span>
        </Link>
      </div>
      <nav
        aria-label="Administration"
        className="flex gap-1 overflow-x-auto p-2 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:p-3"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors lg:w-full",
                isActive
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.badge !== undefined && (
                <span
                  className={cn(
                    "text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center",
                    isActive
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-destructive text-destructive-foreground",
                  )}
                >
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="hidden border-t p-3 lg:block">
        <Link
          href="/jobs"
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          Retour app
        </Link>
      </div>
    </aside>
  );
}
