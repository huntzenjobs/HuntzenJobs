"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  useStressTest,
  type StressMetricSnapshot,
  type StressRun,
} from "@/hooks/admin/use-stress-test";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity,
  Zap,
  StopCircle,
  Play,
  RotateCcw,
  History,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
} from "recharts";

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
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const AVAILABLE_FEATURES = ["auth", "jobs", "coach", "cv_analysis"];
const FEATURE_LABELS: Record<string, string> = {
  auth: "Auth",
  jobs: "Jobs",
  coach: "Coach IA",
  cv_analysis: "Analyse CV",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-600 border-yellow-200",
  running: "bg-blue-500/10 text-blue-600 border-blue-200",
  completed: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  failed: "bg-red-500/10 text-red-600 border-red-200",
  cancelled: "bg-gray-500/10 text-gray-600 border-gray-200",
};

function KpiCard({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="text-xs text-muted-foreground mb-1">{label}</div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold" style={{ color }}>
            {value}
          </span>
          {unit && (
            <span className="text-xs text-muted-foreground">{unit}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface Scenario {
  id: string;
  name: string;
  concurrency: number;
  duration_sec: number;
  ramp_up_sec: number;
  features: string[];
  description: string;
}

export default function AdminStressPage() {
  const [activeTab, setActiveTab] = useState("launch");
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const [custom, setCustom] = useState({
    name: "Test custom",
    concurrency: 100,
    duration_sec: 60,
    ramp_up_sec: 15,
    features: ["auth", "jobs"] as string[],
  });

  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [history, setHistory] = useState<StressRun[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [detailRun, setDetailRun] = useState<StressRun | null>(null);

  const { metrics, status, connected } = useStressTest(currentRunId);

  // Charger les scénarios et l'historique au montage
  useEffect(() => {
    adminFetch("/api/admin/stress/scenarios")
      .then((d) => setScenarios(d.scenarios || []))
      .catch(() => {});
    loadHistory();
  }, []);

  // Basculer sur l'onglet Live quand un test démarre
  useEffect(() => {
    if (currentRunId) setActiveTab("live");
  }, [currentRunId]);

  // Recharger l'historique quand un test se termine
  useEffect(() => {
    if (
      status === "completed" ||
      status === "cancelled" ||
      status === "failed"
    ) {
      loadHistory();
    }
  }, [status]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const d = await adminFetch("/api/admin/stress/runs");
      setHistory(d.runs || []);
    } catch {}
    setHistoryLoading(false);
  }, []);

  async function launchTest() {
    setLaunching(true);
    try {
      let payload;
      if (customMode || !selectedScenario) {
        payload = {
          name: custom.name,
          concurrency: custom.concurrency,
          duration_sec: custom.duration_sec,
          ramp_up_sec: custom.ramp_up_sec,
          features: custom.features,
        };
      } else {
        const sc = scenarios.find((s) => s.id === selectedScenario);
        if (!sc) return;
        payload = {
          name: sc.name,
          concurrency: sc.concurrency,
          duration_sec: sc.duration_sec,
          ramp_up_sec: sc.ramp_up_sec,
          features: sc.features,
        };
      }
      const d = await adminFetch("/api/admin/stress/run", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setCurrentRunId(d.run_id);
    } catch (e: any) {
      alert(`Erreur : ${e.message}`);
    }
    setLaunching(false);
  }

  async function stopTest() {
    if (!currentRunId) return;
    setStopping(true);
    try {
      await adminFetch(`/api/admin/stress/run/${currentRunId}`, {
        method: "DELETE",
      });
      setCurrentRunId(null);
    } catch {}
    setStopping(false);
  }

  // Transformer les métriques en format Recharts
  const chartData = metrics.map((m) => ({
    t: m.elapsed_sec,
    p50: m.latency.p50,
    p95: m.latency.p95,
    p99: m.latency.p99,
    rps: m.req_per_sec,
    errors: +(m.error_rate * 100).toFixed(2),
    users: m.active_users,
  }));
  const last = metrics[metrics.length - 1];

  const isRunning = status === "running" || status === "pending";

  function relaunch(run: StressRun) {
    setCustom({
      name: run.name,
      concurrency: run.config.concurrency,
      duration_sec: run.config.duration_sec,
      ramp_up_sec: run.config.ramp_up_sec,
      features: run.config.features,
    });
    setCustomMode(true);
    setSelectedScenario(null);
    setActiveTab("launch");
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Stress Testing</h1>
          <p className="text-sm text-muted-foreground">
            Tests de charge production — résultats en temps réel
          </p>
        </div>
        {isRunning && (
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 bg-blue-500 rounded-full animate-pulse" />
            <span className="text-sm text-blue-600 font-medium">
              Test en cours
            </span>
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="launch">
            <Play className="h-3.5 w-3.5 mr-1.5" />
            Lancer
          </TabsTrigger>
          <TabsTrigger value="live">
            <Activity className="h-3.5 w-3.5 mr-1.5" />
            Live
            {isRunning && (
              <span className="ml-1.5 h-1.5 w-1.5 bg-blue-500 rounded-full animate-pulse inline-block" />
            )}
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-3.5 w-3.5 mr-1.5" />
            Historique
          </TabsTrigger>
        </TabsList>

        {/* ── ONGLET LANCER ─────────────────────────────────────── */}
        <TabsContent value="launch" className="space-y-6 mt-4">
          <div>
            <h2 className="text-sm font-semibold mb-3">
              Scénarios pré-définis
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {scenarios.map((sc) => (
                <button
                  key={sc.id}
                  onClick={() => {
                    setSelectedScenario(sc.id);
                    setCustomMode(false);
                  }}
                  className={`text-left p-4 rounded-lg border transition-all ${
                    selectedScenario === sc.id && !customMode
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-primary/40 hover:bg-accent"
                  }`}
                >
                  <div className="font-medium text-sm">{sc.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {sc.description}
                  </div>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                      {sc.concurrency} users
                    </span>
                    <span className="text-xs bg-gray-50 text-gray-700 px-1.5 py-0.5 rounded">
                      {sc.duration_sec}s
                    </span>
                  </div>
                </button>
              ))}

              {/* Card Custom */}
              <button
                onClick={() => {
                  setCustomMode(true);
                  setSelectedScenario(null);
                }}
                className={`text-left p-4 rounded-lg border border-dashed transition-all ${
                  customMode
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:border-primary/40 hover:bg-accent"
                }`}
              >
                <div className="font-medium text-sm">Custom…</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Configure tes propres paramètres
                </div>
              </button>
            </div>
          </div>

          {/* Builder custom */}
          {customMode && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Builder custom</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-xs font-medium mb-1 block">
                    Nom du test
                  </label>
                  <input
                    className="w-full border rounded-md px-3 py-1.5 text-sm"
                    value={custom.name}
                    onChange={(e) =>
                      setCustom((p) => ({ ...p, name: e.target.value }))
                    }
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-medium mb-1 block">
                      Users simultanés : <strong>{custom.concurrency}</strong>
                    </label>
                    <input
                      type="range"
                      min={10}
                      max={500}
                      step={10}
                      value={custom.concurrency}
                      onChange={(e) =>
                        setCustom((p) => ({
                          ...p,
                          concurrency: +e.target.value,
                        }))
                      }
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block">
                      Durée : <strong>{custom.duration_sec}s</strong>
                    </label>
                    <input
                      type="range"
                      min={10}
                      max={300}
                      step={10}
                      value={custom.duration_sec}
                      onChange={(e) =>
                        setCustom((p) => ({
                          ...p,
                          duration_sec: +e.target.value,
                        }))
                      }
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block">
                      Ramp-up : <strong>{custom.ramp_up_sec}s</strong>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={60}
                      step={5}
                      value={custom.ramp_up_sec}
                      onChange={(e) =>
                        setCustom((p) => ({
                          ...p,
                          ramp_up_sec: +e.target.value,
                        }))
                      }
                      className="w-full"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium mb-2 block">
                    Features à tester
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {AVAILABLE_FEATURES.map((f) => (
                      <button
                        key={f}
                        onClick={() =>
                          setCustom((p) => ({
                            ...p,
                            features: p.features.includes(f)
                              ? p.features.filter((x) => x !== f)
                              : [...p.features, f],
                          }))
                        }
                        className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                          custom.features.includes(f)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        {FEATURE_LABELS[f]}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center gap-3">
            <Button
              onClick={launchTest}
              disabled={
                launching || isRunning || (!selectedScenario && !customMode)
              }
              className="gap-2"
            >
              <Zap className="h-4 w-4" />
              {launching ? "Lancement…" : "Lancer le test"}
            </Button>
            {isRunning && (
              <span className="text-sm text-muted-foreground">
                Un test est en cours — arrête-le depuis l'onglet Live.
              </span>
            )}
          </div>
        </TabsContent>

        {/* ── ONGLET LIVE ───────────────────────────────────────── */}
        <TabsContent value="live" className="space-y-4 mt-4">
          {!currentRunId && !last ? (
            <div className="text-center py-16 text-muted-foreground">
              <Activity className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Aucun test en cours — lance un test depuis l'onglet Lancer.</p>
            </div>
          ) : (
            <>
              {/* Header run */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge
                    className={STATUS_COLORS[status || "pending"]}
                    variant="outline"
                  >
                    {status}
                  </Badge>
                  {connected && (
                    <span className="flex items-center gap-1 text-xs text-emerald-600">
                      <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-pulse" />
                      SSE connecté
                    </span>
                  )}
                </div>
                {isRunning && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={stopTest}
                    disabled={stopping}
                    className="gap-1.5"
                  >
                    <StopCircle className="h-3.5 w-3.5" />
                    {stopping ? "Arrêt…" : "Stop"}
                  </Button>
                )}
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard
                  label="Req/sec"
                  value={last?.req_per_sec ?? 0}
                  color="#3b82f6"
                />
                <KpiCard
                  label="Latence p95"
                  value={last?.latency.p95 ?? 0}
                  unit="ms"
                  color={
                    (last?.latency.p95 ?? 0) > 1000
                      ? "#ef4444"
                      : (last?.latency.p95 ?? 0) > 500
                        ? "#f59e0b"
                        : "#10b981"
                  }
                />
                <KpiCard
                  label="Taux d'erreur"
                  value={((last?.error_rate ?? 0) * 100).toFixed(1)}
                  unit="%"
                  color={(last?.error_rate ?? 0) > 0.05 ? "#ef4444" : "#10b981"}
                />
                <KpiCard
                  label="Users actifs"
                  value={last?.active_users ?? 0}
                  color="#8b5cf6"
                />
              </div>

              {/* Chart latence p50/p95/p99 */}
              {chartData.length > 1 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Latence (ms)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis
                          dataKey="t"
                          tick={{ fontSize: 10 }}
                          tickFormatter={(v) => `${v}s`}
                        />
                        <YAxis tick={{ fontSize: 10 }} unit="ms" width={50} />
                        <Tooltip
                          formatter={(v) => [`${v}ms`]}
                          labelFormatter={(l) => `${l}s`}
                        />
                        <Legend
                          iconType="line"
                          iconSize={10}
                          wrapperStyle={{ fontSize: 11 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="p50"
                          stroke="#3b82f6"
                          dot={false}
                          strokeWidth={1.5}
                          name="p50"
                        />
                        <Line
                          type="monotone"
                          dataKey="p95"
                          stroke="#f97316"
                          dot={false}
                          strokeWidth={2}
                          name="p95"
                        />
                        <Line
                          type="monotone"
                          dataKey="p99"
                          stroke="#ef4444"
                          dot={false}
                          strokeWidth={1.5}
                          strokeDasharray="4 2"
                          name="p99"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Chart req/s + erreurs */}
              {chartData.length > 1 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      Requêtes/sec & Erreurs (%)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={160}>
                      <AreaChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis
                          dataKey="t"
                          tick={{ fontSize: 10 }}
                          tickFormatter={(v) => `${v}s`}
                        />
                        <YAxis
                          yAxisId="rps"
                          tick={{ fontSize: 10 }}
                          width={45}
                        />
                        <YAxis
                          yAxisId="err"
                          orientation="right"
                          tick={{ fontSize: 10 }}
                          unit="%"
                          width={40}
                        />
                        <Tooltip labelFormatter={(l) => `${l}s`} />
                        <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                        <Area
                          yAxisId="rps"
                          type="monotone"
                          dataKey="rps"
                          stroke="#3b82f6"
                          fill="#3b82f620"
                          strokeWidth={1.5}
                          name="req/s"
                        />
                        <Area
                          yAxisId="err"
                          type="monotone"
                          dataKey="errors"
                          stroke="#ef4444"
                          fill="#ef444420"
                          strokeWidth={1.5}
                          name="erreurs %"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Features */}
              {last?.features && Object.keys(last.features).length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Features en cours</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground border-b">
                          <th className="text-left pb-1">Feature</th>
                          <th className="text-right pb-1">Actifs</th>
                          <th className="text-right pb-1">Req/s</th>
                          <th className="text-right pb-1">Erreurs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(last.features).map(([feat, stats]) => (
                          <tr key={feat} className="border-b last:border-0">
                            <td className="py-1.5 font-medium">
                              {FEATURE_LABELS[feat] || feat}
                            </td>
                            <td className="text-right">{stats.active}</td>
                            <td className="text-right">{stats.req_s}</td>
                            <td className="text-right">
                              <span
                                className={
                                  stats.errors > 0
                                    ? "text-red-500 font-medium"
                                    : ""
                                }
                              >
                                {stats.errors}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
                      ARQ queue depth :{" "}
                      <strong>{last.infra?.arq_queue_depth ?? 0}</strong>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ── ONGLET HISTORIQUE ─────────────────────────────────── */}
        <TabsContent value="history" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Runs passés</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={loadHistory}
              disabled={historyLoading}
            >
              <RotateCcw
                className={`h-3.5 w-3.5 mr-1.5 ${historyLoading ? "animate-spin" : ""}`}
              />
              Rafraîchir
            </Button>
          </div>

          {detailRun ? (
            /* Détail d'un run */
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDetailRun(null)}
                >
                  ← Retour
                </Button>
                <h2 className="font-semibold">{detailRun.name}</h2>
                <Badge
                  className={STATUS_COLORS[detailRun.status]}
                  variant="outline"
                >
                  {detailRun.status}
                </Badge>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard
                  label="Total requêtes"
                  value={detailRun.total_requests}
                />
                <KpiCard
                  label="Latence p95"
                  value={detailRun.p95_response_ms?.toFixed(0) ?? "—"}
                  unit="ms"
                />
                <KpiCard
                  label="Taux d'erreur"
                  value={
                    detailRun.total_requests > 0
                      ? (
                          (detailRun.failed / detailRun.total_requests) *
                          100
                        ).toFixed(1)
                      : "0"
                  }
                  unit="%"
                />
                <KpiCard
                  label="Max latence"
                  value={detailRun.max_response_ms?.toFixed(0) ?? "—"}
                  unit="ms"
                />
              </div>

              {detailRun.metrics_timeseries &&
                detailRun.metrics_timeseries.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">
                        Latence — historique complet
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart
                          data={detailRun.metrics_timeseries.map((m) => ({
                            t: m.elapsed_sec,
                            p50: m.latency.p50,
                            p95: m.latency.p95,
                            p99: m.latency.p99,
                          }))}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#f0f0f0"
                          />
                          <XAxis
                            dataKey="t"
                            tick={{ fontSize: 10 }}
                            tickFormatter={(v) => `${v}s`}
                          />
                          <YAxis tick={{ fontSize: 10 }} unit="ms" width={50} />
                          <Tooltip
                            formatter={(v) => [`${v}ms`]}
                            labelFormatter={(l) => `${l}s`}
                          />
                          <Legend
                            iconType="line"
                            iconSize={10}
                            wrapperStyle={{ fontSize: 11 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="p50"
                            stroke="#3b82f6"
                            dot={false}
                            strokeWidth={1.5}
                            name="p50"
                          />
                          <Line
                            type="monotone"
                            dataKey="p95"
                            stroke="#f97316"
                            dot={false}
                            strokeWidth={2}
                            name="p95"
                          />
                          <Line
                            type="monotone"
                            dataKey="p99"
                            stroke="#ef4444"
                            dot={false}
                            strokeWidth={1.5}
                            strokeDasharray="4 2"
                            name="p99"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => relaunch(detailRun)}
                  className="gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Relancer avec cette config
                </Button>
              </div>
            </div>
          ) : (
            /* Liste des runs */
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-xs text-muted-foreground">
                    <th className="text-left px-4 py-2">Nom</th>
                    <th className="text-right px-4 py-2">Users</th>
                    <th className="text-right px-4 py-2">Durée</th>
                    <th className="text-right px-4 py-2">p95</th>
                    <th className="text-right px-4 py-2">Erreurs</th>
                    <th className="text-center px-4 py-2">Statut</th>
                    <th className="text-right px-4 py-2">Date</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="text-center py-8 text-muted-foreground"
                      >
                        Aucun run pour l'instant
                      </td>
                    </tr>
                  ) : (
                    history.map((run) => {
                      const errorPct =
                        run.total_requests > 0
                          ? ((run.failed / run.total_requests) * 100).toFixed(1)
                          : "0";
                      return (
                        <tr key={run.id} className="border-t hover:bg-muted/20">
                          <td className="px-4 py-2 font-medium">{run.name}</td>
                          <td className="px-4 py-2 text-right">
                            {run.config?.concurrency ?? "—"}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {run.config?.duration_sec ?? "—"}s
                          </td>
                          <td className="px-4 py-2 text-right">
                            {run.p95_response_ms?.toFixed(0) ?? "—"}ms
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span
                              className={
                                +errorPct > 5 ? "text-red-500 font-medium" : ""
                              }
                            >
                              {errorPct}%
                            </span>
                          </td>
                          <td className="px-4 py-2 text-center">
                            <Badge
                              className={STATUS_COLORS[run.status]}
                              variant="outline"
                            >
                              {run.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                            {new Date(run.created_at).toLocaleDateString(
                              "fr-FR",
                              {
                                day: "2-digit",
                                month: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </td>
                          <td className="px-4 py-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                const d = await adminFetch(
                                  `/api/admin/stress/runs/${run.id}`,
                                );
                                setDetailRun(d);
                              }}
                            >
                              Détail
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
