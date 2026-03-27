"use client";

import { useEffect, useState } from "react";
import { Save, Languages, Pencil } from "lucide-react";
import {
  useAdminCoaches,
  type AdminCoach,
} from "@/hooks/admin/use-admin-coaches";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminCoachesPage() {
  const { fetchCoaches, updateCoach, translateCoach, loading } =
    useAdminCoaches();
  const [coaches, setCoaches] = useState<AdminCoach[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    fetchCoaches()
      .then(setCoaches)
      .finally(() => setFetching(false));
  }, [fetchCoaches]);

  const refresh = () => fetchCoaches().then(setCoaches);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Configuration des coaches
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Modifiez le wording, les specialites et questions de chaque coach IA.
          Les changements sont immediats.
        </p>
      </div>

      {fetching ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {coaches.map((coach) => (
            <CoachCardEditor
              key={`${coach.id}-${coach.updated_at ?? ""}`}
              coach={coach}
              onUpdate={async (id, payload) => {
                const ok = await updateCoach(id, payload);
                if (ok) refresh();
                return ok;
              }}
              onTranslate={async (id) => {
                const ok = await translateCoach(id);
                if (ok) refresh();
                return ok;
              }}
              saving={loading}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Coach Card Editor ────────────────────────────────────────────

interface CoachCardEditorProps {
  coach: AdminCoach;
  onUpdate: (id: string, payload: Record<string, unknown>) => Promise<boolean>;
  onTranslate: (id: string) => Promise<boolean>;
  saving: boolean;
}

function CoachCardEditor({
  coach,
  onUpdate,
  onTranslate,
  saving,
}: CoachCardEditorProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [shortName, setShortName] = useState(coach.short_name);
  const [description, setDescription] = useState(coach.description);
  const [specialtiesText, setSpecialtiesText] = useState(
    (coach.specialties ?? []).join("\n"),
  );
  const [questionsText, setQuestionsText] = useState(
    (coach.example_questions ?? []).join("\n"),
  );
  const [accentColor, setAccentColor] = useState(coach.accent_color);
  const [localSaving, setLocalSaving] = useState<string | null>(null);

  const handleSaveWording = async () => {
    setLocalSaving("wording");
    await onUpdate(coach.id, {
      short_name: shortName,
      description,
      specialties: specialtiesText.split("\n").filter(Boolean),
      example_questions: questionsText.split("\n").filter(Boolean),
      accent_color: accentColor,
    });
    setLocalSaving(null);
    setEditOpen(false);
  };

  const handleToggleActive = async () => {
    setLocalSaving("toggle");
    await onUpdate(coach.id, { is_active: !coach.is_active });
    setLocalSaving(null);
  };

  const handleTranslate = async () => {
    setLocalSaving("translate");
    await onTranslate(coach.id);
    setLocalSaving(null);
  };

  const translatedLangs = Object.keys(coach.translations || {});

  return (
    <>
      <Card
        className="border-t-4"
        style={{ borderTopColor: coach.accent_color }}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${coach.accent_color}20` }}
              >
                <span
                  className="text-lg font-bold"
                  style={{ color: coach.accent_color }}
                >
                  {coach.persona_name.charAt(0)}
                </span>
              </div>
              <div>
                <CardTitle className="text-base">
                  {coach.persona_name}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {coach.short_name}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {translatedLangs.length > 0 && (
                <div className="flex gap-1">
                  {translatedLangs.map((lang) => (
                    <Badge
                      key={lang}
                      variant="outline"
                      className="text-[10px] px-1.5"
                    >
                      {lang.toUpperCase()}
                    </Badge>
                  ))}
                </div>
              )}
              <Badge variant={coach.is_active ? "default" : "outline"}>
                {coach.is_active ? "Actif" : "Inactif"}
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Description */}
            <div className="lg:col-span-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Description
              </p>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {coach.description}
              </p>
            </div>

            {/* Specialties */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Specialites
              </p>
              <div className="flex flex-wrap gap-1">
                {(coach.specialties ?? []).map((s, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px]">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditOpen(true)}
                className="w-full"
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Modifier
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleTranslate}
                disabled={localSaving === "translate" || saving}
                className="w-full"
              >
                <Languages className="h-3.5 w-3.5 mr-1.5" />
                {localSaving === "translate"
                  ? "Traduction..."
                  : "Traduire toutes langues"}
              </Button>
              <div className="flex items-center justify-between px-1">
                <Label className="text-xs" htmlFor={`toggle-${coach.id}`}>
                  Actif
                </Label>
                <Switch
                  id={`toggle-${coach.id}`}
                  checked={coach.is_active}
                  onCheckedChange={handleToggleActive}
                  disabled={localSaving === "toggle" || saving}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Modifier {coach.persona_name}</DialogTitle>
            <DialogDescription>
              Modifiez le wording et les informations du coach. Les changements
              seront visibles immediatement.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Titre court</Label>
                <Input
                  className="h-8 text-sm"
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value)}
                  placeholder="Ex: Coach Carriere"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Couleur accent</Label>
                <div className="flex items-center gap-2">
                  <Input
                    className="h-8 text-sm flex-1"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    placeholder="#7C3AED"
                  />
                  <div
                    className="w-8 h-8 rounded border"
                    style={{ backgroundColor: accentColor }}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Textarea
                className="text-sm min-h-[80px]"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description du coach..."
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Specialites (une par ligne)</Label>
              <Textarea
                className="text-sm min-h-[100px] font-mono leading-relaxed"
                value={specialtiesText}
                onChange={(e) => setSpecialtiesText(e.target.value)}
                placeholder={
                  "Orientation professionnelle\nReconversion\nPlan de carriere"
                }
              />
              <p className="text-xs text-muted-foreground">
                {specialtiesText.split("\n").filter(Boolean).length}{" "}
                specialite(s)
              </p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">
                Questions exemples (une par ligne)
              </Label>
              <Textarea
                className="text-sm min-h-[100px] font-mono leading-relaxed"
                value={questionsText}
                onChange={(e) => setQuestionsText(e.target.value)}
                placeholder={
                  "On va definir ton objectif de carriere.\nTu veux evoluer ou changer de job ?"
                }
              />
              <p className="text-xs text-muted-foreground">
                {questionsText.split("\n").filter(Boolean).length} question(s)
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleSaveWording}
              disabled={localSaving === "wording" || saving}
            >
              <Save className="h-4 w-4 mr-2" />
              {localSaving === "wording" ? "Sauvegarde..." : "Sauvegarder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
