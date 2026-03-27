"use client";

import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useTranslations } from "next-intl";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function StepSummary({ value, onChange }: Props) {
  const t = useTranslations("cvBuilder.summary");
  return (
    <div className="space-y-3">
      <Label htmlFor="summary">
        Résumé professionnel
        <span className="ml-2 text-xs font-normal text-gray-400">
          optionnel
        </span>
      </Label>
      <Textarea
        id="summary"
        placeholder={t("placeholder")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        className="resize-none"
      />
      <p className="text-xs text-gray-400">
        Un bon résumé fait 3-5 phrases. Il sera adapté automatiquement par
        l&apos;IA lors de la candidature.
      </p>
    </div>
  );
}
