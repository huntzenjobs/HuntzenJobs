"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface AlertCategory {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
}

async function adminFetch(path: string, options?: RequestInit) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function AdminNotificationsPage() {
  const [categories, setCategories] = useState<AlertCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadPreferences = useCallback(async () => {
    try {
      setLoading(true);
      const data = await adminFetch("/api/admin/alert-preferences");
      setCategories(data.categories);
    } catch {
      toast.error("Erreur lors du chargement des preferences");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const toggleCategory = (key: string) => {
    setCategories((prev) =>
      prev.map((cat) =>
        cat.key === key ? { ...cat, enabled: !cat.enabled } : cat
      )
    );
  };

  const savePreferences = async () => {
    try {
      setSaving(true);
      const prefs: Record<string, boolean> = {};
      categories.forEach((cat) => {
        prefs[cat.key] = cat.enabled;
      });
      await adminFetch("/api/admin/alert-preferences", {
        method: "PUT",
        body: JSON.stringify({ preferences: prefs }),
      });
      toast.success("Preferences sauvegardees");
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const enabledCount = categories.filter((c) => c.enabled).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications Admin</h1>
          <p className="text-muted-foreground mt-1">
            Gerez les emails de notification envoyes a l&apos;admin.
            {" "}
            <span className="font-medium">
              {enabledCount}/{categories.length} actives
            </span>
          </p>
        </div>
        <Button onClick={savePreferences} disabled={saving || loading}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : null}
          Sauvegarder
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4">
          {categories.map((cat) => (
            <Card key={cat.key}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-4">
                  {cat.enabled ? (
                    <Bell className="h-5 w-5 text-ocean" />
                  ) : (
                    <BellOff className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div>
                    <Label
                      htmlFor={cat.key}
                      className="text-base font-medium cursor-pointer"
                    >
                      {cat.label}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {cat.description}
                    </p>
                  </div>
                </div>
                <Switch
                  id={cat.key}
                  checked={cat.enabled}
                  onCheckedChange={() => toggleCategory(cat.key)}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
