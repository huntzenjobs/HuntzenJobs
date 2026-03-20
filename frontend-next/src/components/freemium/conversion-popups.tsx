"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { usePlansConfig } from "@/hooks/use-plans-config";

export interface PopupConfig {
  id: string;
  trigger: string;
  titleKey: string;
  bodyKey: string;
  primaryCtaKey: string;
  secondaryCtaKey?: string;
  plan: "starter" | "pro";
  discountPercent?: number;
  priceOverrideKey?: string;
  couponTrigger?: string;
}

export const POPUP_CONFIGS: PopupConfig[] = [
  {
    id: "search_limit",
    trigger: "search_limit",
    titleKey: "searchLimit.title",
    bodyKey: "searchLimit.body",
    primaryCtaKey: "searchLimit.primaryCta",
    secondaryCtaKey: "searchLimit.secondaryCta",
    plan: "starter",
  },
  {
    id: "cv_score",
    trigger: "cv_score",
    titleKey: "cvScore.title",
    bodyKey: "cvScore.body",
    primaryCtaKey: "cvScore.primaryCta",
    plan: "starter",
  },
  {
    id: "session_cut",
    trigger: "session_cut",
    titleKey: "sessionCut.title",
    bodyKey: "sessionCut.body",
    primaryCtaKey: "sessionCut.primaryCta",
    plan: "starter",
  },
  {
    id: "interview_score",
    trigger: "interview_score",
    titleKey: "interviewScore.title",
    bodyKey: "interviewScore.body",
    primaryCtaKey: "interviewScore.primaryCta",
    plan: "pro",
  },
  {
    id: "momentum",
    trigger: "momentum",
    titleKey: "momentum.title",
    bodyKey: "momentum.body",
    primaryCtaKey: "momentum.primaryCta",
    plan: "starter",
    discountPercent: 0.2,
    couponTrigger: "momentum",
  },
  {
    id: "anti_churn",
    trigger: "anti_churn",
    titleKey: "antiChurn.title",
    bodyKey: "antiChurn.body",
    primaryCtaKey: "antiChurn.primaryCta",
    secondaryCtaKey: "antiChurn.secondaryCta",
    plan: "pro",
    discountPercent: 0.3,
    couponTrigger: "anti_churn",
  },
  {
    id: "inactive_7d",
    trigger: "inactive_7d",
    titleKey: "inactive7d.title",
    bodyKey: "inactive7d.body",
    primaryCtaKey: "inactive7d.primaryCta",
    plan: "pro",
    priceOverrideKey: "inactive7d.priceOverride",
    couponTrigger: "win_back_7d",
  },
  {
    id: "pricing_hover",
    trigger: "pricing_hover",
    titleKey: "pricingHover.title",
    bodyKey: "pricingHover.body",
    primaryCtaKey: "pricingHover.primaryCta",
    plan: "pro",
  },
];

interface ConversionPopupProps {
  popupId: string;
  isOpen: boolean;
  onClose: () => void;
  onUpgrade?: (checkoutUrl?: string) => void;
  onSecondaryAction?: () => void;
}

export function ConversionPopup({
  popupId,
  isOpen,
  onClose,
  onUpgrade,
  onSecondaryAction,
}: ConversionPopupProps) {
  const { session } = useAuth();
  const t = useTranslations("popups");
  const config = POPUP_CONFIGS.find((p) => p.id === popupId);
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !config?.couponTrigger || !session?.access_token) return;
    const fetchCoupon = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/coupons/generate-for-trigger`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ trigger_type: config.couponTrigger }),
          },
        );
        if (res.ok) {
          const data = await res.json();
          setCouponCode(data.coupon_code);
          setCheckoutUrl(data.checkout_url);
        }
      } catch {
        /* non-blocking */
      }
    };
    fetchCoupon();
  }, [isOpen, config?.couponTrigger, session?.access_token]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const { getPlan, formatPrice } = usePlansConfig();

  if (!isOpen || !config) return null;

  const computedPrice = (() => {
    if (config.priceOverrideKey) return t(config.priceOverrideKey);
    const planData = getPlan(config.plan);
    if (!planData) return "";
    const base = planData.price_monthly;
    const discounted = config.discountPercent
      ? base * (1 - config.discountPercent)
      : base;
    return `${formatPrice(discounted)}${t("currencyPerMonth")}`;
  })();

  const planColors = {
    starter: {
      bg: "from-blue-500 to-blue-600",
      btn: "bg-blue-600 hover:bg-blue-700",
    },
    pro: {
      bg: "from-violet-500 to-purple-600",
      btn: "bg-violet-600 hover:bg-violet-700",
    },
  };
  const colors = planColors[config.plan];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-background rounded-2xl shadow-2xl overflow-hidden">
        <div className={cn("h-1 w-full bg-gradient-to-r", colors.bg)} />
        <div className="p-6">
          <button
            onClick={onClose}
            aria-label={t("close")}
            className="absolute top-4 right-4 p-1 rounded hover:bg-accent transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
          <h3 className="text-base font-bold leading-snug pr-6 mb-2">
            {t(config.titleKey)}
          </h3>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            {t(config.bodyKey)}
          </p>
          {couponCode && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs">
              <span className="text-amber-700 font-medium">
                {t("couponLabel")}{" "}
              </span>
              <span className="font-mono font-bold text-amber-800">
                {couponCode}
              </span>
            </div>
          )}
          <p className="text-xs text-muted-foreground mb-4">
            {t("planLabel")} {getPlan(config.plan)?.display_name ?? config.plan}
            {computedPrice ? " · " : ""}
            <strong>{computedPrice}</strong>
          </p>
          <button
            onClick={() => {
              if (onUpgrade) {
                onUpgrade(checkoutUrl ?? undefined);
              } else if (checkoutUrl) {
                window.location.href = checkoutUrl;
              } else {
                window.location.href = "/pricing";
              }
              onClose();
            }}
            className={cn(
              "w-full py-2.5 rounded-xl text-white font-semibold text-sm transition-colors",
              colors.btn,
            )}
          >
            {t(config.primaryCtaKey)}
          </button>
          {config.secondaryCtaKey && (
            <button
              onClick={() => {
                onSecondaryAction?.();
                onClose();
              }}
              className="w-full mt-2 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {t(config.secondaryCtaKey)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function useConversionPopup(
  popupId: string,
  options?: {
    onUpgrade?: (checkoutUrl?: string) => void;
    onSecondaryAction?: () => void;
  },
) {
  const [isOpen, setIsOpen] = useState(false);
  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    PopupComponent: () => (
      <ConversionPopup
        popupId={popupId}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onUpgrade={options?.onUpgrade}
        onSecondaryAction={options?.onSecondaryAction}
      />
    ),
  };
}
