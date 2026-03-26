'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  useAdminReferrals,
  type ReferralLeaderEntry,
  type ReferralStats,
  type ReferralConfig,
  type ReferralTier,
  type ReferralSignupEntry,
  type ReferralRewardEntry,
} from '@/hooks/admin/use-admin-referrals'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  RefreshCw, Users, TrendingUp, Gift, MousePointerClick,
  Plus, Trash2, ChevronLeft, ChevronRight, Link2, Percent,
  Crown, ArrowRight,
} from 'lucide-react'
import { toast } from 'sonner'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REWARD_TYPE_LABELS: Record<string, string> = {
  free_days: 'Jours offerts',
  quota_bonus: 'Quota bonus',
  stripe_coupon: 'Coupon Stripe',
}

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  pro: 'Accélérateur',
  premium: 'Carrière',
  free: 'Gratuit',
}

function planBadge(plan: string | null) {
  if (!plan) return <Badge variant="outline" className="text-xs">-</Badge>
  const colors: Record<string, string> = {
    premium: 'bg-amber-100 text-amber-800 border-amber-200',
    pro: 'bg-blue-100 text-blue-800 border-blue-200',
    starter: 'bg-green-100 text-green-800 border-green-200',
    free: 'bg-gray-100 text-gray-600 border-gray-200',
  }
  return (
    <Badge variant="outline" className={`text-xs ${colors[plan] || ''}`}>
      {PLAN_LABELS[plan] || plan}
    </Badge>
  )
}

