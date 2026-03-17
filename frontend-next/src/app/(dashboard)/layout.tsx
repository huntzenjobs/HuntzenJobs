import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { NavigationLoader } from "@/components/layout/navigation-loader";
import { SubscriptionProvider } from "@/contexts/subscription-context";
import { PricingModal } from "@/components/freemium/pricing-modal";
import { UpgradeBanner } from "@/components/freemium/upgrade-banner";
import { SupportBubble } from "@/components/support/support-bubble";
import { PresenceTracker } from "@/components/layout/presence-tracker";
import DashboardLoading from "./loading";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SubscriptionProvider>
      <div className="dashboard-force-light min-h-screen bg-white">
        <NavigationLoader />
        <Sidebar />

        {/* Main content - offset by sidebar width */}
        <main
          id="main-content"
          className="huntzen-main lg:ml-[280px] min-h-screen transition-all"
        >
          {/* Presence heartbeat — tracks user on /dashboard */}
          <PresenceTracker page="/dashboard" />

          {/* Mobile spacer for fixed header */}
          <div className="h-14 lg:hidden" />

          {/* Upgrade banner for free users - handled by UpgradeBanner component */}
          <div className="px-4 lg:px-6 pt-4">
            <UpgradeBanner variant="minimal" />
          </div>

          <div className="p-4 lg:p-6">
            <Suspense fallback={<DashboardLoading />}>{children}</Suspense>
          </div>

          <footer className="border-t py-3 px-4 text-center">
            <p className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} HuntZen &middot;{" "}
              <a href="/privacy" className="hover:underline">
                Confidentialité
              </a>
              {" · "}
              <a href="/terms" className="hover:underline">
                CGU
              </a>
              {" · "}
              <a href="/contact" className="hover:underline">
                Contact
              </a>
            </p>
          </footer>
        </main>

        {/* Global pricing modal */}
        <PricingModal />

        {/* Support chat bubble */}
        <SupportBubble />
      </div>
    </SubscriptionProvider>
  );
}
