import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { NavigationLoader } from "@/components/layout/navigation-loader";
import { SubscriptionProvider } from "@/contexts/subscription-context";
import { PricingModal } from "@/components/freemium/pricing-modal";
import { UpgradeBanner } from "@/components/freemium/upgrade-banner";
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
          {/* Mobile spacer for fixed header */}
          <div className="h-14 lg:hidden" />

          {/* Upgrade banner for free users - handled by UpgradeBanner component */}
          <div className="px-4 lg:px-6 pt-4">
            <UpgradeBanner variant="minimal" />
          </div>

          <div className="p-4 lg:p-6">
            <Suspense fallback={<DashboardLoading />}>{children}</Suspense>
          </div>
        </main>

        {/* Global pricing modal */}
        <PricingModal />
      </div>
    </SubscriptionProvider>
  );
}
