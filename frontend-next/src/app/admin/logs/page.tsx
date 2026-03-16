"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Search, CheckCircle, RotateCcw } from "lucide-react";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "";

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
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const SEVERITY_STYLE: Record<string, string> = {
  info: "bg-blue-50 text-blue-700 border-blue-200",
  warning: "bg-yellow-50 text-yellow-700 border-yellow-200",
  critical: "bg-red-50 text-red-700 border-red-200",
  emergency: "bg-red-100 text-red-900 border-red-300 font-bold",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function SecurityLogsTab() {
  const [events, setEvents] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [severity, setSeverity] = useState("");
  const [eventType, setEventType] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), per_page: "50" });
      if (severity) qs.set("severity", severity);
      if (eventType) qs.set("event_type", eventType);
      const data = await adminFetch(`/api/admin/logs/security?${qs}`);
      setEvents(data.events);
      setTotal(data.total);
    } catch (e: any) {
      toast.error("Erreur lors du chargement des logs");
    } finally {
      setLoading(false);
    }
  }, [page, severity, eventType]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Type d'événement..."
            className="pl-9 h-9 w-52"
            value={eventType}
            onChange={(e) => {
              setEventType(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          value={severity || "all"}
          onValueChange={(v) => {
            setSeverity(v === "all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-36 h-9">
            <SelectValue placeholder="Sévérité" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="emergency">Emergency</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw
            className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
          />
          Actualiser
        </Button>
        <span className="text-sm text-muted-foreground self-center ml-auto">
          {total} événements
        </span>
      </div>

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/30 border-b">
              <th className="text-left px-3 py-2 font-medium">Sévérité</th>
              <th className="text-left px-3 py-2 font-medium">Événement</th>
              <th className="text-left px-3 py-2 font-medium">User</th>
              <th className="text-left px-3 py-2 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading && events.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  Chargement...
                </td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  Aucun événement
                </td>
              </tr>
            ) : (
              events.map((e) => (
                <tr key={e.id} className="border-b hover:bg-muted/10">
                  <td className="px-3 py-2">
                    <span
                      className={`px-1.5 py-0.5 rounded border text-xs ${SEVERITY_STYLE[e.severity] || ""}`}
                    >
                      {e.severity}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono">{e.event_type}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {e.profiles?.email || e.user_id?.slice(0, 8) || "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDate(e.created_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > 50 && (
        <div className="flex justify-between items-center">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Précédent
          </Button>
          <span className="text-xs text-muted-foreground">Page {page}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={page * 50 >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Suivant
          </Button>
        </div>
      )}
    </div>
  );
}

function WebhookLogsTab() {
  const [failures, setFailures] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const PER_PAGE = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetch(
        `/api/admin/logs/webhooks?page=${page}&per_page=${PER_PAGE}`,
      );
      setFailures(data.failures);
      setTotal(data.total);
    } catch (e: any) {
      toast.error("Erreur lors du chargement des webhooks");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  const resolveFailure = async (failureId: string) => {
    try {
      await adminFetch(`/api/admin/logs/webhooks/${failureId}/resolve`, {
        method: "POST",
      });
      toast.success("Webhook marqué comme résolu");
      load();
    } catch {
      toast.error("Erreur lors de la résolution");
    }
  };

  const retryWebhook = async (failureId: string) => {
    try {
      const data = await adminFetch(
        `/api/admin/logs/webhooks/${failureId}/retry`,
        { method: "POST" },
      );
      toast.success(`Webhook rejoué : ${data.event_type}`);
      load();
    } catch (e: any) {
      toast.error(e.message || "Erreur lors du retry");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {total} échec(s) webhook
        </span>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw
            className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
          />
          Actualiser
        </Button>
      </div>

      {failures.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Aucun échec webhook enregistré.
        </div>
      ) : (
        <div className="space-y-2">
          {failures.map((f: any) => (
            <Card key={f.id} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={f.resolved ? "secondary" : "destructive"}
                      className="text-xs"
                    >
                      {f.resolved ? "Résolu" : "En cours"}
                    </Badge>
                    <code className="text-xs font-mono">
                      {f.event_type || f.stripe_event_id}
                    </code>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {f.error_message}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(f.created_at)}
                  </p>
                </div>
                {!f.resolved && (
                  <div className="flex gap-1.5 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => retryWebhook(f.id)}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Retry
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => resolveFailure(f.id)}
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Résoudre
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {total > PER_PAGE && (
        <div className="flex justify-between items-center">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Précédent
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} / {Math.ceil(total / PER_PAGE)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page * PER_PAGE >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Suivant
          </Button>
        </div>
      )}
    </div>
  );
}

export default function AdminLogsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Logs & Monitoring</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Événements de sécurité, erreurs webhook et activité système.
        </p>
      </div>

      <Tabs defaultValue="security">
        <TabsList>
          <TabsTrigger value="security">Événements sécurité</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks Stripe</TabsTrigger>
        </TabsList>
        <TabsContent value="security" className="mt-4">
          <SecurityLogsTab />
        </TabsContent>
        <TabsContent value="webhooks" className="mt-4">
          <WebhookLogsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
