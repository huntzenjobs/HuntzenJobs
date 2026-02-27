"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PersonalInfo } from "../types";

interface Props {
  data: Partial<PersonalInfo>;
  onChange: (updates: Partial<PersonalInfo>) => void;
}

export function StepPersonalInfo({ data, onChange }: Props) {
  const field = (key: keyof PersonalInfo) => ({
    value: data[key] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ [key]: e.target.value }),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">
            Nom complet <span className="text-red-500">*</span>
          </Label>
          <Input id="name" placeholder="Marie Dupont" {...field("name")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="title">Titre / Poste visé</Label>
          <Input
            id="title"
            placeholder="Développeur Full-Stack"
            {...field("title")}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">
            Email <span className="text-red-500">*</span>
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="marie@exemple.com"
            {...field("email")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Téléphone</Label>
          <Input
            id="phone"
            type="tel"
            placeholder="+33 6 12 34 56 78"
            {...field("phone")}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="location">Localisation</Label>
          <Input id="location" placeholder="Paris, France" {...field("location")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="linkedin">LinkedIn</Label>
          <Input
            id="linkedin"
            placeholder="linkedin.com/in/marie-dupont"
            {...field("linkedin")}
          />
        </div>
      </div>
    </div>
  );
}
