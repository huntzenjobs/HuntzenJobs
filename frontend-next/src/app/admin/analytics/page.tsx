"use client";

import { useEffect, useState, useCallback } from "react";
import {
  useAdminAnalytics,
  type RevenueData,
  type ChurnData,
  type UsageData,
} from "@/hooks/admin/use-admin-analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TrendingUp,
  Users,
  DollarSign,
  BarChart3,
  UserMinus,
  Activity,
  Zap,
  UserPlus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

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
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

interface GrowthPoint {
  date: string;
  new_signups: number;
  cumulative: number;
}
interface MrrPoint {
  date: string;
  mrr: number;
  paying_users: number;
}

const PERIODS = [
  { label: "7 jours", value: 7 },
  { label: "30 jours", value: 30 },
  { label: "90 jours", value: 90 },
];

const PLAN_COLORS: Record<string, string> = {
  starter: "bg-blue-500",
  pro: "bg-purple-500",
  premium: "bg-amber-400",
  free: "bg-slate-300",
};

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatMinutes(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}min`;
}

export default function AdminAnalyticsPage() {
  const { fetchRevenue, fetchSubscriptions, fetchChurn, fetchUsage } =
    useAdminAnalytics();
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [breakdown, setBreakdown] = useState<Record<string, number>>({});
  const [churn, setChurn] = useState<ChurnData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [growth, setGrowth] = useState<GrowthPoint[]>([]);
  const [mrrTrend, setMrrTrend] = useState<MrrPoint[]>([]);
  const [funnel, setFunnel] = useState<any[]>([]);
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [forecast, setForecast] = useState<any | null>(null);
  const [heatmap, setHeatmap] = useState<{ hour: number; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rev, subs, ch, us, gr, mrr, fn, co, fc, hm] = await Promise.all([
        fetchRevenue(),
        fetchSubscriptions(),
        fetchChurn(days),
        fetchUsage(days),
        adminFetch(`/api/admin/analytics/growth?days=${days}`),
        adminFetch(
          `/api/admin/analytics/mrr-trend?days=${days < 30 ? 30 : days}`,
        ),
        adminFetch(`/api/admin/analytics/funnel?days=${days}`),
        adminFetch(`/api/admin/analytics/cohorts?months=6`),
        adminFetch(`/api/admin/analytics/mrr-forecast`),
        adminFetch(`/api/admin/analytics/usage-heatmap?days=${days}`),
      ]);
      setRevenue(rev);
      setBreakdown(subs.breakdown);
      setChurn(ch);
      setUsage(us);
      setGrowth(gr.growth || []);
      setMrrTrend(mrr.trend || []);
      setFunnel(fn.funnel || []);
      setCohorts(co.cohorts || []);
      setForecast(fc);
      setHeatmap(hm.heatmap || []);
    } finally {
      setLoading(false);
    }
  }, [fetchRevenue, fetchSubscriptions, fetchChurn, fetchUsage, days]);

  useEffect(() => {
    load();
  }, [load]);

  const totalSubs = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const arpu =
    revenue && revenue.total_paying_users > 0
      ? revenue.mrr / revenue.total_paying_users
      : 0;
  const totalNewSignups = growth.reduce((s, g) => s + g.new_signups, 0);
  const maxSignups = growth.length
    ? Math.max(...growth.map((g) => g.new_signups), 1)
    : 1;
  const maxMrr = mrrTrend.length
    ? Math.max(...mrrTrend.map((m) => m.mrr), 1)
    : 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Revenue & Analytics
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Données en temps réel depuis la base de données.
          </p>
        </div>
        {/* Period selector */}
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {PERIODS.map((p) => (
            <Button
              key={p.value}
              variant={days === p.value ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setDays(p.value)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6 h-24 animate-pulse bg-muted rounded" />
            </Card>
          ))}
        </div>
      ) : revenue ? (
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Vue générale</TabsTrigger>
            <TabsTrigger value="funnel">Funnel</TabsTrigger>
            <TabsTrigger value="cohorts">Cohortes</TabsTrigger>
            <TabsTrigger value="forecast">Prévision MRR</TabsTrigger>
            <TabsTrigger value="heatmap">Heatmap</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <KpiCard
                title="MRR"
                value={`€${revenue.mrr.toFixed(0)}`}
                subtitle="Revenu mensuel récurrent"
                icon={DollarSign}
              />
              <KpiCard
                title="ARR"
                value={`€${revenue.arr.toFixed(0)}`}
                subtitle="Revenu annuel récurrent"
                icon={TrendingUp}
              />
              <KpiCard
                title="ARPU"
                value={`€${arpu.toFixed(2)}`}
                subtitle="Revenu par user payant"
                icon={Zap}
              />
              <KpiCard
                title="Users payants"
                value={String(revenue.total_paying_users)}
                subtitle={`sur ${revenue.total_users} inscrits`}
                icon={Users}
              />
              <KpiCard
                title={`Nouveaux (${days}j)`}
                value={`+${totalNewSignups}`}
                subtitle="Inscriptions période"
                icon={UserPlus}
              />
              <KpiCard
                title="Taux conversion"
                value={
                  revenue.total_users > 0
                    ? `${((revenue.total_paying_users / revenue.total_users) * 100).toFixed(1)}%`
                    : "0%"
                }
                subtitle="Payants / inscrits totaux"
                icon={BarChart3}
              />
            </div>

            {/* Revenue by plan */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  Répartition par plan
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {revenue.by_plan.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucun abonnement payant actif.
                  </p>
                ) : (
                  revenue.by_plan.map((plan) => {
                    const pct =
                      revenue.mrr > 0 ? (plan.mrr / revenue.mrr) * 100 : 0;
                    return (
                      <div key={plan.name} className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div
                              className={`h-2.5 w-2.5 rounded-full ${PLAN_COLORS[plan.name] || "bg-slate-400"}`}
                            />
                            <span className="font-medium">
                              {plan.display_name}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {plan.count} users
                            </Badge>
                          </div>
                          <span className="font-semibold">
                            €{plan.mrr.toFixed(2)}/mois
                          </span>
                        </div>
                        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${PLAN_COLORS[plan.name] || "bg-slate-400"} transition-all duration-500`}
                            style={{ width: `${Math.max(pct, 2)}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground text-right">
                          {pct.toFixed(1)}% du MRR
                        </p>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {/* Subscribers by plan */}
            {Object.keys(breakdown).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">
                    Abonnements actifs ({totalSubs} total)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(breakdown)
                      .sort(([, a], [, b]) => b - a)
                      .map(([planName, count]) => {
                        const pct =
                          totalSubs > 0 ? (count / totalSubs) * 100 : 0;
                        return (
                          <div
                            key={planName}
                            className="flex items-center gap-3"
                          >
                            <div className="w-24 text-sm font-medium capitalize">
                              {planName}
                            </div>
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${PLAN_COLORS[planName] || "bg-slate-400"}`}
                                style={{ width: `${Math.max(pct, 2)}%` }}
                              />
                            </div>
                            <div className="w-16 text-right text-sm font-semibold">
                              {count}
                            </div>
                            <div className="w-10 text-right text-xs text-muted-foreground">
                              {pct.toFixed(0)}%
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Time-series charts */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* User growth chart */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-primary" />
                    Croissance — {days} derniers jours
                    <span className="ml-auto text-xs text-muted-foreground font-normal">
                      +{totalNewSignups} nouveaux
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {growth.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-8 text-center">
                      Aucune donnée
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-end gap-0.5 h-20">
                        {growth.map((g, i) => {
                          const pct = Math.max(
                            (g.new_signups / maxSignups) * 100,
                            g.new_signups > 0 ? 4 : 0,
                          );
                          return (
                            <div
                              key={i}
                              className="flex-1 flex flex-col items-center justify-end group relative"
                            >
                              <div
                                className="w-full rounded-sm bg-primary opacity-80 group-hover:opacity-100 transition-opacity"
                                style={{
                                  height: `${pct}%`,
                                  minHeight: g.new_signups > 0 ? "3px" : "1px",
                                }}
                              />
                              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-[10px] px-1.5 py-0.5 rounded shadow-md opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-10">
                                {g.date.slice(5)}:{" "}
                                <strong>{g.new_signups}</strong>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{growth[0]?.date?.slice(5)}</span>
                        <span>{growth[growth.length - 1]?.date?.slice(5)}</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* MRR trend chart */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary" />
                    Tendance MRR
                    <span className="ml-auto text-xs text-muted-foreground font-normal">
                      actuel €{revenue?.mrr.toFixed(0)}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {mrrTrend.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-8 text-center">
                      Aucune donnée
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-end gap-0.5 h-20">
                        {mrrTrend.map((m, i) => {
                          const pct = Math.max(
                            (m.mrr / maxMrr) * 100,
                            m.mrr > 0 ? 4 : 0,
                          );
                          return (
                            <div
                              key={i}
                              className="flex-1 flex flex-col items-center justify-end group relative"
                            >
                              <div
                                className="w-full rounded-sm bg-emerald-500 opacity-80 group-hover:opacity-100 transition-opacity"
                                style={{ height: `${pct}%`, minHeight: "1px" }}
                              />
                              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-[10px] px-1.5 py-0.5 rounded shadow-md opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-10">
                                {m.date.slice(5)}:{" "}
                                <strong>€{m.mrr.toFixed(0)}</strong>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{mrrTrend[0]?.date?.slice(5)}</span>
                        <span>
                          {mrrTrend[mrrTrend.length - 1]?.date?.slice(5)}
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Churn + Usage side by side */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Churn */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <UserMinus className="h-4 w-4 text-destructive" />
                    Résiliations — {days} derniers jours
                    {churn && (
                      <Badge variant="destructive" className="text-xs ml-auto">
                        {churn.total}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!churn || churn.churned.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      Aucune résiliation.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {churn.churned.map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between text-xs py-1 border-b last:border-0"
                        >
                          <div>
                            <p className="font-medium">
                              {c.profiles?.email || c.user_id.slice(0, 8)}
                            </p>
                            <p className="text-muted-foreground">
                              {c.subscription_plans?.display_name || "—"}
                            </p>
                          </div>
                          <span className="text-muted-foreground">
                            {formatDate(c.created_at)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Usage */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    Usage — {days} derniers jours
                    {usage && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        {usage.active_users} users actifs
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!usage ? (
                    <p className="text-sm text-muted-foreground">
                      Chargement...
                    </p>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="bg-muted/40 rounded-lg p-3">
                          <p className="text-lg font-bold">
                            {usage.totals.cv_analyses}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Analyses CV
                          </p>
                        </div>
                        <div className="bg-muted/40 rounded-lg p-3">
                          <p className="text-lg font-bold">
                            {formatMinutes(usage.totals.coach_seconds)}
                          </p>
                          <p className="text-xs text-muted-foreground">Coach</p>
                        </div>
                        <div className="bg-muted/40 rounded-lg p-3">
                          <p className="text-lg font-bold">
                            {usage.totals.job_searches}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Recherches
                          </p>
                        </div>
                      </div>

                      {usage.top_users.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2">
                            Top users (par analyses CV)
                          </p>
                          <div className="space-y-1">
                            {usage.top_users.slice(0, 5).map((u, i) => (
                              <div
                                key={u.user_id}
                                className="flex items-center gap-2 text-xs"
                              >
                                <span className="text-muted-foreground w-4">
                                  {i + 1}
                                </span>
                                <span className="text-muted-foreground flex-1 truncate">
                                  {u.email || u.user_id.slice(0, 12)}
                                </span>
                                <span className="font-semibold">
                                  {u.cv_analyses} CV
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Funnel tab */}
          <TabsContent value="funnel" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Funnel de conversion
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {funnel.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Aucune donnée de funnel.
                  </p>
                ) : (
                  funnel.map((step, i) => {
                    const maxCount = funnel[0]?.count || 1;
                    const pct = Math.max((step.count / maxCount) * 100, 2);
                    return (
                      <div key={step.step} className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">
                            {i + 1}. {step.label}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-bold">{step.count}</span>
                            {step.pct_of_previous !== null && (
                              <Badge variant="outline" className="text-xs">
                                {step.pct_of_previous.toFixed(1)}%
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Cohorts tab */}
          <TabsContent value="cohorts" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Rétention par cohorte mensuelle
                </CardTitle>
              </CardHeader>
              <CardContent>
                {cohorts.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Aucune donnée de cohorte.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
                            Cohorte
                          </th>
                          <th className="text-right py-2 px-2 font-medium text-muted-foreground">
                            Total
                          </th>
                          <th className="text-right py-2 px-2 font-medium text-muted-foreground">
                            M+1
                          </th>
                          <th className="text-right py-2 px-2 font-medium text-muted-foreground">
                            M+2
                          </th>
                          <th className="text-right py-2 px-2 font-medium text-muted-foreground">
                            M+3
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {cohorts.map((c) => {
                          function retentionBg(pct: number | null) {
                            if (pct === null) return "";
                            if (pct >= 70)
                              return "bg-emerald-500/20 text-emerald-700";
                            if (pct >= 40)
                              return "bg-amber-500/20 text-amber-700";
                            return "bg-red-500/10 text-red-600";
                          }
                          return (
                            <tr
                              key={c.cohort_month}
                              className="border-b last:border-0"
                            >
                              <td className="py-2 pr-4 font-medium">
                                {c.cohort_month}
                              </td>
                              <td className="text-right py-2 px-2 text-muted-foreground">
                                {c.total}
                              </td>
                              {(
                                [
                                  "retained_m1",
                                  "retained_m2",
                                  "retained_m3",
                                ] as const
                              ).map((key) => {
                                const val = c[key] as number | null;
                                const pct =
                                  val !== null && c.total > 0
                                    ? (val / c.total) * 100
                                    : null;
                                return (
                                  <td
                                    key={key}
                                    className={`text-right py-2 px-2 rounded text-xs font-medium ${retentionBg(pct)}`}
                                  >
                                    {pct !== null ? `${pct.toFixed(0)}%` : "—"}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <p className="text-xs text-muted-foreground mt-3">
                      Vert ≥ 70% · Jaune ≥ 40% · Rouge &lt; 40%
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* MRR Forecast tab */}
          <TabsContent value="forecast" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Prévision MRR — 3 prochains mois
                  {forecast && (
                    <Badge
                      className="ml-auto text-xs"
                      variant={
                        forecast.trend_pct >= 0 ? "default" : "destructive"
                      }
                    >
                      {forecast.trend_pct >= 0 ? "+" : ""}
                      {forecast.trend_pct?.toFixed(1)}% tendance
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!forecast ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Aucune donnée de prévision.
                  </p>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-end gap-4">
                      {/* Current MRR bar */}
                      <div className="flex flex-col items-center gap-1 flex-1">
                        <span className="text-xs font-semibold">
                          €{forecast.current_mrr?.toFixed(0)}
                        </span>
                        <div
                          className="w-full bg-primary rounded-t-sm"
                          style={{ height: "80px" }}
                        />
                        <span className="text-xs text-muted-foreground">
                          Actuel
                        </span>
                      </div>
                      {/* Projected bars */}
                      {forecast.forecast?.map(
                        (
                          f: { month: string; mrr_projected: number },
                          i: number,
                        ) => {
                          const ratio =
                            forecast.current_mrr > 0
                              ? f.mrr_projected / forecast.current_mrr
                              : 1;
                          const height = Math.max(ratio * 80, 8);
                          return (
                            <div
                              key={f.month}
                              className="flex flex-col items-center gap-1 flex-1"
                            >
                              <span className="text-xs font-semibold">
                                €{f.mrr_projected?.toFixed(0)}
                              </span>
                              <div
                                className="w-full rounded-t-sm border-2 border-dashed border-primary/60 bg-primary/20"
                                style={{ height: `${height}px` }}
                              />
                              <span className="text-xs text-muted-foreground">
                                M+{i + 1}
                              </span>
                            </div>
                          );
                        },
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Projection basée sur la régression linéaire des 90
                      derniers jours. Les barres en pointillé représentent des
                      estimations.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Heatmap */}
          <TabsContent value="heatmap" className="space-y-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Activité par heure de la journée — {days} derniers jours
                </CardTitle>
              </CardHeader>
              <CardContent>
                {heatmap.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Chargement...
                  </p>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-end gap-1 h-32">
                      {heatmap.map((h) => {
                        const max = Math.max(...heatmap.map((x) => x.count), 1);
                        const pct = Math.max(
                          (h.count / max) * 100,
                          h.count > 0 ? 2 : 0,
                        );
                        return (
                          <div
                            key={h.hour}
                            className="flex-1 flex flex-col items-center justify-end group relative"
                          >
                            <div
                              className="w-full rounded-sm bg-primary opacity-70 group-hover:opacity-100 transition-opacity"
                              style={{
                                height: `${pct}%`,
                                minHeight: h.count > 0 ? "3px" : "1px",
                              }}
                            />
                            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-[10px] px-1.5 py-0.5 rounded shadow opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-10">
                              {h.hour}h : <strong>{h.count}</strong>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>0h</span>
                      <span>6h</span>
                      <span>12h</span>
                      <span>18h</span>
                      <span>23h</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        <p className="text-sm text-muted-foreground">
          Impossible de charger les analytics.
        </p>
      )}
    </div>
  );
}
