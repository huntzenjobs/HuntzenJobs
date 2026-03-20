'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  useAdminReferrals,
  type ReferralLeaderEntry,
  type ReferralStats,
  type ReferralConfig,
  type ReferralTier,
} from '@/hooks/admin/use-admin-referrals'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RefreshCw, Users, TrendingUp, Gift, MousePointerClick, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

function KpiCard({ title, value, icon: Icon }: { title: string; value: string | number; icon: React.ComponentType<{ className?: string }> }) {
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

// ---------------------------------------------------------------------------
// Tier Editor — full CRUD for referral tiers
// ---------------------------------------------------------------------------

const EMPTY_TIER: ReferralTier = {
  name: '',
  friends: 1,
  reward_type: 'free_days',
  reward_value: 7,
  reward_plan: 'pro',
  description: '',
}

const REWARD_TYPE_LABELS: Record<string, string> = {
  free_days: 'Jours offerts',
  quota_bonus: 'Quota bonus',
  stripe_coupon: 'Coupon Stripe',
}

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  pro: 'Accélérateur',
  premium: 'Carrière',
}

function TierEditor({
  tiers: initialTiers,
  onSave,
}: {
  tiers: ReferralTier[]
  onSave: (tiers: ReferralTier[]) => Promise<boolean>
}) {
  const [tiers, setTiers] = useState<ReferralTier[]>(initialTiers)
  const [saving, setSaving] = useState(false)

  // Sync if parent data changes (e.g. after reload)
  useEffect(() => {
    setTiers(initialTiers)
  }, [initialTiers])

  const updateTier = (index: number, field: keyof ReferralTier, value: string | number) => {
    setTiers((prev) => {
      const copy = [...prev]
      copy[index] = { ...copy[index], [field]: value }
      return copy
    })
  }

  const addTier = () => {
    setTiers((prev) => [...prev, { ...EMPTY_TIER }])
  }

  const removeTier = (index: number) => {
    setTiers((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    // Validation basique
    for (const tier of tiers) {
      if (!tier.name.trim()) {
        toast.error('Chaque palier doit avoir un nom')
        return
      }
      if (tier.friends < 1) {
        toast.error('Le nombre d\'amis doit être >= 1')
        return
      }
      if (tier.reward_value < 1) {
        toast.error('La valeur de récompense doit être >= 1')
        return
      }
    }

    setSaving(true)
    await onSave(tiers)
    setSaving(false)
  }

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Paliers de récompenses</CardTitle>
          <Button variant="outline" size="sm" onClick={addTier}>
            <Plus className="h-4 w-4 mr-1" />
            Ajouter un palier
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {tiers.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Aucun palier configuré.
          </p>
        ) : (
          <div className="space-y-4">
            {tiers.map((tier, index) => (
              <div
                key={index}
                className="border rounded-lg p-4 space-y-3 relative"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Palier {index + 1}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => removeTier(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {/* Nom */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Nom</Label>
                    <Input
                      value={tier.name}
                      onChange={(e) => updateTier(index, 'name', e.target.value)}
                      placeholder="Bronze"
                      className="h-8 text-sm"
                    />
                  </div>

                  {/* Friends threshold */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Amis requis</Label>
                    <Input
                      type="number"
                      min="1"
                      max="100"
                      value={tier.friends}
                      onChange={(e) => updateTier(index, 'friends', parseInt(e.target.value) || 1)}
                      className="h-8 text-sm"
                    />
                  </div>

                  {/* Reward type */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Type de récompense</Label>
                    <Select
                      value={tier.reward_type}
                      onValueChange={(v) => updateTier(index, 'reward_type', v)}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(REWARD_TYPE_LABELS).map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Reward value */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {tier.reward_type === 'free_days'
                        ? 'Jours'
                        : tier.reward_type === 'quota_bonus'
                          ? 'Bonus quota'
                          : 'Réduction (%)'}
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      max={tier.reward_type === 'stripe_coupon' ? 100 : 365}
                      value={tier.reward_value}
                      onChange={(e) => updateTier(index, 'reward_value', parseInt(e.target.value) || 1)}
                      className="h-8 text-sm"
                    />
                  </div>

                  {/* Reward plan */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Plan concerné</Label>
                    <Select
                      value={tier.reward_plan}
                      onValueChange={(v) => updateTier(index, 'reward_plan', v)}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PLAN_LABELS).map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Description */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Description</Label>
                    <Input
                      value={tier.description}
                      onChange={(e) => updateTier(index, 'description', e.target.value)}
                      placeholder="7 jours Accélérateur offerts"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Sauvegarde...' : 'Sauvegarder les paliers'}
        </Button>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Config Editor — programme on/off + conversion reward type
// ---------------------------------------------------------------------------

function ConfigEditor({
  config,
  onSave,
}: {
  config: ReferralConfig
  onSave: (updates: Record<string, unknown>) => Promise<boolean>
}) {
  const [rewardType, setRewardType] = useState(config.conversion_reward_type)
  const [days, setDays] = useState(String(config.conversion_reward_value?.days ?? 7))
  const [active, setActive] = useState(config.is_active)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    const reward_value: Record<string, number> = {}
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
                {REWARD_TYPE_LABELS[t]}
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

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

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

  const handleSaveConfig = async (updates: Record<string, unknown>) => {
    const ok = await updateConfig(updates)
    if (ok) load()
    return ok
  }

  const handleSaveTiers = async (tiers: ReferralTier[]) => {
    const ok = await updateConfig({ tiers })
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

      {/* Tier Editor — full width */}
      {config && <TierEditor tiers={config.tiers || []} onSave={handleSaveTiers} />}
    </div>
  )
}
