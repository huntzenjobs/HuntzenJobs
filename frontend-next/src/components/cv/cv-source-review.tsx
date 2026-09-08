"use client";

import { Button } from "@/components/ui/button";
import { AlertCircle, ChevronDown, FileSearch, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

type FactualScalar = string;
type FactualField = FactualScalar | FactualScalar[];
export type FactualRecord = Record<string, FactualField>;

export interface FactualReference {
  personal_info: FactualRecord;
  experiences: FactualRecord[];
  education: FactualRecord[];
  certifications: FactualRecord[];
  projects: FactualRecord[];
  skills: FactualRecord;
  interests: FactualScalar[];
}

interface CVSourceReviewProps {
  file: File;
  accessToken?: string;
  onConfirm: (rawText: string, factualReference: FactualReference) => void;
  onCancel: () => void;
  initialReview?: { rawText: string; factualReference: FactualReference };
}

type CollectionSection = "experiences" | "education" | "certifications" | "projects";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "";
const COLLECTION_SECTIONS: CollectionSection[] = ["experiences", "education", "certifications", "projects"];
const EMPTY_ITEMS: Record<CollectionSection, FactualRecord> = {
  experiences: { title: "", company: "", location: "", start_date: "", end_date: "", type: "", bullets: [] },
  education: { degree: "", school: "", year: "", location: "", details: "" },
  certifications: { name: "", issuer: "", year: "" },
  projects: { name: "", description: "", technologies: [], url: "" },
};
const EMPTY_REFERENCE: FactualReference = {
  personal_info: { name: "", title: "", email: "", phone: "", location: "", linkedin: "", github: "", twitter: "", portfolio: "", driving_license: "" },
  experiences: [], education: [], certifications: [], projects: [],
  skills: { technical: [], tools: [], soft: [], languages: [] }, interests: [],
};

function isScalar(value: unknown): value is FactualScalar {
  return typeof value === "string";
}

function normalizeRecord(value: unknown): FactualRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record: FactualRecord = {};
  for (const [key, field] of Object.entries(value)) {
    if (isScalar(field)) record[key] = field;
    else if (Array.isArray(field)) record[key] = field.filter(isScalar);
  }
  return record;
}

function normalizeResponse(value: unknown): { cv_text: string; factual_reference: FactualReference } | null {
  if (!value || typeof value !== "object") return null;
  const response = value as Record<string, unknown>;
  const candidate = response.factual_reference;
  if (typeof response.cv_text !== "string" || !candidate || typeof candidate !== "object") return null;
  const source = candidate as Record<string, unknown>;
  const collection = (key: CollectionSection) =>
    Array.isArray(source[key]) ? source[key].map(normalizeRecord) : [];
  return {
    cv_text: response.cv_text,
    factual_reference: {
      personal_info: normalizeRecord(source.personal_info),
      experiences: collection("experiences"),
      education: collection("education"),
      certifications: collection("certifications"),
      projects: collection("projects"),
      skills: normalizeRecord(source.skills),
      interests: Array.isArray(source.interests) ? source.interests.filter(isScalar) : [],
    },
  };
}

function displayValue(value: FactualScalar): string {
  return value;
}

interface FieldInputProps {
  id: string;
  fieldKey: string;
  value: FactualScalar;
  label: string;
  onChange: (value: string) => void;
}

function FieldInput({ id, fieldKey, value, label, onChange }: FieldInputProps) {
  const multiline = ["description", "details", "summary"].includes(fieldKey);
  const className = "min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-950 outline-none focus-visible:border-[#00B8D9] focus-visible:ring-2 focus-visible:ring-[#00D9FF]/25 sm:text-sm";
  return (
    <label className={multiline ? "sm:col-span-2" : ""} htmlFor={id}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {multiline ? (
        <textarea id={id} rows={3} value={displayValue(value)} onChange={(event) => onChange(event.target.value)} className={className} />
      ) : (
        <input id={id} value={displayValue(value)} onChange={(event) => onChange(event.target.value)} className={className} />
      )}
    </label>
  );
}

interface EditorSectionProps { title: string; children: ReactNode }
function EditorSection({ title, children }: EditorSectionProps) {
  return <section className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4"><h3 className="mb-3 text-base font-semibold text-slate-950">{title}</h3>{children}</section>;
}

