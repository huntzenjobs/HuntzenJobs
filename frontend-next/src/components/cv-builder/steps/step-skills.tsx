"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import type { Skills, Language } from "../types";

interface Props {
  data: Skills;
  onChange: (data: Skills) => void;
}

const LANGUAGE_LEVELS = ["Notions", "Intermédiaire", "Avancé", "Courant", "Natif"];

export function StepSkills({ data, onChange }: Props) {
  const [techInput, setTechInput] = useState("");
  const [softInput, setSoftInput] = useState("");
  const [langName, setLangName] = useState("");
  const [langLevel, setLangLevel] = useState("");

  const technical = data.technical ?? [];
  const soft = data.soft ?? [];
  const languages = data.languages ?? [];

  const addTag = (
    key: "technical" | "soft",
    value: string,
    setter: (v: string) => void
  ) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const current = data[key] ?? [];
    if (!current.includes(trimmed)) {
      onChange({ ...data, [key]: [...current, trimmed] });
    }
    setter("");
  };

  const removeTag = (key: "technical" | "soft", value: string) => {
    onChange({ ...data, [key]: (data[key] ?? []).filter((t) => t !== value) });
  };

  const addLanguage = () => {
    if (!langName || !langLevel) return;
    const existing = languages.find(
      (l) => l.language.toLowerCase() === langName.trim().toLowerCase()
    );
    if (!existing) {
      onChange({
        ...data,
        languages: [...languages, { language: langName.trim(), level: langLevel }],
      });
    }
    setLangName("");
    setLangLevel("");
  };

  const removeLanguage = (lang: string) => {
    onChange({
      ...data,
      languages: languages.filter((l) => l.language !== lang),
    });
  };

  const handleTagKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    key: "technical" | "soft",
    value: string,
    setter: (v: string) => void
  ) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(key, value, setter);
    }
  };

  return (
    <div className="space-y-5">
      {/* Technical skills */}
      <div className="space-y-2">
        <Label>Compétences techniques</Label>
        <div className="flex gap-2">
          <Input
            placeholder="React, Python, SQL... (Entrée pour ajouter)"
            value={techInput}
            onChange={(e) => setTechInput(e.target.value)}
            onKeyDown={(e) => handleTagKeyDown(e, "technical", techInput, setTechInput)}
            className="text-sm"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => addTag("technical", techInput, setTechInput)}
            className="shrink-0"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {technical.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {technical.map((skill) => (
              <Badge
                key={skill}
                variant="secondary"
                className="pr-1 gap-1 text-xs"
              >
                {skill}
                <button
                  onClick={() => removeTag("technical", skill)}
                  className="ml-0.5 rounded-full hover:bg-gray-300"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Soft skills */}
      <div className="space-y-2">
        <Label>Compétences comportementales</Label>
        <div className="flex gap-2">
          <Input
            placeholder="Leadership, Travail en équipe... (Entrée pour ajouter)"
            value={softInput}
            onChange={(e) => setSoftInput(e.target.value)}
            onKeyDown={(e) => handleTagKeyDown(e, "soft", softInput, setSoftInput)}
            className="text-sm"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => addTag("soft", softInput, setSoftInput)}
            className="shrink-0"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {soft.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {soft.map((skill) => (
              <Badge
                key={skill}
                variant="outline"
                className="pr-1 gap-1 text-xs"
              >
                {skill}
                <button
                  onClick={() => removeTag("soft", skill)}
                  className="ml-0.5 rounded-full hover:bg-gray-200"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Languages */}
      <div className="space-y-2">
        <Label>Langues</Label>
        <div className="flex gap-2">
          <Input
            placeholder="Français, Anglais..."
            value={langName}
            onChange={(e) => setLangName(e.target.value)}
            className="text-sm flex-1"
          />
          <Select value={langLevel} onValueChange={setLangLevel}>
            <SelectTrigger className="w-36 text-sm">
              <SelectValue placeholder="Niveau" />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_LEVELS.map((level) => (
                <SelectItem key={level} value={level}>
                  {level}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={addLanguage}
            disabled={!langName || !langLevel}
            className="shrink-0"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {languages.length > 0 && (
          <div className="space-y-1 mt-1">
            {languages.map((l: Language) => (
              <div
                key={l.language}
                className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-1.5 text-sm"
              >
                <span className="text-gray-800">{l.language}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{l.level}</span>
                  <button
                    onClick={() => removeLanguage(l.language)}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
