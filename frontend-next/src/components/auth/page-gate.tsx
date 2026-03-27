"use client";

import { useOptionalSubscription } from "@/contexts/subscription-context";
import { useOptionalAuth } from "@/contexts/auth-context";
import { useTranslations } from "next-intl";
import { Lock, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ReactNode } from "react";

interface PageGateProps {
  featureFlag: string;
  children: ReactNode;
}

export function PageGate({ featureFlag, children }: PageGateProps) {
  const subscription = useOptionalSubscription();
  const auth = useOptionalAuth();
  const t = useTranslations("pageGate");

  // Si pas de subscription context (loading ou hors provider), afficher les children
  if (!subscription) return <>{children}</>;

  // Si pas encore charge, afficher les children (evite flash de blocage)
  if (!subscription.isLoaded) return <>{children}</>;

  // Cast necessaire : les page flags (page_*) sont dynamiques depuis la DB
  // et ne font pas partie du type PlanLimitValues statique
  const isLoggedIn = !!auth?.user;
  const hasAccess = subscription.hasFeature(
    featureFlag as keyof typeof subscription.limits,
  );

  if (!isLoggedIn || !hasAccess) {

    // Utilisateur non connecté : inviter à se connecter
    if (!isLoggedIn) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-slate-100 flex items-center justify-center">
              <LogIn className="h-10 w-10 text-slate-400" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              {t("loginTitle")}
            </h2>
            <p className="text-slate-600 mb-6">{t("loginDescription")}</p>
            <Button
              asChild
              className="bg-gradient-to-r from-[#00D9FF] to-[#00C4EA] hover:shadow-lg hover:shadow-[#00D9FF]/40 text-white transition-all duration-300"
            >
              <Link href="/login">{t("loginCta")}</Link>
            </Button>
          </div>
        </div>
      );
    }

    // Utilisateur connecté mais plan insuffisant : inviter à upgrader
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-slate-100 flex items-center justify-center">
            <Lock className="h-10 w-10 text-slate-400" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            {t("title")}
          </h2>
          <p className="text-slate-600 mb-6">{t("description")}</p>
          <Button
            asChild
            className="bg-gradient-to-r from-[#00D9FF] to-[#00C4EA] hover:shadow-lg hover:shadow-[#00D9FF]/40 text-white transition-all duration-300"
          >
            <Link href="/pricing">{t("upgrade")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
