"use client";

import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function StepSummary({ value, onChange }: Props) {
  return (
    <div className="space-y-3">
      <Label htmlFor="summary">
        Résumé professionnel
        <span className="ml-2 text-xs font-normal text-gray-400">optionnel</span>
      </Label>
      <Textarea
        id="summary"
        placeholder="Développeur passionné avec 5 ans d'expérience en React et Node.js, spécialisé dans la création d'applications web performantes..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        className="resize-none"
      />
      <p className="text-xs text-gray-400">
        Un bon résumé fait 3-5 phrases. Il sera adapté automatiquement par l&apos;IA lors de la candidature.
      </p>
    </div>
  );
}
