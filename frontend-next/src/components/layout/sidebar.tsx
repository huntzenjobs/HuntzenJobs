"use client";

import { UsageSummary } from "@/components/freemium/usage-counter";
import { UsageModal } from "@/components/freemium/usage-modal";
import { LanguageSwitcherCompact } from "@/components/language-switcher";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { TextLogo } from "@/components/ui/adaptive-logo";
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
import { useOptionalAuth } from "@/contexts/auth-context";
import { useOptionalSubscription } from "@/contexts/subscription-context";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Bookmark,
  Briefcase,
  Calendar,
  Crown,
  FileText,
  FolderOpen,
  Gift,
  Globe,
  Lock,
  LogIn,
  LogOut,
  Menu,
  MessageSquare,
  Send,
  Sparkles,
  User,
  Users,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUsageModalOpen, setIsUsageModalOpen] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [isCandidaturesNew, setIsCandidaturesNew] = useState(() => {
    try {
      return !localStorage.getItem("huntzen_candidatures_visited");
    } catch {
      return false;
    }
  });
  const t = useTranslations("sidebar");

  // Use auth context as single source of truth
  const auth = useOptionalAuth();
  const isAuthLoading = auth?.loading ?? true;
  const user = auth?.user ?? null;

  // Use subscription context - with fallback for when context is not available
  const subscription = useOptionalSubscription();
  const plan = subscription?.plan || "free";
  const isFreePlan = subscription?.isFreePlan ?? true;
  const openPricingModal = subscription?.openPricingModal || (() => {});

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

  const navigation = [
    {
      name: t("nav.jobs"),
      href: "/jobs",
      icon: Briefcase,
      premium: false,
      pageFlag: "page_jobs",
    },
    {
      name: t("nav.cvAnalysis"),
      href: "/cv-analysis",
      icon: FileText,
      premium: false,
      pageFlag: "page_cv_analysis",
    },
    {
      name: t("nav.assistant"),
      href: "/assistant",
      icon: MessageSquare,
      premium: false,
      pageFlag: "page_assistant",
    },
    {
      name: t("nav.salons"),
      href: "/salons",
      icon: Calendar,
      premium: false,
      badge: t("badges.soon"),
      pageFlag: "page_salons",
      comingSoon: true,
    },
    {
      name: t("nav.savedJobs"),
      href: "/saved-jobs",
      icon: Bookmark,
      premium: false,
      pageFlag: "page_saved_jobs",
    },
    {
      name: t("nav.candidatures"),
      href: "/candidatures",
      icon: Send,
      premium: false,
      badge: isCandidaturesNew ? t("badges.new") : undefined,
      pageFlag: "page_candidatures",
    },
    {
      name: t("nav.expat"),
      href: "/expat",
      icon: Globe,
      premium: false,
      pageFlag: "page_expat",
    },
    {
      name: t("nav.referral"),
      href: "/referral",
      icon: Gift,
      premium: false,
      pageFlag: "page_referral",
    },
    {
      name: t("nav.recruiterContact"),
      href: "/recruiter-contact",
      icon: Users,
      premium: false,
      badge: t("badges.recruiterPrice"),
      pageFlag: "page_recruiter_contact",
    },
    {
      name: t("nav.documents"),
      href: "/documents",
      icon: FolderOpen,
      premium: false,
      pageFlag: "page_documents",
    },
  ];

  const PLAN_BADGES: Record<
    string,
    { label: string; color: string; icon: React.ReactNode }
  > = {
    free: { label: t("plans.free"), color: "bg-gray-500", icon: null },
    starter: {
      label: t("plans.starter"),
      color: "bg-blue-500",
      icon: <Sparkles className="w-3 h-3" />,
    },
    pro: {
      label: t("plans.pro"),
      color: "bg-violet-500",
      icon: <Sparkles className="w-3 h-3" />,
    },
    premium: {
      label: t("plans.premium"),
      color: "bg-amber-500",
      icon: <Crown className="w-3 h-3" />,
    },
  };

  const planBadge = PLAN_BADGES[plan];

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-[#0D1F3C]">
      {/* Header with Logo */}
      <div className="sidebar-header flex items-center justify-between p-6 border-b border-white/10">
        <Link href="/" className="sidebar-logo flex items-center gap-2.5 group">
          <TextLogo
            size="md"
            showPulse
            className="group-hover:opacity-80 transition-opacity"
          />
        </Link>
        <div className="flex items-center gap-1">
          {user && <NotificationBell />}
          <button
            className="lg:hidden text-white/70 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-label={t("aria.close")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-6 overflow-y-auto">
        <div className="px-4">
          <span className="nav-section-label block text-white/60 text-[0.65rem] font-bold tracking-widest px-3 mb-4">
            {t("label")}
          </span>

          {navigation.map((item, index) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const isPageBlocked =
              item.pageFlag && subscription?.hasFeature
                ? !subscription.hasFeature(
                    item.pageFlag as Parameters<
                      typeof subscription.hasFeature
                    >[0],
                  )
                : false;
            const isLocked =
              item.comingSoon ||
              isPageBlocked ||
              (item.premium && (!user || isFreePlan)) ||
              !user;

            return (
              <div key={item.name}>
                <Link
                  href={item.href}
                  onClick={(e) => {
                    if (item.comingSoon) {
                      e.preventDefault();
                      toast.info(t("soonMessage"));
                      return;
                    }

                    if (isLocked && user) {
                      e.preventDefault();
                      openPricingModal();
                    }
                    if (item.href === "/assistant" && isActive) {
                      window.dispatchEvent(
                        new CustomEvent("huntzen:assistant-hub"),
                      );
                    }
                    if (item.href === "/candidatures" && isCandidaturesNew) {
                      try {
                        localStorage.setItem(
                          "huntzen_candidatures_visited",
                          "1",
                        );
                      } catch {}
                      setIsCandidaturesNew(false);
                    }
                    setIsMobileMenuOpen(false);
                  }}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "nav-item flex items-center gap-3 px-4 py-3 mb-1 rounded-xl text-sm font-medium transition-all relative group",
                    isActive
                      ? "bg-[#00D9FF]/15 text-white"
                      : "text-white/70 hover:bg-white/8 hover:text-white",
                    isLocked && "opacity-50",
                  )}
                >
                  {/* Active indicator - positioned at sidebar edge */}
                  {isActive && (
                    <motion.span
                      layoutId="activeTab"
                      className="absolute -left-4 top-1/2 -translate-y-1/2 w-1 h-[70%] bg-[#00D9FF] rounded-r"
                      transition={{
                        type: "spring",
                        stiffness: 300,
                        damping: 30,
                      }}
                    />
                  )}
                  <item.icon
                    className={cn(
                      "w-5 h-5 transition-all",
                      isActive
                        ? "text-[#00D9FF]"
                        : "text-white/70 group-hover:text-[#00D9FF]",
                    )}
                  />
                  <span className="nav-label flex-1">{item.name}</span>
                  {/* Badge (ex: "50€" pour contact recruteur) */}
                  {"badge" in item && item.badge && (
                    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-semibold border border-emerald-200 text-[10px] leading-tight">
                      {item.badge}
                    </span>
                  )}
                  {isLocked && <Lock className="w-4 h-4 text-white/30" />}
                </Link>
              </div>
            );
          })}

          {/* Mon Utilisation button - only show if logged in */}
          {user && (
            <button
              onClick={() => {
                setIsUsageModalOpen(true);
                setIsMobileMenuOpen(false);
              }}
              className="nav-item flex items-center gap-3 px-4 py-3 mb-1 rounded-xl text-sm font-medium transition-all text-white/70 hover:bg-white/8 hover:text-white w-full group"
            >
              <Activity className="w-5 h-5 text-white/70 group-hover:text-[#00D9FF] transition-colors" />
              <span className="nav-label flex-1 text-left">
                {t("nav.myUsage")}
              </span>
            </button>
          )}
        </div>

        {/* Usage summary for non-unlimited users (Free & Starter) */}
        {user && plan !== "pro" && plan !== "premium" && (
          <div className="px-4 mt-6">
            <UsageSummary className="p-4 rounded-xl bg-white/5 border border-white/10" />
          </div>
        )}
      </nav>

      {/* Bottom section — compact */}
      <div className="px-4 py-4 border-t border-white/10">
        {/* Login button for non-authenticated users */}
        {!isAuthLoading && !user && (
          <Link
            href="/login"
            className="nav-item flex items-center gap-3 px-4 py-3 mb-1 rounded-xl text-sm font-medium transition-all text-white/70 hover:bg-white/8 hover:text-white w-full group"
          >
            <LogIn className="w-5 h-5 text-white/70 group-hover:text-[#00D9FF] transition-colors" />
            <span className="nav-label flex-1 text-left">
              {t("footer.login")}
            </span>
          </Link>
        )}

        {/* User profile, language switcher, logout — mobile only (navbar handles desktop) */}
        {user && (
          <div className="mb-3 space-y-1 lg:hidden">
            {/* Profile link */}
            <Link
              href="/profile"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/8 transition-colors group"
            >
              <div className="w-8 h-8 rounded-full bg-[#00D9FF]/20 flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-[#00D9FF]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white truncate">
                    {user.user_metadata?.full_name ||
                      user.email?.split("@")[0] ||
                      t("user.default")}
                  </span>
                  {planBadge && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white",
                        planBadge.color,
                      )}
                    >
                      {planBadge.icon}
                      {planBadge.label}
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/50 truncate">{user.email}</p>
              </div>
            </Link>

            {/* Language switcher */}
            <div className="px-3 py-1">
              <LanguageSwitcherCompact />
            </div>

            {/* Logout button */}
            <button
              onClick={() => setShowLogoutDialog(true)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/70 hover:bg-red-500/10 hover:text-red-400 transition-colors w-full group"
              aria-label={t("aria.logout")}
            >
              <LogOut className="w-4 h-4" />
              <span>{t("footer.logout")}</span>
            </button>
          </div>
        )}

        {/* Upgrade button for free users */}
        {user && isFreePlan && (
          <button
            onClick={() => openPricingModal()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-[#00D9FF] to-[#00C4EA] text-white text-sm font-bold hover:shadow-lg hover:shadow-[#00D9FF]/30 transition-all"
          >
            <Sparkles className="w-4 h-4" />
            {t("upgradeCta")}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile header */}
      <div className="mobile-header lg:hidden fixed top-0 left-0 right-0 z-[50] h-14 flex items-center justify-between px-4 bg-white border-b border-slate-200 shadow-sm pt-safe">
        <button
          className="hamburger-btn text-slate-700 p-2 hover:text-[#00D9FF] transition-colors rounded-lg hover:bg-slate-100"
          onClick={() => setIsMobileMenuOpen(true)}
          aria-label={t("aria.open")}
        >
          <Menu className="w-6 h-6" />
        </button>

        <Link href="/" className="mobile-logo flex items-center gap-2 group">
          <TextLogo
            isDark
            size="sm"
            showPulse
            className="group-hover:opacity-80 transition-opacity"
          />
        </Link>

        {user ? (
          <span className="mobile-tool-name text-slate-500 text-sm font-medium">
            {navigation.find((n) => pathname.startsWith(n.href))?.name ||
              "HuntZen"}
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="px-3 py-1.5 bg-[#00D9FF] text-white text-xs font-semibold rounded-lg hover:bg-[#00C4EA] transition-colors"
            >
              {t("mobile.login")}
            </Link>
            <Link
              href="/signup"
              className="px-3 py-1.5 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-colors"
            >
              {t("mobile.signup")}
            </Link>
          </div>
        )}
      </div>

      {/* Mobile backdrop */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="sidebar-backdrop lg:hidden fixed inset-0 z-[45] bg-black/50"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Mobile sidebar */}
      <motion.aside
        initial={{ x: -280 }}
        animate={{ x: isMobileMenuOpen ? 0 : -280 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="huntzen-sidebar lg:hidden fixed inset-y-0 left-0 z-[50] w-[280px] bg-[#0D1F3C] shadow-2xl"
      >
        <SidebarContent />
      </motion.aside>

      {/* Desktop sidebar */}
      <aside className="huntzen-sidebar hidden lg:flex lg:flex-col lg:w-[280px] lg:fixed lg:inset-y-0 bg-[#0D1F3C] border-r border-white/10">
        <SidebarContent />
      </aside>

      {/* Usage Modal */}
      <UsageModal
        isOpen={isUsageModalOpen}
        onClose={() => setIsUsageModalOpen(false)}
      />

      {/* Logout confirmation dialog */}
      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("logout.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("logout.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("logout.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLogout}
              className="bg-red-500 hover:bg-red-600"
            >
              {t("logout.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
