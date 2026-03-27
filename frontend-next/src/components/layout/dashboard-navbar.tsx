"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  User,
  LogOut,
  Settings,
  Crown,
  HelpCircle,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOptionalAuth } from "@/contexts/auth-context";
import { useOptionalSubscription } from "@/contexts/subscription-context";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { LanguageSwitcherCompact } from "@/components/language-switcher";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PLAN_COLORS: Record<string, string> = {
  free: "bg-gray-100 text-gray-600",
  starter: "bg-blue-100 text-blue-700",
  pro: "bg-violet-100 text-violet-700",
  premium: "bg-amber-100 text-amber-700",
};

export function DashboardNavbar() {
  const router = useRouter();
  const auth = useOptionalAuth();
  const user = auth?.user ?? null;
  const subscription = useOptionalSubscription();
  const plan = subscription?.plan || "free";
  const t = useTranslations("sidebar");
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  const handleLogout = async () => {
    try {
      if (auth?.signOut) {
        await auth.signOut();
      } else {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/login");
        router.refresh();
      }
    } catch {
      router.push("/login");
      router.refresh();
    }
  };

  if (!user) return null;

  const planLabel = t(`plans.${plan}`);
  const displayName =
    user.user_metadata?.full_name || user.email?.split("@")[0] || t("user.default");

  return (
    <>
      <nav className="hidden lg:flex items-center justify-between h-14 px-6 bg-white border-b border-gray-100 sticky top-0 z-30">
        {/* Left: page context (empty for now, can add breadcrumb later) */}
        <div className="flex items-center gap-3">
          <LanguageSwitcherCompact />
        </div>

        {/* Right: user actions */}
        <div className="flex items-center gap-2">
          {/* Notifications */}
          <NotificationBell />

          {/* Help */}
          <Link
            href="mailto:contact@huntzenjobs.com"
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
            title={t("footer.help")}
          >
            <HelpCircle className="w-4.5 h-4.5" />
          </Link>

          {/* Pricing */}
          <Link
            href="/pricing"
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
            title={t("footer.pricing")}
          >
            <Crown className="w-4.5 h-4.5" />
          </Link>

          {/* User dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2.5 pl-3 pr-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors group">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#00D9FF]/20 to-[#00D9FF]/5 flex items-center justify-center border border-gray-200">
                  <User className="w-4 h-4 text-[#00D9FF]" />
                </div>
                <div className="text-left hidden xl:block">
                  <p className="text-sm font-medium text-gray-800 leading-tight truncate max-w-[120px]">
                    {displayName}
                  </p>
                </div>
                <span
                  className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5",
                    PLAN_COLORS[plan] || PLAN_COLORS.free,
                  )}
                >
                  {plan !== "free" && <Sparkles className="w-2.5 h-2.5" />}
                  {planLabel}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600 transition-colors" />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-52">
              {/* User info */}
              <div className="px-3 py-2 border-b border-gray-100">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {displayName}
                </p>
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
              </div>

              <DropdownMenuItem asChild className="cursor-pointer gap-2">
                <Link href="/profile">
                  <User className="w-4 h-4" />
                  {t("footer.profile")}
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem asChild className="cursor-pointer gap-2">
                <Link href="/pricing">
                  <Crown className="w-4 h-4" />
                  {t("footer.pricing")}
                </Link>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={() => setShowLogoutDialog(true)}
                className="cursor-pointer gap-2 text-red-600 focus:text-red-600 focus:bg-red-50"
              >
                <LogOut className="w-4 h-4" />
                {t("footer.logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>

      {/* Logout Confirmation Dialog */}
      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent className="bg-white border-slate-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-900">
              {t("logout.title")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600">
              {t("logout.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("logout.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {t("logout.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
