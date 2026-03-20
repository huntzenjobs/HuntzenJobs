"use client";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { usePlansConfig } from "@/hooks/use-plans-config";

interface SubscriptionChangedModalProps {
  open: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  currentPlan: string;
}

export function SubscriptionChangedModal({
  open,
  onClose,
  onUpgrade,
  currentPlan,
}: SubscriptionChangedModalProps) {
  const t = useTranslations("subscription.planChanged");
  const { getPlan } = usePlansConfig();
  const planDisplayName = getPlan(currentPlan)?.display_name ?? currentPlan;

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("description", { plan: planDisplayName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("ctaContinue")}
          </Button>
          <Button onClick={onUpgrade}>{t("ctaUpgrade")}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
