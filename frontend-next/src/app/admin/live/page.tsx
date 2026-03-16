"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAdminLive } from "@/hooks/admin/use-admin-live";
import { useAdminEvents } from "@/hooks/admin/use-admin-events";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity,
  Users,
  Zap,
  Wifi,
  WifiOff,
  AlertTriangle,
} from "lucide-react";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "";

async function adminFetch(path: string, options?: RequestInit) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
      ...(options?.headers || {}),
    },
  });
  return res.json();
}

const SEVERITY_COLORS: Record<string, string> = {
  info: "bg-blue-500/10 text-blue-600 border-blue-200",
  success: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  warning: "bg-amber-500/10 text-amber-600 border-amber-200",
  error: "bg-red-500/10 text-red-600 border-red-200",
};

export default function AdminLivePage() {
  const { presence, connected: liveConnected } = useAdminLive();
  const { events, connected: eventsConnected } = useAdminEvents();
  const [maintenance, setMaintenance] = useState(false);
  const [bannerText, setBannerText] = useState("");
  const [bannerActive, setBannerActive] = useState(false);

  // Charger l'état réel de maintenance au montage
  useEffect(() => {
    adminFetch("/api/admin/maintenance")
      .then((d) => setMaintenance(d.active ?? false))
      .catch(() => {});
  }, []);

  async function toggleMaintenance() {
    const path = maintenance
      ? "/admin/maintenance/disable"
      : "/admin/maintenance/enable";
    await adminFetch(path, { method: "POST" });
    setMaintenance(!maintenance);
  }

  async function saveBanner() {
    await adminFetch("/admin/banner", {
      method: "POST",
      body: JSON.stringify({
        text: bannerText,
        type: "info",
        active: bannerActive,
      }),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">⚡ Live</h1>
          <p className="text-sm text-muted-foreground">
            Activité en temps réel
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {liveConnected ? (
            <Wifi className="h-3 w-3 text-emerald-500" />
          ) : (
            <WifiOff className="h-3 w-3 text-red-400" />
          )}
          {eventsConnected ? "Realtime actif" : "Reconnexion..."}
        </div>
      </div>

      {/* Section 1 — En ce moment */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Actifs
                </p>
                <p className="text-2xl font-bold">{presence.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        {Object.entries(presence.by_feature).map(([feat, count]) => (
          <Card key={feat}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Zap className="h-4 w-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    {feat}
                  </p>
                  <p className="text-2xl font-bold">{count}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pages actives */}
      {Object.keys(presence.by_page).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Par page</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(presence.by_page).map(([page, count]) => (
                <Badge key={page} variant="secondary">
                  {page} — {count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section 2 — Fil d'événements */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" /> Fil d'événements
            <Badge variant="outline" className="ml-auto text-xs">
              {events.length} événements
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              En attente d'événements...
            </p>
          ) : (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {events.map((ev) => (
                <div
                  key={ev.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md border text-xs ${SEVERITY_COLORS[ev.severity]}`}
                >
                  <span className="text-muted-foreground shrink-0 font-mono">
                    {new Date(ev.created_at).toLocaleTimeString("fr-FR")}
                  </span>
                  <span className="flex-1">
                    {ev.event_label || ev.event_name}
                  </span>
                  {ev.feature && (
                    <Badge variant="outline" className="text-xs">
                      {ev.feature}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3 — Santé & contrôles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Mode maintenance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Active un écran de maintenance pour tous les utilisateurs (l'admin
              reste accessible).
            </p>
            <Button
              variant={maintenance ? "destructive" : "outline"}
              size="sm"
              onClick={toggleMaintenance}
            >
              {maintenance ? "Désactiver maintenance" : "Activer maintenance"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Banner site-wide</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              className="w-full text-sm border rounded px-3 py-1.5 bg-background"
              placeholder="Message du banner..."
              value={bannerText}
              onChange={(e) => setBannerText(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={bannerActive}
                  onChange={(e) => setBannerActive(e.target.checked)}
                />
                Actif
              </label>
              <Button size="sm" onClick={saveBanner} disabled={!bannerText}>
                Enregistrer
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
