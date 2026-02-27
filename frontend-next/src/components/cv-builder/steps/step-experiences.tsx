"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Briefcase, ChevronDown, ChevronUp } from "lucide-react";
import type { Experience } from "../types";

interface Props {
  data: Experience[];
  onChange: (data: Experience[]) => void;
}

const EMPTY_EXP: Experience = {
  title: "",
  company: "",
  start_date: "",
  end_date: "",
  current: false,
  location: "",
  description: "",
};

export function StepExperiences({ data, onChange }: Props) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(
    data.length === 0 ? null : 0
  );
  const [showForm, setShowForm] = useState(data.length === 0);
  const [draft, setDraft] = useState<Experience>({ ...EMPTY_EXP });

  const addExperience = () => {
    if (!draft.title || !draft.company) return;
    onChange([...data, { ...draft }]);
    setDraft({ ...EMPTY_EXP });
    setShowForm(false);
  };

  const removeExperience = (idx: number) => {
    onChange(data.filter((_, i) => i !== idx));
    if (expandedIdx === idx) setExpandedIdx(null);
  };

  const updateField = (key: keyof Experience, value: string | boolean) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  return (
    <div className="space-y-3">
      {/* Existing experiences */}
      {data.length > 0 && (
        <div className="space-y-2">
          {data.map((exp, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-gray-200 bg-gray-50"
            >
              <div
                className="flex items-center justify-between p-3 cursor-pointer"
                onClick={() =>
                  setExpandedIdx(expandedIdx === idx ? null : idx)
                }
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Briefcase className="h-4 w-4 text-gray-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-gray-900 truncate">
                      {exp.title}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {exp.company}
                      {exp.start_date ? ` · ${exp.start_date}` : ""}
                      {exp.current ? " — présent" : exp.end_date ? ` — ${exp.end_date}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-gray-400 hover:text-red-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeExperience(idx);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  {expandedIdx === idx ? (
                    <ChevronUp className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  )}
                </div>
              </div>
              {expandedIdx === idx && (
                <div className="px-3 pb-3 text-sm text-gray-600 border-t border-gray-200 pt-2">
                  {exp.description || "Aucune description"}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {showForm ? (
        <div className="rounded-lg border border-[#00D9FF]/30 bg-[#00D9FF]/5 p-4 space-y-3">
          <p className="font-medium text-sm text-gray-800">
            Nouvelle expérience
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">
                Intitulé du poste <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder="Développeur Full-Stack"
                value={draft.title}
                onChange={(e) => updateField("title", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">
                Entreprise <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder="Google"
                value={draft.company}
                onChange={(e) => updateField("company", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date début</Label>
              <Input
                placeholder="janv. 2022"
                value={draft.start_date}
                onChange={(e) => updateField("start_date", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date fin</Label>
              <Input
                placeholder="déc. 2023"
                value={draft.end_date}
                onChange={(e) => updateField("end_date", e.target.value)}
                disabled={!!draft.current}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="current"
              checked={!!draft.current}
              onCheckedChange={(v) => updateField("current", !!v)}
            />
            <Label htmlFor="current" className="text-xs cursor-pointer">
              Poste actuel
            </Label>
            <div className="ml-4 flex-1 space-y-1">
              <Label className="text-xs">Localisation</Label>
              <Input
                placeholder="Paris, France"
                value={draft.location ?? ""}
                onChange={(e) => updateField("location", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Textarea
              placeholder="Développement et maintenance d'une application SaaS B2B utilisée par 500+ clients..."
              value={draft.description}
              onChange={(e) => updateField("description", e.target.value)}
              rows={3}
              className="text-sm resize-none"
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={addExperience}
              disabled={!draft.title || !draft.company}
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
                  setDraft({ ...EMPTY_EXP });
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
          Ajouter une expérience
        </Button>
      )}

      {data.length === 0 && !showForm && (
        <p className="text-center text-sm text-gray-400 py-2">
          Aucune expérience ajoutée
        </p>
      )}
    </div>
  );
}
