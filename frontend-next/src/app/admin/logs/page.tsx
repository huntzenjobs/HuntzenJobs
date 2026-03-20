"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
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
import { Card } from "@/components/ui/card";
import {
  RefreshCw,
  Search,
  CheckCircle,
  RotateCcw,
  ShieldBan,
  Trash2,
  ChevronDown,
  ChevronRight,
  Activity,
} from "lucide-react";

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

const FEATURE_STYLE: Record<string, string> = {
  coach: "bg-purple-50 text-purple-700 border-purple-200",
  cv_analysis: "bg-green-50 text-green-700 border-green-200",
  job_search: "bg-blue-50 text-blue-700 border-blue-200",
  assistant: "bg-indigo-50 text-indigo-700 border-indigo-200",
  admin: "bg-orange-50 text-orange-700 border-orange-200",
};

const FEATURE_LABELS: Record<string, string> = {
  coach: "Coach",
  cv_analysis: "CV",
  job_search: "Recherche",
  assistant: "Assistant",
  admin: "Admin",
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

// ============================================================
// Onglet Activité plateforme (user_events)
// ============================================================
function PlatformEventsTab() {
  const [events, setEvents] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [feature, setFeature] = useState("");
  const [severity, setSeverity] = useState("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const PER_PAGE = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        per_page: String(PER_PAGE),
      });
      if (search) qs.set("search", search);
      if (feature) qs.set("feature", feature);
      if (severity) qs.set("severity", severity);
      const data = await adminFetch(`/api/admin/events?${qs}`);
      setEvents(data.events || []);
      setTotal(data.total || 0);
    } catch {
      toast.error("Erreur lors du chargement des événements");
    } finally {
      setLoading(false);
    }
  }, [page, search, feature, severity]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher dans les labels..."
            className="pl-9 h-9 w-64"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          value={feature || "all"}
          onValueChange={(v) => {
            setFeature(v === "all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-36 h-9">
            <SelectValue placeholder="Fonctionnalité" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes</SelectItem>
            <SelectItem value="coach">Coach</SelectItem>
            <SelectItem value="cv_analysis">CV</SelectItem>
            <SelectItem value="job_search">Recherche</SelectItem>
            <SelectItem value="assistant">Assistant</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={severity || "all"}
          onValueChange={(v) => {
            setSeverity(v === "all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-32 h-9">
            <SelectValue placeholder="Sévérité" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw
            className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
          />
          Actualiser
        </Button>
        <span className="text-sm text-muted-foreground ml-auto">
          {total.toLocaleString()} événements
        </span>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/30 border-b">
              <th className="w-6 px-2 py-2" />
              <th className="text-left px-3 py-2 font-medium">Événement</th>
              <th className="text-left px-3 py-2 font-medium w-24">Feature</th>
              <th className="text-left px-3 py-2 font-medium w-20">Sévérité</th>
              <th className="text-left px-3 py-2 font-medium w-32">
                Utilisateur
              </th>
              <th className="text-left px-3 py-2 font-medium w-32">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading && events.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  Chargement...
                </td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  Aucun événement
                </td>
              </tr>
            ) : (
              events.map((e) => {
                const isExpanded = expandedId === e.id;
                const hasProps =
                  e.properties && Object.keys(e.properties).length > 0;
                return (
                  <Fragment key={e.id}>
                    <tr
                      className={`border-b ${hasProps ? "cursor-pointer hover:bg-muted/10" : ""}`}
                      onClick={() =>
                        hasProps && setExpandedId(isExpanded ? null : e.id)
                      }
                    >
                      <td className="px-2 py-2 text-muted-foreground">
                        {hasProps ? (
                          isExpanded ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground leading-tight">
                          {e.event_label || e.event_name || "—"}
                        </div>
                        <div className="text-muted-foreground text-[10px] mt-0.5 font-mono">
                          {e.event_name}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {e.feature ? (
                          <span
                            className={`px-1.5 py-0.5 rounded border text-xs ${FEATURE_STYLE[e.feature] || "bg-gray-50 text-gray-700 border-gray-200"}`}
                          >
                            {FEATURE_LABELS[e.feature] || e.feature}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {e.severity ? (
                          <span
                            className={`px-1.5 py-0.5 rounded border text-xs ${SEVERITY_STYLE[e.severity] || ""}`}
                          >
                            {e.severity}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground truncate max-w-[130px]">
                        {e.email ||
                          (e.user_id ? e.user_id.slice(0, 8) + "…" : "anonyme")}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {formatDate(e.created_at)}
                      </td>
                    </tr>
                    {isExpanded && hasProps && (
                      <tr
                        key={`${e.id}-detail`}
                        className="bg-muted/5 border-b"
                      >
                        <td />
                        <td colSpan={5} className="px-3 py-2">
                          <pre className="text-[10px] text-muted-foreground bg-muted/20 rounded p-2 overflow-auto max-h-32">
                            {JSON.stringify(e.properties, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

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

// ============================================================
// Onglet Événements sécurité
// ============================================================
function SecurityLogsTab() {
  const [events, setEvents] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [severity, setSeverity] = useState("");
  const [eventType, setEventType] = useState("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), per_page: "50" });
      if (severity) qs.set("severity", severity);
      if (eventType) qs.set("event_type", eventType);
      const data = await adminFetch(`/api/admin/logs/security?${qs}`);
      setEvents(data.events);
      setTotal(data.total);
    } catch {
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
              <th className="w-6 px-2 py-2" />
              <th className="text-left px-3 py-2 font-medium w-24">Sévérité</th>
              <th className="text-left px-3 py-2 font-medium">
                Type d&apos;événement
              </th>
              <th className="text-left px-3 py-2 font-medium w-32">IP</th>
              <th className="text-left px-3 py-2 font-medium w-32">User</th>
              <th className="text-left px-3 py-2 font-medium w-32">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading && events.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  Chargement...
                </td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  Aucun événement
                </td>
              </tr>
            ) : (
              events.map((e) => {
                const isExpanded = expandedId === e.id;
                const hasData =
                  e.event_data && Object.keys(e.event_data).length > 0;
                return (
                  <Fragment key={e.id}>
                    <tr
                      className={`border-b ${hasData ? "cursor-pointer hover:bg-muted/10" : ""}`}
                      onClick={() =>
                        hasData && setExpandedId(isExpanded ? null : e.id)
                      }
                    >
                      <td className="px-2 py-2 text-muted-foreground">
                        {hasData ? (
                          isExpanded ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-1.5 py-0.5 rounded border text-xs ${SEVERITY_STYLE[e.severity] || ""}`}
                        >
                          {e.severity}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono">{e.event_type}</td>
                      <td className="px-3 py-2 text-muted-foreground font-mono">
                        {e.ip_address || "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground truncate max-w-[130px]">
                        {e.profiles?.email ||
                          (e.user_id ? e.user_id.slice(0, 8) + "…" : "—")}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {formatDate(e.created_at)}
                      </td>
                    </tr>
                    {isExpanded && hasData && (
                      <tr
                        key={`${e.id}-detail`}
                        className="bg-muted/5 border-b"
                      >
                        <td />
                        <td colSpan={5} className="px-3 py-2">
                          <pre className="text-[10px] text-muted-foreground bg-muted/20 rounded p-2 overflow-auto max-h-32">
                            {JSON.stringify(e.event_data, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
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

// ============================================================
// Onglet Webhooks Stripe
// ============================================================
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
    } catch {
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

// ============================================================
// Onglet Sécurité IP
// ============================================================
function SecurityIPTab() {
  const [bannedIPs, setBannedIPs] = useState<any[]>([]);
  const [blacklistedEmails, setBlacklistedEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [ipInput, setIPInput] = useState("");
  const [ipReason, setIPReason] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [emailReason, setEmailReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ipsData, emailsData] = await Promise.all([
        adminFetch("/api/admin/banned-ips"),
        adminFetch("/api/admin/blacklisted-emails"),
      ]);
      setBannedIPs(ipsData.ips || []);
      setBlacklistedEmails(emailsData.emails || []);
    } catch {
      toast.error("Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const banIP = async () => {
    if (!ipInput.trim()) return;
    try {
      await adminFetch("/api/admin/ban-ip", {
        method: "POST",
        body: JSON.stringify({ ip: ipInput.trim(), reason: ipReason }),
      });
      toast.success(`IP ${ipInput} bannie`);
      setIPInput("");
      setIPReason("");
      load();
    } catch (e: any) {
      toast.error(e.message || "Erreur");
    }
  };

  const unbanIP = async (ip: string) => {
    try {
      await adminFetch(`/api/admin/ban-ip/${encodeURIComponent(ip)}`, {
        method: "DELETE",
      });
      toast.success(`IP ${ip} débannie`);
      load();
    } catch {
      toast.error("Erreur lors du débannissement");
    }
  };

  const blacklistEmail = async () => {
    if (!emailInput.trim()) return;
    try {
      await adminFetch("/api/admin/blacklist-email", {
        method: "POST",
        body: JSON.stringify({ email: emailInput.trim(), reason: emailReason }),
      });
      toast.success(`Email ${emailInput} blacklisté`);
      setEmailInput("");
      setEmailReason("");
      load();
    } catch (e: any) {
      toast.error(e.message || "Erreur");
    }
  };

  const ttlDays = (ttl: number) =>
    ttl > 0 ? `${Math.ceil(ttl / 86400)}j` : "Expiré";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* IPs bannies */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-1.5">
            <ShieldBan className="h-4 w-4 text-destructive" />
            IPs bannies ({bannedIPs.length})
          </h3>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Adresse IP..."
            className="h-8 text-xs"
            value={ipInput}
            onChange={(e) => setIPInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && banIP()}
          />
          <Input
            placeholder="Raison"
            className="h-8 text-xs w-28"
            value={ipReason}
            onChange={(e) => setIPReason(e.target.value)}
          />
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={banIP}
            disabled={!ipInput.trim()}
          >
            Bannir
          </Button>
        </div>
        <div className="rounded-md border overflow-hidden">
          {bannedIPs.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              Aucune IP bannie
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/30 border-b">
                  <th className="text-left px-3 py-1.5 font-medium">IP</th>
                  <th className="text-left px-3 py-1.5 font-medium">Raison</th>
                  <th className="text-left px-3 py-1.5 font-medium">
                    Expiration
                  </th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {bannedIPs.map((entry) => (
                  <tr key={entry.ip} className="border-b hover:bg-muted/10">
                    <td className="px-3 py-1.5 font-mono">{entry.ip}</td>
                    <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[100px]">
                      {entry.reason || "—"}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">
                      {ttlDays(entry.ttl_seconds)}
                    </td>
                    <td className="px-2 py-1.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => unbanIP(entry.ip)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Emails blacklistés */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm flex items-center gap-1.5">
          <ShieldBan className="h-4 w-4 text-orange-500" />
          Emails blacklistés ({blacklistedEmails.length})
        </h3>
        <div className="flex gap-2">
          <Input
            placeholder="email@domaine.com"
            className="h-8 text-xs"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && blacklistEmail()}
          />
          <Input
            placeholder="Raison"
            className="h-8 text-xs w-28"
            value={emailReason}
            onChange={(e) => setEmailReason(e.target.value)}
          />
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={blacklistEmail}
            disabled={!emailInput.trim()}
          >
            Bloquer
          </Button>
        </div>
        <div className="rounded-md border overflow-hidden">
          {blacklistedEmails.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              Aucun email blacklisté
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/30 border-b">
                  <th className="text-left px-3 py-1.5 font-medium">Email</th>
                  <th className="text-left px-3 py-1.5 font-medium">Raison</th>
                  <th className="text-left px-3 py-1.5 font-medium">
                    Expiration
                  </th>
                </tr>
              </thead>
              <tbody>
                {blacklistedEmails.map((entry) => (
                  <tr key={entry.email} className="border-b hover:bg-muted/10">
                    <td className="px-3 py-1.5 font-mono">{entry.email}</td>
                    <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[100px]">
                      {entry.reason || "—"}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">
                      {ttlDays(entry.ttl_seconds)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Page principale
// ============================================================
export default function AdminLogsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Logs & Monitoring</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Activité plateforme, événements de sécurité, webhooks et sécurité IP.
        </p>
      </div>

      <Tabs defaultValue="activity">
        <TabsList>
          <TabsTrigger value="activity" className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            Activité
          </TabsTrigger>
          <TabsTrigger value="security">Sécurité</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks Stripe</TabsTrigger>
          <TabsTrigger value="ip-security">Sécurité IP</TabsTrigger>
        </TabsList>
        <TabsContent value="activity" className="mt-4">
          <PlatformEventsTab />
        </TabsContent>
        <TabsContent value="security" className="mt-4">
          <SecurityLogsTab />
        </TabsContent>
        <TabsContent value="webhooks" className="mt-4">
          <WebhookLogsTab />
        </TabsContent>
        <TabsContent value="ip-security" className="mt-4">
          <SecurityIPTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
