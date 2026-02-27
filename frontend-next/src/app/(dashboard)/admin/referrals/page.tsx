'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAdminReferrals, type ReferralLeaderEntry, type ReferralStats, type ReferralConfig } from '@/hooks/admin/use-admin-referrals'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { RefreshCw, Users, TrendingUp, Gift, MousePointerClick } from 'lucide-react'
import { toast } from 'sonner'

function KpiCard({ title, value, icon: Icon }: { title: string; value: string | number; icon: any }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ConfigEditor({ config, onSave }: { config: ReferralConfig; onSave: (updates: any) => Promise<boolean> }) {
  const [rewardType, setRewardType] = useState(config.conversion_reward_type)
  const [days, setDays] = useState(String(config.conversion_reward_value?.days ?? 7))
  const [active, setActive] = useState(config.is_active)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    const reward_value: Record<string, any> = {}
    if (rewardType === 'free_days') reward_value.days = parseInt(days) || 7
    await onSave({
      conversion_reward_type: rewardType,
      conversion_reward_value: reward_value,
      is_active: active,
    })
    setSaving(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Configuration du programme</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Programme actif</Label>
          <Switch checked={active} onCheckedChange={setActive} />
        </div>

        <div className="space-y-2">
          <Label className="text-sm">Type de récompense (conversion)</Label>
          <div className="flex gap-2">
            {(['free_days', 'quota_bonus', 'stripe_coupon'] as const).map((t) => (
              <Button
                key={t}
                size="sm"
                variant={rewardType === t ? 'default' : 'outline'}
                onClick={() => setRewardType(t)}
              >
                {t === 'free_days' ? 'Jours offerts' : t === 'quota_bonus' ? 'Quota bonus' : 'Coupon Stripe'}
              </Button>
            ))}
          </div>
        </div>

        {rewardType === 'free_days' && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Nombre de jours offerts</Label>
            <Input
              type="number"
              min="1"
              max="365"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="h-8 w-24 text-sm"
            />
          </div>
        )}

        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Sauvegarde...' : 'Sauvegarder'}
        </Button>
      </CardContent>
    </Card>
  )
}

export default function AdminReferralsPage() {
  const { fetchLeaderboard, fetchStats, fetchConfig, updateConfig } = useAdminReferrals()
  const [leaderboard, setLeaderboard] = useState<ReferralLeaderEntry[]>([])
  const [stats, setStats] = useState<ReferralStats | null>(null)
  const [config, setConfig] = useState<ReferralConfig | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [lb, st, cfg] = await Promise.all([fetchLeaderboard(), fetchStats(), fetchConfig()])
      setLeaderboard(lb)
      setStats(st)
      setConfig(cfg)
    } catch {
      toast.error('Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }, [fetchLeaderboard, fetchStats, fetchConfig])

  useEffect(() => { load() }, [load])

  const handleSaveConfig = async (updates: any) => {
    const ok = await updateConfig(updates)
    if (ok) load()
    return ok
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Système de Parrainage</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Leaderboard, statistiques et configuration des récompenses.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard title="Référents actifs" value={stats.total_referrers} icon={Users} />
          <KpiCard title="Inscriptions" value={stats.total_signups} icon={MousePointerClick} />
          <KpiCard title="Conversions" value={stats.total_conversions} icon={TrendingUp} />
          <KpiCard title="Récompenses appliquées" value={stats.total_rewards_applied} icon={Gift} />
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Config */}
        {config && <ConfigEditor config={config} onSave={handleSaveConfig} />}

        {/* Leaderboard */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Top référents</CardTitle>
          </CardHeader>
          <CardContent>
            {leaderboard.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Aucun référent pour l'instant.
              </p>
            ) : (
              <div className="space-y-2">
                {leaderboard.map((entry, i) => (
                  <div key={entry.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                    <span className="text-xs text-muted-foreground w-5 text-center font-bold">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {entry.profiles?.email || entry.referrer_id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">{entry.referral_code}</p>
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span title="Clics">{entry.total_clicks}c</span>
                      <span title="Inscriptions">{entry.total_signups}s</span>
                      <Badge variant="secondary" className="text-xs">
                        {entry.total_conversions} conv.
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