export function CVSourceReview({ file, accessToken, onConfirm, onCancel, initialReview }: CVSourceReviewProps) {
  const t = useTranslations("cvSourceReview");
  const idPrefix = useId();
  const [rawText, setRawText] = useState(initialReview?.rawText ?? "");
  const [reference, setReference] = useState<FactualReference>(initialReview?.factualReference ?? EMPTY_REFERENCE);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(!initialReview);
  const [error, setError] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const accessTokenRef = useRef(accessToken);
  const hasCandidateName = String(reference.personal_info.name ?? "").trim().length > 0;

  useEffect(() => { accessTokenRef.current = accessToken; }, [accessToken]);

  const prepare = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(false);
    setConfirmed(false);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await fetch(BACKEND_URL + "/api/cv-adapter/prepare-structured-review", {
        method: "POST",
        body: formData,
        headers: accessTokenRef.current ? { Authorization: "Bearer " + accessTokenRef.current } : undefined,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("structured review failed");
      const data = normalizeResponse(await response.json());
      if (!data) throw new Error("invalid structured review");
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setRawText(data.cv_text);
      setReference(data.factual_reference);
    } catch (requestError) {
      if (!mountedRef.current || requestId !== requestIdRef.current || (requestError instanceof Error && requestError.name === "AbortError")) return;
      setError(true);
      setRawText("");
      setReference(EMPTY_REFERENCE);
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) setLoading(false);
    }
  }, [file]);

  useEffect(() => {
    if (initialReview) return;
    mountedRef.current = true;
    void prepare();
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      controllerRef.current?.abort();
    };
  }, [initialReview, prepare]);

  const mutate = (updater: (current: FactualReference) => FactualReference) => {
    setReference(updater);
    setConfirmed(false);
  };
  const fieldLabel = (section: string, key: string) => {
    if (key === "name" && section === "certifications") return t("fields_certification_name");
    if (key === "name" && section === "projects") return t("fields_project_name");
    return t("fields_" + key);
  };
  const sectionLabel = (section: string) => t("sections_" + section);
  const updateRoot = (section: "personal_info" | "skills", key: string, value: FactualField) => {
    mutate((current) => ({ ...current, [section]: { ...current[section], [key]: value } }));
  };
  const updateItem = (section: CollectionSection, itemIndex: number, key: string, value: FactualField) => {
    mutate((current) => ({
      ...current,
      [section]: current[section].map((item, index) => index === itemIndex ? { ...item, [key]: value } : item),
    }));
  };

  const renderField = (
    section: "personal_info" | "skills" | CollectionSection,
    fieldKey: string,
    value: FactualField,
    itemIndex?: number,
  ) => {
    if (Array.isArray(value)) {
      const update = (next: FactualScalar[]) => itemIndex === undefined
        ? updateRoot(section as "personal_info" | "skills", fieldKey, next)
        : updateItem(section as CollectionSection, itemIndex, fieldKey, next);
      const arraySectionLabel = section === "skills"
        ? fieldLabel(section, fieldKey)
        : sectionLabel(section);
      return (
        <div key={fieldKey} className="space-y-2 sm:col-span-2">
          <p className="text-xs font-medium text-slate-600">{fieldLabel(section, fieldKey)}</p>
          {value.map((entry, valueIndex) => (
            <div key={valueIndex} className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <FieldInput id={[idPrefix, section, itemIndex ?? "root", fieldKey, valueIndex].join("-")} fieldKey={fieldKey} value={entry} label={fieldLabel(section, fieldKey)} onChange={(next) => update(value.map((item, index) => index === valueIndex ? next : item))} />
              </div>
              <Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11 text-slate-500 hover:text-red-700" aria-label={t("removeSkillValue", { index: valueIndex + 1, section: arraySectionLabel })} onClick={() => update(value.filter((_, index) => index !== valueIndex))}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="min-h-11" aria-label={t("addSkillValue", { section: arraySectionLabel })} onClick={() => update([...value, ""])}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />{t("addValue")}</Button>
        </div>
      );
    }
    return <FieldInput key={fieldKey} id={[idPrefix, section, itemIndex ?? "root", fieldKey].join("-")} fieldKey={fieldKey} value={value} label={fieldLabel(section, fieldKey)} onChange={(next) => itemIndex === undefined ? updateRoot(section as "personal_info" | "skills", fieldKey, next) : updateItem(section as CollectionSection, itemIndex, fieldKey, next)} />;
  };

  return (
    <section className="space-y-5" aria-labelledby="cv-source-review-title">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-[#00D9FF]/10 p-2 text-slate-900"><FileSearch className="h-5 w-5" aria-hidden="true" /></div>
        <div><h2 id="cv-source-review-title" className="text-lg font-semibold text-slate-950">{t("title")}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{t("guidance")}</p></div>
      </div>
      {loading && <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t("loading")}</div>}
      {error && <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="alert"><div className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{t("extractionError")}</span></div><Button type="button" variant="outline" className="min-h-11" onClick={() => void prepare()}><RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />{t("retry")}</Button></div>}
      {!loading && (
        <div className="space-y-4">
          <EditorSection title={t("sections_personal_info")}><div className="grid gap-3 sm:grid-cols-2">{Object.entries(reference.personal_info).map(([key, value]) => renderField("personal_info", key, value))}</div></EditorSection>
          {!hasCandidateName && <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{t("missingName")}</span></div>}
          {COLLECTION_SECTIONS.map((section) => (
            <EditorSection key={section} title={t("sections_" + section)}>
              <div className="space-y-3">
                {reference[section].length === 0 && <p className="rounded-md bg-slate-50 px-3 py-4 text-sm text-slate-500">{t("emptySection")}</p>}
                {reference[section].map((item, index) => (
                  <div key={index} className="rounded-lg border border-slate-200 p-3 sm:p-4">
                    <div className="mb-3 flex justify-end"><Button type="button" variant="ghost" size="sm" className="min-h-11 text-slate-500 hover:text-red-700" aria-label={t("removeEntry_" + section, { index: index + 1 })} onClick={() => mutate((current) => ({ ...current, [section]: current[section].filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />{t("removeItem")}</Button></div>
                    <div className="grid gap-3 sm:grid-cols-2">{Object.entries(item).map(([key, value]) => renderField(section, key, value, index))}</div>
                  </div>
                ))}
                <Button type="button" variant="outline" className="min-h-11" aria-label={t("addEntry_" + section)} onClick={() => mutate((current) => ({ ...current, [section]: [...current[section], { ...EMPTY_ITEMS[section] }] }))}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />{t("addItem")}</Button>
              </div>
            </EditorSection>
          ))}
          <EditorSection title={t("sections_skills")}>
            {Object.keys(reference.skills).length === 0 && <p className="rounded-md bg-slate-50 px-3 py-4 text-sm text-slate-500">{t("emptySection")}</p>}
            <div className="grid gap-3 sm:grid-cols-2">{Object.entries(reference.skills).map(([key, value]) => renderField("skills", key, value))}</div>
          </EditorSection>
          <EditorSection title={t("sections_interests")}>
            <div className="space-y-2">
              {reference.interests.length === 0 && <p className="rounded-md bg-slate-50 px-3 py-4 text-sm text-slate-500">{t("emptySection")}</p>}
              {reference.interests.map((interest, index) => (
                <div key={index} className="flex items-end gap-2"><div className="min-w-0 flex-1"><FieldInput id={[idPrefix, "interest", index].join("-")} fieldKey="value" value={interest} label={fieldLabel("interests", "value")} onChange={(next) => mutate((current) => ({ ...current, interests: current.interests.map((item, itemIndex) => itemIndex === index ? next : item) }))} /></div><Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11 text-slate-500 hover:text-red-700" aria-label={t("removeInterest", { index: index + 1 })} onClick={() => mutate((current) => ({ ...current, interests: current.interests.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button></div>
              ))}
              <Button type="button" variant="outline" className="min-h-11" aria-label={t("addInterest")} onClick={() => mutate((current) => ({ ...current, interests: [...current.interests, ""] }))}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />{t("addValue")}</Button>
            </div>
          </EditorSection>
          <details open={error || undefined} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-medium text-slate-800"><span>{t("rawTextTitle")}</span><ChevronDown className="h-4 w-4" aria-hidden="true" /></summary>
            <p className="mb-2 text-xs leading-5 text-slate-500">{t("rawTextGuidance")}</p>
            <textarea readOnly={!error} maxLength={100000} value={rawText} onChange={(event) => { setRawText(event.target.value); setConfirmed(false); }} rows={8} aria-label={t("rawTextTitle")} className="w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-base leading-6 text-slate-700 sm:text-sm" />
            {error && <p className="mt-2 text-xs text-amber-800">{t("manualGuidance")}</p>}
          </details>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-700 focus-within:ring-2 focus-within:ring-[#00D9FF]/40"><input type="checkbox" checked={confirmed} disabled={!hasCandidateName} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#00B8D9]" /><span>{t("confirmationLabel")}</span></label>
        </div>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="outline" className="min-h-11" onClick={onCancel}>{t("replaceFile")}</Button>
        <Button type="button" disabled={loading || !hasCandidateName || !confirmed || (error && rawText.trim().length < 100) || rawText.length > 100000} onClick={() => onConfirm(rawText.trim(), reference)} className="min-h-11 bg-[#00D9FF] font-semibold text-slate-950 hover:bg-[#00C4EA]">{t("confirm")}</Button>
      </div>
    </section>
  );
}
