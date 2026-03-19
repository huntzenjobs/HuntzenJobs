"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, GraduationCap } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Education } from "../types";

interface Props {
  data: Education[];
  onChange: (data: Education[]) => void;
}

const EMPTY_EDU: Education = {
  degree: "",
  institution: "",
  year: "",
  field: "",
};

export function StepEducation({ data, onChange }: Props) {
  const t = useTranslations("cvBuilder.education");
  const [showForm, setShowForm] = useState(data.length === 0);
  const [draft, setDraft] = useState<Education>({ ...EMPTY_EDU });

  const addEducation = () => {
    if (!draft.degree || !draft.institution) return;
    onChange([...data, { ...draft }]);
    setDraft({ ...EMPTY_EDU });
    setShowForm(false);
  };

  const removeEducation = (idx: number) =>
    onChange(data.filter((_, i) => i !== idx));

  const updateField = (key: keyof Education, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));

  return (
    <div className="space-y-3">
      {data.length > 0 && (
        <div className="space-y-2">
          {data.map((edu, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3"
            >
              <GraduationCap className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gray-900">
                  {edu.degree}
                </p>
                <p className="text-xs text-gray-500">
                  {edu.institution}
                  {edu.field ? ` · ${edu.field}` : ""}
                  {edu.year ? ` · ${edu.year}` : ""}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-gray-400 hover:text-red-500 shrink-0"
                onClick={() => removeEducation(idx)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {showForm ? (
        <div className="rounded-lg border border-[#00D9FF]/30 bg-[#00D9FF]/5 p-4 space-y-3">
          <p className="font-medium text-sm text-gray-800">
            Nouvelle formation
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">
                Diplôme <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder={t("degreePlaceholder")}
                value={draft.degree}
                onChange={(e) => updateField("degree", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">
                Établissement <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder={t("institutionPlaceholder")}
                value={draft.institution}
                onChange={(e) => updateField("institution", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Spécialité</Label>
              <Input
                placeholder={t("fieldPlaceholder")}
                value={draft.field ?? ""}
                onChange={(e) => updateField("field", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Année d&apos;obtention</Label>
              <Input
                placeholder={t("yearPlaceholder")}
                value={draft.year}
                onChange={(e) => updateField("year", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={addEducation}
              disabled={!draft.degree || !draft.institution}
              className="bg-[#00D9FF] text-gray-900 hover:bg-[#00b8d9]"
            >
              Ajouter
            </Button>
            {data.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowForm(false);
                  setDraft({ ...EMPTY_EDU });
                }}
              >
                Annuler
              </Button>
            )}
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="w-full border-dashed"
          onClick={() => setShowForm(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Ajouter une formation
        </Button>
      )}
    </div>
  );
}
