"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Loader2, Check } from "lucide-react";
import { useTranslations } from "next-intl";

import type {
  CvData,
  PersonalInfo,
  Experience,
  Education,
  Skills,
} from "./types";
import { StepPersonalInfo } from "./steps/step-personal-info";
import { StepSummary } from "./steps/step-summary";
import { StepExperiences } from "./steps/step-experiences";
import { StepEducation } from "./steps/step-education";
import { StepSkills } from "./steps/step-skills";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CvBuilderWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill with existing profile data for edit mode */
  initialData?: Partial<CvData>;
  initialName?: string;
  onSave: (name: string, data: CvData) => Promise<void>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildEmpty(): CvData {
  return {
    personal_info: { name: "", email: "", phone: "", location: "" },
    summary: "",
    experiences: [],
    education: [],
    skills: { technical: [], soft: [], languages: [] },
  };
}

function mergeInitial(initial?: Partial<CvData>): CvData {
  const base = buildEmpty();
  if (!initial) return base;
  return {
    personal_info: { ...base.personal_info, ...(initial.personal_info ?? {}) },
    summary: initial.summary ?? base.summary,
    experiences: initial.experiences ?? base.experiences,
    education: initial.education ?? base.education,
    skills: {
      technical: initial.skills?.technical ?? [],
      soft: initial.skills?.soft ?? [],
      languages: initial.skills?.languages ?? [],
    },
    certifications: initial.certifications,
    projects: initial.projects,
  };
}

function isStep0Valid(data: CvData): boolean {
  return (
    data.personal_info.name.trim().length > 0 &&
    data.personal_info.email.trim().length > 0
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CvBuilderWizard({
  open,
  onOpenChange,
  initialData,
  initialName,
  onSave,
}: CvBuilderWizardProps) {
  const t = useTranslations("cvBuilder.wizard");
  const defaultName = t("defaultProfileName");
  const STEPS = [
    { label: t("steps.personalInfo"), short: "1" },
    { label: t("steps.summary"), short: "2" },
    { label: t("steps.experiences"), short: "3" },
    { label: t("steps.education"), short: "4" },
    { label: t("steps.skills"), short: "5" },
  ];
  const [step, setStep] = useState(0);
  const [profileName, setProfileName] = useState(initialName ?? defaultName);
  const [formData, setFormData] = useState<CvData>(() =>
    mergeInitial(initialData),
  );
  const [saving, setSaving] = useState(false);

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      // Reset on close only if not saving
      if (!saving) {
        setStep(0);
        setFormData(mergeInitial(initialData));
        setProfileName(initialName ?? defaultName);
      }
    }
    onOpenChange(v);
  };

  const updatePersonalInfo = (updates: Partial<PersonalInfo>) =>
    setFormData((d) => ({
      ...d,
      personal_info: { ...d.personal_info, ...updates },
    }));

  const updateSummary = (value: string) =>
    setFormData((d) => ({ ...d, summary: value }));

  const updateExperiences = (experiences: Experience[]) =>
    setFormData((d) => ({ ...d, experiences }));

  const updateEducation = (education: Education[]) =>
    setFormData((d) => ({ ...d, education }));

  const updateSkills = (skills: Skills) =>
    setFormData((d) => ({ ...d, skills }));

  const canNext = step === 0 ? isStep0Valid(formData) : true;

  const handleSave = async () => {
    if (!isStep0Valid(formData)) return;
    setSaving(true);
    try {
      await onSave(profileName.trim() || defaultName, formData);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl bg-white max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-slate-900">
            {initialData ? t("editTitle") : t("createTitle")}
          </DialogTitle>
        </DialogHeader>

        {/* Profile name (always visible) */}
        <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
          <Label
            htmlFor="profile-name"
            className="text-xs whitespace-nowrap text-gray-500"
          >
            {t("profileNameLabel")}
          </Label>
          <Input
            id="profile-name"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder={t("profileNamePlaceholder")}
            className="h-7 text-sm border-0 border-b border-gray-200 rounded-none px-0 focus-visible:ring-0 focus-visible:border-[#00D9FF]"
          />
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-1.5 py-1">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <button
                onClick={() => i < step && setStep(i)}
                disabled={i >= step}
                className={cn(
                  "flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold transition-colors",
                  i < step
                    ? "bg-[#00D9FF] text-gray-900 cursor-pointer"
                    : i === step
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-400",
                )}
              >
                {i < step ? <Check className="h-3 w-3" /> : s.short}
              </button>
              <span
                className={cn(
                  "text-xs hidden sm:block",
                  i === step ? "text-gray-800 font-medium" : "text-gray-400",
                )}
              >
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "flex-1 h-px w-4 mx-1",
                    i < step ? "bg-[#00D9FF]" : "bg-gray-200",
                  )}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step content — scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0 py-2">
          {step === 0 && (
            <StepPersonalInfo
              data={formData.personal_info}
              onChange={updatePersonalInfo}
            />
          )}
          {step === 1 && (
            <StepSummary
              value={formData.summary ?? ""}
              onChange={updateSummary}
            />
          )}
          {step === 2 && (
            <StepExperiences
              data={formData.experiences}
              onChange={updateExperiences}
            />
          )}
          {step === 3 && (
            <StepEducation
              data={formData.education}
              onChange={updateEducation}
            />
          )}
          {step === 4 && (
            <StepSkills data={formData.skills} onChange={updateSkills} />
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
          >
            {t("prev")}
          </Button>

          {step < STEPS.length - 1 ? (
            <Button
              size="sm"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canNext}
              className="bg-gray-900 hover:bg-gray-700 text-white"
            >
              {t("next")}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !isStep0Valid(formData)}
              className="bg-[#00D9FF] text-gray-900 hover:bg-[#00b8d9]"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("saving")}
                </>
              ) : (
                t("save")
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
