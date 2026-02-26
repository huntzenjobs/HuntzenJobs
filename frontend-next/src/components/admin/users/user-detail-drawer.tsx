'use client'

import { useEffect, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useAdminUsers, type UserDetail } from '@/hooks/admin/use-admin-users'
import UserActionsMenu from './user-actions-menu'

interface Props {
  userId: string | null
  open: boolean
  onClose: () => void
  onAction: (action: string, userId: string, extra?: any) => Promise<void>
  plans: any[]
}

const SEVERITY_COLORS: Record<string, string> = {
  info: 'bg-blue-50 text-blue-700',
  warning: 'bg-yellow-50 text-yellow-700',
  critical: 'bg-red-50 text-red-700',
  emergency: 'bg-red-100 text-red-900 font-bold',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

export default function UserDetailDrawer({ userId, open, onClose, onAction, plans }: Props) {
  const { fetchUserDetail } = useAdminUsers()
  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!userId || !open) return
    setLoading(true)
    fetchUserDetail(userId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
  }, [userId, open, fetchUserDetail])

  if (!userId) return null

  const profile = detail?.profile
  const sub = detail?.subscription
  const planInfo = sub?.subscription_plans

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center justify-between">
            <span>Détail utilisateur</span>
            {profile && (
              <UserActionsMenu user={profile} plans={plans} onAction={async (a, id, e) => {
                await onAction(a, id, e)
                if (a !== 'reset-password') onClose()
              }} />
            )}
          </SheetTitle>
        </SheetHeader>

        {loading && (
          <div className="py-12 text-center text-muted-foreground text-sm">Chargement...</div>
        )}

        {!loading && detail && (
          <div className="space-y-5">
            {/* Profile */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Profil</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="font-semibold">{profile?.full_name || '—'}</div>
                <div className="text-muted-foreground">{profile?.email}</div>
                <div className="flex gap-2 mt-2">
                  <Badge variant={profile?.status === 'active' ? 'default' : 'destructive'}>
                    {profile?.status}
                  </Badge>
                  {profile?.is_admin && <Badge variant="outline">Admin</Badge>}
                </div>
                {profile?.suspended_reason && (
                  <div className="mt-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                    Raison suspension : {profile.suspended_reason}
                  </div>
                )}
                <div className="text-xs text-muted-foreground mt-1">
                  Inscrit le {profile?.created_at ? formatDate(profile.created_at) : '—'}
                </div>
              </CardContent>
            </Card>

            {/* Subscription */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Abonnement</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                {sub ? (
                  <>
                    <div className="font-semibold">{planInfo?.display_name || sub.plan_id}</div>
                    <div className="text-muted-foreground">
                      €{planInfo?.price_monthly}/mois · Statut : {sub.status}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Fin période : {formatDate(sub.current_period_end)}
                    </div>
                  </>
                ) : (
                  <div className="text-muted-foreground">Plan Free (aucun abonnement actif)</div>
                )}
              </CardContent>
            </Card>

            {/* Usage today */}
            {detail.usage_30d.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Usage (30 derniers jours)</CardTitle>
                </CardHeader>
                <CardContent className="text-xs space-y-1">
                  {detail.usage_30d.slice(0, 7).map((u: any) => (
                    <div key={u.quota_date} className="flex justify-between text-muted-foreground">
                      <span>{u.quota_date}</span>
                      <span>{u.cv_analyses_used} CV · {Math.round(u.coach_seconds_used / 60)}min · {u.job_searches_used} jobs</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Security events */}
            {detail.security_events.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Événements récents ({detail.security_events.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {detail.security_events.slice(0, 10).map((e: any) => (
                    <div key={e.id} className="text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${SEVERITY_COLORS[e.severity] || ''}`}>
                          {e.severity}
                        </span>
                        <span className="font-mono">{e.event_type}</span>
                      </div>
                      <div className="text-muted-foreground ml-1">{formatDate(e.created_at)}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Subscription history */}
            {detail.subscription_history.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Historique abonnements</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-xs text-muted-foreground">
                  {detail.subscription_history.map((h: any) => (
                    <div key={h.id} className="flex justify-between">
                      <span>{h.action_type || 'change'}</span>
                      <span>{formatDate(h.created_at)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