function formatDate(iso: string | null) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function KpiCard({ title, value, subtitle, icon: Icon }: {
  title: string; value: string | number; subtitle?: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
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
// Tab 1 : Vue d'ensemble (KPIs + Leaderboard)
// ---------------------------------------------------------------------------

function OverviewTab({ stats, leaderboard, loading }: {
  stats: ReferralStats | null
  leaderboard: ReferralLeaderEntry[]
  loading: boolean
}) {
  if (loading) return <div className="py-12 text-center text-muted-foreground">Chargement...</div>

  return (
    <div className="space-y-6">
      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KpiCard
            title="Référents actifs"
            value={stats.active_referrers ?? stats.total_referrers}
            subtitle={stats.inactive_referrers ? `${stats.inactive_referrers} inactif(s)` : undefined}
            icon={Users}
          />
          <KpiCard title="Inscriptions" value={stats.total_signups} icon={MousePointerClick} />
          <KpiCard title="Conversions" value={stats.total_conversions} icon={TrendingUp} />
          <KpiCard title="Récompenses" value={stats.total_rewards_applied} icon={Gift} />
          <KpiCard
            title="Taux conversion"
            value={`${stats.conversion_rate ?? 0}%`}
            icon={Percent}
          />
          <KpiCard
            title="Revenue plans"
            value={Object.values(stats.revenue_by_plan || {}).reduce((a, b) => a + b, 0)}
            subtitle={Object.entries(stats.revenue_by_plan || {}).map(([p, n]) => `${n} ${p}`).join(', ') || 'Aucun'}
            icon={Crown}
          />
        </div>
      )}

      {/* Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Top référents</CardTitle>
        </CardHeader>
        <CardContent>
          {leaderboard.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Aucun référent pour l'instant.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-2 w-8">#</th>
                    <th className="py-2 pr-3">Référent</th>
                    <th className="py-2 pr-3">Plan</th>
                    <th className="py-2 pr-3">Code</th>
                    <th className="py-2 pr-3 text-center">Funnel</th>
                    <th className="py-2 pr-3 text-center">Revenue</th>
                    <th className="py-2">Dernière activité</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry, i) => (
                    <tr key={entry.id} className="border-b last:border-0">
                      <td className="py-3 pr-2 text-xs text-muted-foreground font-bold">{i + 1}</td>
                      <td className="py-3 pr-3">
                        <p className="font-medium truncate max-w-[200px]">
                          {entry.profiles?.full_name || entry.profiles?.email || entry.referrer_id.slice(0, 8)}
                        </p>
                        {entry.profiles?.full_name && (
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {entry.profiles.email}
                          </p>
                        )}
                      </td>
                      <td className="py-3 pr-3">{planBadge(entry.referrer_plan)}</td>
                      <td className="py-3 pr-3">
                        <span className="font-mono text-xs text-muted-foreground">{entry.referral_code}</span>
                      </td>
                      <td className="py-3 pr-3 text-center">
                        <div className="flex items-center justify-center gap-1 text-xs">
                          <span title="Clics">{entry.total_clicks}c</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <span title="Inscrits">{entry.total_signups}s</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <Badge variant="secondary" className="text-xs">{entry.total_conversions} conv.</Badge>
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-center">
                        {entry.paying_referrals > 0 ? (
                          <div className="flex flex-wrap gap-1 justify-center">
                            {Object.entries(entry.paying_plans || {}).map(([plan, count]) => (
                              <Badge key={plan} variant="outline" className="text-xs">
                                {count}x {PLAN_LABELS[plan] || plan}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-3 text-xs text-muted-foreground">
                        {formatDate(entry.last_signup_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab 2 : Filleuls
// ---------------------------------------------------------------------------

function SignupsTab({ fetchSignups, linkManual }: {
  fetchSignups: (page?: number) => Promise<{ signups: ReferralSignupEntry[]; total: number; page: number; per_page: number }>
  linkManual: (referrerEmail: string, referredEmail: string) => Promise<boolean>
}) {
  const [signups, setSignups] = useState<ReferralSignupEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [linkReferrer, setLinkReferrer] = useState('')
  const [linkReferred, setLinkReferred] = useState('')
  const [linking, setLinking] = useState(false)

  const load = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const data = await fetchSignups(p)
      setSignups(data.signups)
      setTotal(data.total)
      setPage(data.page)
    } catch {
      toast.error('Erreur chargement filleuls')
    } finally {
      setLoading(false)
    }
  }, [fetchSignups])

  useEffect(() => { load(1) }, [load])

  const handleLink = async () => {
    if (!linkReferrer.trim() || !linkReferred.trim()) return
    setLinking(true)
    const ok = await linkManual(linkReferrer.trim(), linkReferred.trim())
    setLinking(false)
    if (ok) {
      setLinkReferrer('')
      setLinkReferred('')
      load(page)
    }
  }

  const totalPages = Math.ceil(total / 50)

  return (
    <div className="space-y-4">
      {/* Lien manuel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Lier manuellement un filleul
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">Email du parrain</Label>
              <Input
                value={linkReferrer}
                onChange={e => setLinkReferrer(e.target.value)}
                placeholder="parrain@email.com"
                className="h-9 text-sm"
              />
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">Email du filleul</Label>
              <Input
                value={linkReferred}
                onChange={e => setLinkReferred(e.target.value)}
                placeholder="filleul@email.com"
                className="h-9 text-sm"
              />
            </div>
            <Button size="sm" onClick={handleLink} disabled={linking || !linkReferrer || !linkReferred}>
              {linking ? 'Liaison...' : 'Lier'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              Tous les filleuls ({total})
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => load(page)} disabled={loading}>
              <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Actualiser
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">Chargement...</div>
          ) : signups.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Aucun filleul enregistré.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3">Filleul</th>
                      <th className="py-2 pr-3">Parrain</th>
                      <th className="py-2 pr-3">Code</th>
                      <th className="py-2 pr-3">Date inscription</th>
                      <th className="py-2 pr-3">Statut</th>
                      <th className="py-2">Plan converti</th>
                    </tr>
                  </thead>
                  <tbody>
                    {signups.map(s => (
                      <tr key={s.id} className="border-b last:border-0">
                        <td className="py-3 pr-3">
                          <p className="font-medium truncate max-w-[180px]">{s.referred_email}</p>
                          {s.referred_name && <p className="text-xs text-muted-foreground">{s.referred_name}</p>}
                        </td>
                        <td className="py-3 pr-3">
                          <p className="truncate max-w-[180px]">{s.referrer_email}</p>
                          {s.referrer_name && <p className="text-xs text-muted-foreground">{s.referrer_name}</p>}
                        </td>
                        <td className="py-3 pr-3">
                          <span className="font-mono text-xs text-muted-foreground">{s.referral_code}</span>
                        </td>
                        <td className="py-3 pr-3 text-xs">{formatDate(s.signed_up_at)}</td>
                        <td className="py-3 pr-3">
                          {s.converted_to_paid_at ? (
                            <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Converti</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Inscrit</Badge>
                          )}
                        </td>
                        <td className="py-3">{s.converted_plan ? planBadge(s.converted_plan) : <span className="text-xs text-muted-foreground">-</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => load(page - 1)}>
                    <ChevronLeft className="h-4 w-4 mr-1" /> Précédent
                  </Button>
                  <span className="text-xs text-muted-foreground">Page {page} / {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => load(page + 1)}>
                    Suivant <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab 3 : Récompenses
// ---------------------------------------------------------------------------

function RewardsTab({ fetchRewards, grantReward }: {
  fetchRewards: (page?: number) => Promise<{ rewards: ReferralRewardEntry[]; total: number; page: number; per_page: number }>
  grantReward: (signupId: string) => Promise<boolean>
}) {
  const [rewards, setRewards] = useState<ReferralRewardEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const data = await fetchRewards(p)
      setRewards(data.rewards)
      setTotal(data.total)
      setPage(data.page)
    } catch {
      toast.error('Erreur chargement récompenses')
    } finally {
      setLoading(false)
    }
  }, [fetchRewards])

  useEffect(() => { load(1) }, [load])

  const totalPages = Math.ceil(total / 50)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            Historique des récompenses ({total})
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => load(page)} disabled={loading}>
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Chargement...</div>
        ) : rewards.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Aucune récompense enregistrée.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3">Référent</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Palier</th>
                    <th className="py-2 pr-3">Statut</th>
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rewards.map(r => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-3 pr-3">
                        <p className="font-medium truncate max-w-[180px]">{r.referrer_email}</p>
                        {r.referrer_name && <p className="text-xs text-muted-foreground">{r.referrer_name}</p>}
                      </td>
                      <td className="py-3 pr-3 text-xs">{REWARD_TYPE_LABELS[r.reward_type] || r.reward_type}</td>
                      <td className="py-3 pr-3">
                        {r.tier_name ? (
                          <Badge variant="outline" className="text-xs">{r.tier_name}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Conversion</span>
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        {r.applied ? (
                          <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Appliqué</Badge>
                        ) : (
                          <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs">En attente</Badge>
                        )}
                      </td>
                      <td className="py-3 pr-3 text-xs">{formatDate(r.applied_at || r.created_at)}</td>
                      <td className="py-3">
                        {!r.applied && r.referral_signup_id && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={async () => {
                              const ok = await grantReward(r.referral_signup_id)
                              if (ok) load(page)
                            }}
                          >
                            Appliquer
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => load(page - 1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Précédent
                </Button>
                <span className="text-xs text-muted-foreground">Page {page} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => load(page + 1)}>
                  Suivant <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Tab 4 : Configuration (existant, inchangé)
// ---------------------------------------------------------------------------

const EMPTY_TIER: ReferralTier = {
  name: '',
  friends: 1,
  reward_type: 'free_days',
  reward_value: 7,
  reward_plan: 'pro',
  description: '',
}

function TierEditor({ tiers: initialTiers, onSave }: {
  tiers: ReferralTier[]
  onSave: (tiers: ReferralTier[]) => Promise<boolean>
}) {
  const [tiers, setTiers] = useState<ReferralTier[]>(initialTiers)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setTiers(initialTiers) }, [initialTiers])

  const updateTier = (index: number, field: keyof ReferralTier, value: string | number) => {
    setTiers(prev => {
      const copy = [...prev]
      copy[index] = { ...copy[index], [field]: value }
      return copy
    })
  }

  const addTier = () => setTiers(prev => [...prev, { ...EMPTY_TIER }])
  const removeTier = (index: number) => setTiers(prev => prev.filter((_, i) => i !== index))

  const handleSave = async () => {
    for (const tier of tiers) {
      if (!tier.name.trim()) { toast.error('Chaque palier doit avoir un nom'); return }
      if (tier.friends < 1) { toast.error("Le nombre d'amis doit être >= 1"); return }
      if (tier.reward_value < 1) { toast.error('La valeur de récompense doit être >= 1'); return }
    }
    setSaving(true)
    await onSave(tiers)
    setSaving(false)
  }

  return (
    <Card>
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
          <p className="text-sm text-muted-foreground py-4 text-center">Aucun palier configuré.</p>
        ) : (
          <div className="space-y-4">
            {tiers.map((tier, index) => (
              <div key={index} className="border rounded-lg p-4 space-y-3 relative">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Palier {index + 1}</span>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => removeTier(index)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Nom</Label>
                    <Input value={tier.name} onChange={e => updateTier(index, 'name', e.target.value)} placeholder="Bronze" className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Amis requis</Label>
                    <Input type="number" min="1" max="100" value={tier.friends} onChange={e => updateTier(index, 'friends', parseInt(e.target.value) || 1)} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Type de récompense</Label>
                    <Select value={tier.reward_type} onValueChange={v => updateTier(index, 'reward_type', v)}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(REWARD_TYPE_LABELS).map(([key, label]) => (
                          <SelectItem key={key} value={key}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {tier.reward_type === 'free_days' ? 'Jours' : tier.reward_type === 'quota_bonus' ? 'Bonus quota' : 'Réduction (%)'}
                    </Label>
                    <Input type="number" min="1" max={tier.reward_type === 'stripe_coupon' ? 100 : 365} value={tier.reward_value} onChange={e => updateTier(index, 'reward_value', parseInt(e.target.value) || 1)} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Plan concerné</Label>
                    <Select value={tier.reward_plan} onValueChange={v => updateTier(index, 'reward_plan', v)}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(PLAN_LABELS).filter(([k]) => k !== 'free').map(([key, label]) => (
                          <SelectItem key={key} value={key}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Description</Label>
                    <Input value={tier.description} onChange={e => updateTier(index, 'description', e.target.value)} placeholder="7 jours Accélérateur offerts" className="h-8 text-sm" />
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

function ConfigEditor({ config, onSave }: {
  config: ReferralConfig
  onSave: (updates: Record<string, unknown>) => Promise<boolean>
}) {
  const [rewardType, setRewardType] = useState(config.conversion_reward_type)
  const [days, setDays] = useState(String((config.conversion_reward_value as Record<string, number>)?.days ?? 7))
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
            {(['free_days', 'quota_bonus', 'stripe_coupon'] as const).map(t => (
              <Button key={t} size="sm" variant={rewardType === t ? 'default' : 'outline'} onClick={() => setRewardType(t)}>
                {REWARD_TYPE_LABELS[t]}
              </Button>
            ))}
          </div>
        </div>
        {rewardType === 'free_days' && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Nombre de jours offerts</Label>
            <Input type="number" min="1" max="365" value={days} onChange={e => setDays(e.target.value)} className="h-8 w-24 text-sm" />
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
  const {
    fetchLeaderboard, fetchStats, fetchConfig, updateConfig,
    grantReward, fetchSignups, fetchRewards, linkManual,
  } = useAdminReferrals()

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
            Analytics, filleuls, récompenses et configuration.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Vue d&apos;ensemble</TabsTrigger>
          <TabsTrigger value="signups">Filleuls</TabsTrigger>
          <TabsTrigger value="rewards">Récompenses</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab stats={stats} leaderboard={leaderboard} loading={loading} />
        </TabsContent>

        <TabsContent value="signups" className="mt-4">
          <SignupsTab fetchSignups={fetchSignups} linkManual={linkManual} />
        </TabsContent>

        <TabsContent value="rewards" className="mt-4">
          <RewardsTab fetchRewards={fetchRewards} grantReward={grantReward} />
        </TabsContent>

        <TabsContent value="config" className="mt-4">
          <div className="space-y-6">
            {config && <ConfigEditor config={config} onSave={handleSaveConfig} />}
            {config && <TierEditor tiers={config.tiers || []} onSave={handleSaveTiers} />}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
