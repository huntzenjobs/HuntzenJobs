"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { TextLogo } from "@/components/ui/adaptive-logo";
import {
  Briefcase,
  FileText,
  FolderOpen,
  MessageSquare,
  Bookmark,
  HelpCircle,
  ArrowLeft,
  User,
  LogOut,
  Menu,
  X,
  Lock,
  Sparkles,
  Crown,
  LogIn,
  Calendar,
  Activity,
  Users,
  Send,
  Gift,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useOptionalSubscription } from "@/contexts/subscription-context";
import { useOptionalAuth } from "@/contexts/auth-context";
import { UsageSummary } from "@/components/freemium/usage-counter";
import { UsageModal } from "@/components/freemium/usage-modal";
import { useTranslations } from "next-intl";
import { LanguageSwitcherCompact } from "@/components/language-switcher";
import { NotificationBell } from "@/components/notifications/notification-bell";
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

  const navigation = [
    { name: t("nav.jobs"), href: "/jobs", icon: Briefcase, premium: false },
    {
      name: t("nav.cvAnalysis"),
      href: "/cv-analysis",
      icon: FileText,
      premium: false,
    },
    {
      name: t("nav.assistant"),
      href: "/assistant",
      icon: MessageSquare,
      premium: false,
    },
    { name: t("nav.salons"), href: "/salons", icon: Calendar, premium: false },
    {
      name: t("nav.savedJobs"),
      href: "/saved-jobs",
      icon: Bookmark,
      premium: true,
    },
    {
      name: t("nav.candidatures"),
      href: "/candidatures",
      icon: Send,
      premium: false,
      badge: isCandidaturesNew ? "Nouveau" : undefined,
    },
    {
      name: t("nav.referral"),
      href: "/referral",
      icon: Gift,
      premium: false,
    },
    {
      name: t("nav.recruiterContact"),
      href: "/recruiter-contact",
      icon: Users,
      premium: false,
      badge: "50€",
    },
    {
      name: t("nav.documents"),
      href: "/documents",
      icon: FolderOpen,
      premium: false,
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

  const handleLogout = async () => {
    try {
      // Use the Auth context signOut which handles logging and state management
      if (auth?.signOut) {
        await auth.signOut();
      } else {
        // Fallback if context not available
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/login");
        router.refresh();
      }
    } catch (error) {
      console.error("Logout error:", error);
      // Still redirect on error
      router.push("/login");
      router.refresh();
    }
  };

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
          <span className="nav-section-label block text-white/40 text-[0.65rem] font-bold tracking-widest px-3 mb-4">
            {t("label")}
          </span>

          {navigation.map((item, index) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const isLocked = item.premium && (!user || isFreePlan);

            return (
              <div key={item.name}>
                <Link
                  href={isLocked ? (user ? "#" : "/login") : item.href}
                  onClick={(e) => {
                    if (isLocked && user) {
                      e.preventDefault();
                      openPricingModal();
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
                        : "text-white/50 group-hover:text-[#00D9FF]",
                    )}
                  />
                  <span className="nav-label flex-1">{item.name}</span>
                  {/* Badge (ex: "50€" pour contact recruteur) */}
                  {"badge" in item && item.badge && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-semibold border border-emerald-200">
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
              <Activity className="w-5 h-5 text-white/50 group-hover:text-[#00D9FF] transition-colors" />
              <span className="nav-label flex-1 text-left">
                {t("nav.myUsage")}
              </span>
            </button>
          )}
        </div>

        {/* Usage summary for free users - only show if logged in */}
        {user && isFreePlan && (
          <div className="px-4 mt-6">
            <UsageSummary className="p-4 rounded-xl bg-white/5 border border-white/10" />
          </div>
        )}
      </nav>

      {/* User section */}
      <div className="px-4 py-4 border-t border-white/10">
        {isAuthLoading ? (
          <div className="flex items-center gap-3 px-3 py-2 mb-3">
            <Skeleton className="w-10 h-10 rounded-full bg-gray-200" />
            <div className="flex-1">
              <Skeleton className="h-4 w-32 mb-2 bg-gray-200" />
              <Skeleton className="h-3 w-40 bg-gray-200" />
            </div>
          </div>
        ) : user ? (
          <div>
            <Link
              href="/profile"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 mb-3 rounded-xl hover:bg-white/8 transition-colors cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-[#00D9FF]/15 transition-colors border border-white/10">
                <User className="w-5 h-5 text-white/60 group-hover:text-[#00D9FF] transition-colors" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white truncate group-hover:text-[#00D9FF] transition-colors">
                    {user.user_metadata?.full_name || t("user.default")}
                  </p>
                  {subscription === null ? (
                    <span className="bg-gray-200 animate-pulse rounded-full px-2 py-0.5 w-14 h-4" />
                  ) : planBadge ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white",
                        planBadge.color,
                      )}
                    >
                      {planBadge.icon}
                      {planBadge.label}
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-white/50 truncate">{user.email}</p>
              </div>
            </Link>
          </div>
        ) : (
          <div>
            <Link
              href="/login"
              className="nav-item flex items-center gap-3 px-4 py-3 mb-1 rounded-xl text-sm font-medium transition-all text-white/70 hover:bg-white/8 hover:text-white w-full group"
            >
              <LogIn className="w-5 h-5 text-white/50 group-hover:text-[#00D9FF] transition-colors" />
              <span className="nav-label flex-1 text-left">
                {t("footer.login")}
              </span>
            </Link>
          </div>
        )}

        {/* Upgrade button for free users - only show if logged in */}
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

      {/* Footer Navigation */}
      <div className="sidebar-footer px-4 py-3 border-t border-white/10">
        {/* Language switcher */}
        <div className="px-2 py-2 mb-1">
          <LanguageSwitcherCompact />
        </div>

        <Link
          href="/pricing"
          className="nav-item nav-item-secondary flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-white/60 hover:bg-white/8 hover:text-white transition-all group focus-visible:ring-2 focus-visible:ring-[#00D9FF] focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <Crown className="w-4 h-4 group-hover:text-[#00D9FF] transition-colors" />
          <span className="nav-label">{t("footer.pricing")}</span>
        </Link>

        <Link
          href="mailto:contact@huntzenjobs.co"
          className="nav-item nav-item-secondary flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-white/60 hover:bg-white/8 hover:text-white transition-all group focus-visible:ring-2 focus-visible:ring-[#00D9FF] focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <HelpCircle className="w-4 h-4 group-hover:text-[#00D9FF] transition-colors" />
          <span className="nav-label">{t("footer.help")}</span>
        </Link>

        <Link
          href="https://huntzen.co"
          target="_blank"
          rel="noopener noreferrer"
          className="nav-item nav-item-secondary flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-white/60 hover:bg-white/8 hover:text-white transition-all group focus-visible:ring-2 focus-visible:ring-[#00D9FF] focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <ArrowLeft className="w-4 h-4 group-hover:text-[#00D9FF] transition-colors" />
          <span className="nav-label">{t("footer.back")}</span>
        </Link>

        {user && (
          <button
            onClick={() => setShowLogoutDialog(true)}
            className="nav-item nav-item-secondary flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-white/60 hover:bg-red-500/10 hover:text-red-400 transition-all w-full group"
            aria-label={t("aria.logout")}
          >
            <LogOut className="w-4 h-4 group-hover:text-red-400 transition-colors" />
            <span className="nav-label">{t("footer.logout")}</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile header */}
      <div className="mobile-header lg:hidden fixed top-0 left-0 right-0 z-[50] h-14 flex items-center justify-between px-4 bg-white border-b border-slate-200 shadow-sm">
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
