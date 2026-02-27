'use client'

import { useEffect, useState } from 'react'
import {
  useAdminAnalytics,
  type RevenueData,
  type ChurnData,
  type UsageData,
} from '@/hooks/admin/use-admin-analytics'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, Users, DollarSign, BarChart3, UserMinus, Activity } from 'lucide-react'

const PLAN_COLORS: Record<string, string> = {
  starter: 'bg-blue-500',
  pro: 'bg-purple-500',
  premium: 'bg-amber-400',
  free: 'bg-slate-300',
}

function KpiCard({ title, value, subtitle, icon: Icon }: {
  title: string
  value: string
  subtitle?: string
  icon: any
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatMinutes(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  return `${Math.round(seconds / 60)}min`
}

export default function AdminAnalyticsPage() {
  const { fetchRevenue, fetchSubscriptions, fetchChurn, fetchUsage } = useAdminAnalytics()
  const [revenue, setRevenue] = useState<RevenueData | null>(null)
  const [breakdown, setBreakdown] = useState<Record<string, number>>({})
  const [churn, setChurn] = useState<ChurnData | null>(null)
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([fetchRevenue(), fetchSubscriptions(), fetchChurn(), fetchUsage()])
      .then(([rev, subs, ch, us]) => {
        setRevenue(rev)
        setBreakdown(subs.breakdown)
        setChurn(ch)
        setUsage(us)
      })
      .finally(() => setLoading(false))
  }, [fetchRevenue, fetchSubscriptions, fetchChurn, fetchUsage])

  const totalSubs = Object.values(breakdown).reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Revenue & Analytics</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Données en temps réel depuis la base de données.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Card key={i}><CardContent className="pt-6 h-24 animate-pulse bg-muted rounded" /></Card>)}
        </div>
      ) : revenue ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard title="MRR" value={`€${revenue.mrr.toFixed(2)}`} subtitle="Revenu mensuel récurrent" icon={DollarSign} />
            <KpiCard title="ARR" value={`€${revenue.arr.toFixed(2)}`} subtitle="Revenu annuel récurrent" icon={TrendingUp} />
            <KpiCard
              title="Users payants"
              value={String(revenue.total_paying_users)}
              subtitle={`sur ${revenue.total_users} inscrits`}
              icon={Users}
            />
            <KpiCard
              title="Taux conversion"
              value={revenue.total_users > 0
                ? `${((revenue.total_paying_users / revenue.total_users) * 100).toFixed(1)}%`
                : '0%'}
              subtitle="Payants / inscrits totaux"
              icon={BarChart3}
            />
          </div>

          {/* Revenue by plan */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Répartition par plan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {revenue.by_plan.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun abonnement payant actif.</p>
              ) : revenue.by_plan.map(plan => {
                const pct = revenue.mrr > 0 ? (plan.mrr / revenue.mrr) * 100 : 0
                return (
                  <div key={plan.name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className={`h-2.5 w-2.5 rounded-full ${PLAN_COLORS[plan.name] || 'bg-slate-400'}`} />
                        <span className="font-medium">{plan.display_name}</span>
                        <Badge variant="outline" className="text-xs">{plan.count} users</Badge>
                      </div>
                      <span className="font-semibold">€{plan.mrr.toFixed(2)}/mois</span>
                    </div>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${PLAN_COLORS[plan.name] || 'bg-slate-400'} transition-all duration-500`}
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground text-right">{pct.toFixed(1)}% du MRR</p>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          {/* Subscribers by plan */}
          {Object.keys(breakdown).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Abonnements actifs ({totalSubs} total)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(breakdown).sort(([, a], [, b]) => b - a).map(([planName, count]) => {
                    const pct = totalSubs > 0 ? (count / totalSubs) * 100 : 0
                    return (
                      <div key={planName} className="flex items-center gap-3">
                        <div className="w-24 text-sm font-medium capitalize">{planName}</div>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${PLAN_COLORS[planName] || 'bg-slate-400'}`} style={{ width: `${Math.max(pct, 2)}%` }} />
                        </div>
                        <div className="w-16 text-right text-sm font-semibold">{count}</div>
                        <div className="w-10 text-right text-xs text-muted-foreground">{pct.toFixed(0)}%</div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Churn + Usage side by side */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Churn */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <UserMinus className="h-4 w-4 text-destructive" />
                  Résiliations — 30 derniers jours
                  {churn && <Badge variant="destructive" className="text-xs ml-auto">{churn.total}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!churn || churn.churned.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Aucune résiliation.</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {churn.churned.map(c => (
                      <div key={c.id} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                        <div>
                          <p className="font-medium">{c.profiles?.email || c.user_id.slice(0, 8)}</p>
                          <p className="text-muted-foreground">{c.subscription_plans?.display_name || '—'}</p>
                        </div>
                        <span className="text-muted-foreground">{formatDate(c.created_at)}</span>
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
                  Usage — 30 derniers jours
                  {usage && <span className="text-xs text-muted-foreground ml-auto">{usage.active_users} users actifs</span>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!usage ? (
                  <p className="text-sm text-muted-foreground">Chargement...</p>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="bg-muted/40 rounded-lg p-3">
                        <p className="text-lg font-bold">{usage.totals.cv_analyses}</p>
                        <p className="text-xs text-muted-foreground">Analyses CV</p>
                      </div>
                      <div className="bg-muted/40 rounded-lg p-3">
                        <p className="text-lg font-bold">{formatMinutes(usage.totals.coach_seconds)}</p>
                        <p className="text-xs text-muted-foreground">Coach</p>
                      </div>
                      <div className="bg-muted/40 rounded-lg p-3">
                        <p className="text-lg font-bold">{usage.totals.job_searches}</p>
                        <p className="text-xs text-muted-foreground">Recherches</p>
                      </div>
                    </div>

                    {usage.top_users.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Top users (par analyses CV)</p>
                        <div className="space-y-1">
                          {usage.top_users.slice(0, 5).map((u, i) => (
                            <div key={u.user_id} className="flex items-center gap-2 text-xs">
                              <span className="text-muted-foreground w-4">{i + 1}</span>
                              <span className="font-mono text-muted-foreground flex-1 truncate">{u.user_id.slice(0, 12)}…</span>
                              <span className="font-semibold">{u.cv_analyses} CV</span>
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
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Impossible de charger les analytics.</p>
      )}
    </div>
  )
}
