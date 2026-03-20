"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAdminLive } from "@/hooks/admin/use-admin-live";
import { toast } from "sonner";
import type { SecurityEvent } from "@/types/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  TrendingUp,
  DollarSign,
  UserMinus,
  UserPlus,
  AlertTriangle,
  Zap,
  BarChart3,
  ShieldCheck,
  Gift,
  Briefcase,
  Package,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "";

async function adminFetch(path: string) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

interface Stats {
  total_users: number;
  webhook_failures_pending: number;
  mrr: number;
  paying_users: number;
  new_users_today: number;
  new_users_7d: number;
  churn_30d: number;
  arpu: number;
}

interface GrowthPoint {
  [key: string]: string | number | null | undefined;
  date: string;
  new_signups: number;
  cumulative: number;
}

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  trend,
  danger,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  trend?: string;
  danger?: boolean;
}) {
  return (
    <Card className={danger ? "border-destructive/30" : ""}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {label}
            </p>
            <p
              className={`text-2xl font-bold ${danger ? "text-destructive" : ""}`}
            >
              {value}
            </p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
            {trend && (
              <p className="text-xs text-emerald-600 font-medium">{trend}</p>
            )}
          </div>
          <div
            className={`h-9 w-9 rounded-lg flex items-center justify-center ${danger ? "bg-destructive/10" : "bg-primary/10"}`}
          >
            <Icon
              className={`h-4 w-4 ${danger ? "text-destructive" : "text-primary"}`}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniBarChart<
  T extends Record<string, string | number | null | undefined>,
>({
  data,
  maxVal,
  dateKey,
  valueKey,
  color = "bg-primary",
}: {
  data: T[];
  maxVal: number;
  dateKey: keyof T & string;
  valueKey: keyof T & string;
  color?: string;
}) {
  if (!data.length)
    return (
      <div className="h-16 flex items-center justify-center text-xs text-muted-foreground">
        Aucune donnée
      </div>
    );
  const max =
    maxVal || Math.max(...data.map((d) => Number(d[valueKey]) || 0), 1);
  return (
    <div className="flex items-end gap-0.5 h-16">
      {data.map((d, i) => {
        const val = Number(d[valueKey]) || 0;
        const pct = Math.max((val / max) * 100, val > 0 ? 4 : 0);
        return (
          <div
            key={i}
            className="flex-1 flex flex-col items-center justify-end group relative"
          >
            <div
              className={`w-full rounded-sm ${color} opacity-80 group-hover:opacity-100 transition-opacity`}
              style={{
                height: `${pct}%`,
                minHeight: val > 0 ? "3px" : "1px",
              }}
            />
            {/* tooltip on hover */}
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-[10px] px-1.5 py-0.5 rounded shadow-md opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-10">
              {String(d[dateKey] ?? "").slice(5)}:{" "}
              <strong>{d[valueKey]}</strong>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const QUICK_LINKS = [
  {
    href: "/admin/users",
    label: "Utilisateurs",
    icon: Users,
    desc: "Gérer les comptes",
  },
  {
    href: "/admin/analytics",
    label: "Analytics",
    icon: BarChart3,
    desc: "Revenue & usage",
  },
  {
    href: "/admin/plans",
    label: "Packages",
    icon: Package,
    desc: "Limites & features",
  },
  {
    href: "/admin/logs",
    label: "Logs",
    icon: ShieldCheck,
    desc: "Sécurité & webhooks",
  },
  {
    href: "/admin/referrals",
    label: "Parrainage",
    icon: Gift,
    desc: "Leaderboard & config",
  },
  {
    href: "/admin/recruiter-requests",
    label: "Consultations",
    icon: Briefcase,
    desc: "Demandes recruteurs",
  },
];

interface HealthService {
  name: string;
  status: "ok" | "error";
  latency_ms: number;
}
interface HealthData {
  status: "ok" | "degraded";
  services: HealthService[];
}

export default function AdminDashboardPage() {
  const { presence, connected } = useAdminLive();
  const [stats, setStats] = useState<Stats | null>(null);
  const [growth, setGrowth] = useState<GrowthPoint[]>([]);
  const [recentEvents, setRecentEvents] = useState<SecurityEvent[]>([]);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const loadHealth = useCallback(async () => {
    try {
      const h = await adminFetch("/api/admin/health");
      setHealth(h);
    } catch {}
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, g, logs] = await Promise.all([
        adminFetch("/api/admin/stats"),
        adminFetch("/api/admin/analytics/growth?days=30"),
        adminFetch("/api/admin/logs/security?per_page=8&severity=warning"),
      ]);
      setStats(s);
      setGrowth(g.growth || []);
      setRecentEvents(logs.events || []);
      setLastRefresh(new Date());
    } catch {
      toast.error("Impossible de charger le dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadHealth();
    const interval = setInterval(loadHealth, 60_000);
    return () => clearInterval(interval);
  }, [load, loadHealth]);

  const formatEur = (v: number) =>
    `€${v.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const maxSignups = growth.length
    ? Math.max(...growth.map((g) => g.new_signups), 1)
    : 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Vue d'ensemble en temps réel — màj{" "}
            {lastRefresh.toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw
            className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
          />
          Actualiser
        </Button>
      </div>

      {/* Live users card */}
      <Link href="/admin/live">
        <Card className="border-primary/20 hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer bg-primary/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Actifs maintenant
                </p>
                <p className="text-3xl font-bold text-primary">
                  {presence.total}
                </p>
                <p className="text-xs text-muted-foreground">
                  utilisateurs en ligne → voir le live
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1 text-right">
                  {Object.entries(presence.by_page)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 3)
                    .map(([page, count]) => (
                      <p key={page} className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {count}
                        </span>{" "}
                        {page}
                      </p>
                    ))}
                </div>
                <div className="relative h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Activity className="h-5 w-5 text-primary" />
                  {connected && (
                    <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-background" />
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>

      {/* KPI Grid */}
      {loading && !stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-5 h-24 animate-pulse bg-muted rounded" />
            </Card>
          ))}
        </div>
      ) : (
        stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="Utilisateurs"
              value={stats.total_users.toLocaleString("fr-FR")}
              sub={`+${stats.new_users_today} aujourd'hui`}
              icon={Users}
              trend={`+${stats.new_users_7d} cette semaine`}
            />
            <KpiCard
              label="MRR"
              value={formatEur(stats.mrr)}
              sub={`ARR estimé : ${formatEur(stats.mrr * 12)}`}
              icon={DollarSign}
            />
            <KpiCard
              label="Abonnés payants"
              value={stats.paying_users.toLocaleString("fr-FR")}
              sub={`${stats.total_users > 0 ? ((stats.paying_users / stats.total_users) * 100).toFixed(1) : 0}% de conversion`}
              icon={TrendingUp}
            />
            <KpiCard
              label="ARPU"
              value={formatEur(stats.arpu)}
              sub="Revenu moyen par user payant"
              icon={Zap}
            />
            <KpiCard
              label="Churn 30j"
              value={String(stats.churn_30d)}
              sub="Résiliations dernier mois"
              icon={UserMinus}
              danger={stats.churn_30d > 5}
            />
            <KpiCard
              label="Nouveaux 7j"
              value={`+${stats.new_users_7d}`}
              sub="Inscriptions récentes"
              icon={UserPlus}
            />
            <KpiCard
              label="Webhooks"
              value={String(stats.webhook_failures_pending)}
              sub="Échecs Stripe non résolus"
              icon={AlertTriangle}
              danger={stats.webhook_failures_pending > 0}
            />
            <KpiCard
              label="Taux conversion"
              value={`${stats.total_users > 0 ? ((stats.paying_users / stats.total_users) * 100).toFixed(1) : 0}%`}
              sub="Inscrits → Payants"
              icon={BarChart3}
            />
          </div>
        )
      )}

      {/* Charts row */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Growth chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" />
              Croissance utilisateurs — 30 derniers jours
            </CardTitle>
          </CardHeader>
          <CardContent>
            {growth.length > 0 ? (
              <div className="space-y-2">
                <MiniBarChart
                  data={growth}
                  maxVal={maxSignups}
                  dateKey="date"
                  valueKey="new_signups"
                  color="bg-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{growth[0]?.date?.slice(5)}</span>
                  <span className="font-medium">
                    {growth.reduce((s, g) => s + g.new_signups, 0)} nouveaux
                    inscrits
                  </span>
                  <span>{growth[growth.length - 1]?.date?.slice(5)}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Chargement...
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recent alerts */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Activité récente
              <Link
                href="/admin/logs"
                className="ml-auto text-xs text-primary hover:underline flex items-center gap-1"
              >
                Tout voir <ArrowRight className="h-3 w-3" />
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Aucun événement récent
              </p>
            ) : (
              <div className="space-y-2">
                {recentEvents.slice(0, 6).map((e: SecurityEvent) => (
                  <div key={e.id} className="flex items-center gap-2 text-xs">
                    <Badge
                      variant={
                        e.severity === "critical" || e.severity === "emergency"
                          ? "destructive"
                          : "secondary"
                      }
                      className="text-[10px] shrink-0"
                    >
                      {e.severity}
                    </Badge>
                    <span className="font-mono text-muted-foreground flex-1 truncate">
                      {e.event_type}
                    </span>
                    <span className="text-muted-foreground shrink-0">
                      {new Date(e.created_at).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Health check */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Statut des services
            {health && (
              <Badge
                variant={health.status === "ok" ? "default" : "destructive"}
                className="ml-auto text-xs"
              >
                {health.status === "ok" ? "Tout opérationnel" : "Dégradé"}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!health ? (
            <p className="text-xs text-muted-foreground">Vérification...</p>
          ) : (
            <div className="flex flex-wrap gap-4">
              {health.services.map((svc) => (
                <div key={svc.name} className="flex items-center gap-2">
                  {svc.status === "ok" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive shrink-0" />
                  )}
                  <div>
                    <p className="text-xs font-medium">{svc.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {svc.latency_ms}ms
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick links */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">
          Accès rapides
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link key={link.href} href={link.href}>
                <Card className="hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer group">
                  <CardContent className="pt-4 pb-4 text-center space-y-2">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center mx-auto group-hover:bg-primary/20 transition-colors">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium leading-tight">
                        {link.label}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {link.desc}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
