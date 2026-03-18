"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Bell, Send, BarChart3, Clock, Loader2 } from "lucide-react";
import { useAuthenticatedFetch } from "@/hooks/use-authenticated-fetch";
import { useDebounce } from "@/hooks/use-debounce";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "";

interface NotifPrefs {
  job_alerts: boolean;
  application_confirmation: boolean;
  weekly_summary: boolean;
  alert_frequency: "instant" | "daily" | "weekly";
}

const DEFAULT_PREFS: NotifPrefs = {
  job_alerts: true,
  application_confirmation: true,
  weekly_summary: true,
  alert_frequency: "daily",
};

export function NotificationsSection() {
  const { fetchJSON } = useAuthenticatedFetch();
  const tProfile = useTranslations("profile");
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const initialPrefs = useRef<NotifPrefs | null>(null);

  // Fetch preferences on mount
  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchJSON<NotifPrefs>(
          `${BACKEND_URL}/api/notifications/preferences`,
        );
        const loaded: NotifPrefs = {
          job_alerts: data.job_alerts ?? true,
          application_confirmation: data.application_confirmation ?? true,
          weekly_summary: data.weekly_summary ?? true,
          alert_frequency: data.alert_frequency ?? "daily",
        };
        setPrefs(loaded);
        initialPrefs.current = loaded;
      } catch {
        // Keep defaults silently
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce the whole prefs object to auto-save after 600ms idle
  const debouncedPrefs = useDebounce(prefs, 600);

  const save = useCallback(
    async (toSave: NotifPrefs) => {
      if (!initialPrefs.current) return;
      // Don't save if nothing changed
      const changed = (Object.keys(toSave) as (keyof NotifPrefs)[]).some(
        (k) => toSave[k] !== initialPrefs.current![k],
      );
      if (!changed) return;

      setSaving(true);
      try {
        await fetchJSON(`${BACKEND_URL}/api/notifications/preferences`, {
          method: "PATCH",
          body: JSON.stringify(toSave),
        });
        initialPrefs.current = toSave;
      } catch {
        toast.error(tProfile("toasts.notifSaveError"));
      } finally {
        setSaving(false);
      }
    },
    [fetchJSON],
  );

  // Auto-save when debounced value changes (skip initial load)
  useEffect(() => {
    if (loading) return;
    save(debouncedPrefs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedPrefs]);

  const toggle = (key: keyof Omit<NotifPrefs, "alert_frequency">) =>
    setPrefs((p) => ({ ...p, [key]: !p[key] }));

  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  const rows: {
    key: keyof Omit<NotifPrefs, "alert_frequency">;
    icon: typeof Bell;
    title: string;
    description: string;
    detail?: string;
  }[] = [
    {
      key: "job_alerts",
      icon: Bell,
      title: "Alertes nouvelles offres",
      description:
        "Reçois chaque matin les offres sauvegardées qui correspondent à ton profil.",
      detail: "Envoyé à 8h selon ta fréquence choisie ci-dessous",
    },
    {
      key: "application_confirmation",
      icon: Send,
      title: "Confirmation de candidature",
      description:
        "Reçois un email de confirmation à chaque fois que tu confirmes une candidature.",
      detail: "Envoyé immédiatement après confirmation",
    },
    {
      key: "weekly_summary",
      icon: BarChart3,
      title: "Bilan hebdomadaire",
      description:
        "Un résumé de ton activité de la semaine : candidatures, offres vues, documents générés.",
      detail: "Envoyé chaque lundi à 9h",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-black mb-2">Notifications</h2>
        <p className="text-gray-600">
          Choisis les emails que tu souhaites recevoir de HuntZen
        </p>
      </div>

      {/* Toggle rows */}
      <div className="space-y-6">
        {rows.map(({ key, icon: Icon, title, description, detail }) => (
          <div key={key} className="space-y-2">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1">
                <div className="mt-0.5 w-8 h-8 rounded-lg bg-[#00D9FF]/10 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-[#00D9FF]" />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor={key}
                    className="text-base font-semibold cursor-pointer"
                  >
                    {title}
                  </Label>
                  <p className="text-sm text-gray-500">{description}</p>
                </div>
              </div>
              <Switch
                id={key}
                checked={prefs[key]}
                onCheckedChange={() => toggle(key)}
                disabled={saving}
                aria-label={title}
              />
            </div>
            {prefs[key] && detail && (
              <p className="ml-11 text-xs text-gray-400 flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                {detail}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Frequency selector — only relevant if job_alerts is on */}
      {prefs.job_alerts && (
        <div className="pt-4 border-t space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-500" />
            <Label className="text-base font-semibold">
              Fréquence des alertes offres
            </Label>
          </div>
          <Select
            value={prefs.alert_frequency}
            onValueChange={(v) =>
              setPrefs((p) => ({
                ...p,
                alert_frequency: v as NotifPrefs["alert_frequency"],
              }))
            }
            disabled={saving}
          >
            <SelectTrigger className="max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Quotidien (8h)</SelectItem>
              <SelectItem value="weekly">Hebdomadaire (lundi 8h)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-400">
            Le cron filtre les users par préférence — seuls les "daily"
            reçoivent un email chaque jour.
          </p>
        </div>
      )}

      {/* Save indicator */}
      {saving && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Sauvegarde...
        </div>
      )}

      {/* Info box */}
      <div className="pt-4 border-t">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600">
          <p className="font-medium text-gray-900 mb-1">
            🔒 Tes préférences sont sauvegardées automatiquement
          </p>
          <p>
            Tu peux modifier ces paramètres à tout moment. La désinscription est
            immédiate.
          </p>
        </div>
      </div>
    </div>
  );
}
