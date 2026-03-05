"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useAdminUsers, type UserDetail } from "@/hooks/admin/use-admin-users";
import UserActionsMenu from "./user-actions-menu";
import { RotateCcw, ExternalLink, Copy, Receipt, Zap } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

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

interface Props {
  userId: string | null;
  open: boolean;
  onClose: () => void;
  onAction: (action: string, userId: string, extra?: any) => Promise<void>;
  plans: any[];
}

const SEVERITY_COLORS: Record<string, string> = {
  info: "bg-blue-50 text-blue-700",
  warning: "bg-yellow-50 text-yellow-700",
  critical: "bg-red-50 text-red-700",
  emergency: "bg-red-100 text-red-900 font-bold",
};

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function copyToClipboard(text: string, label: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success(`${label} copié`));
}

export default function UserDetailDrawer({
  userId,
  open,
  onClose,
  onAction,
  plans,
}: Props) {
  const { fetchUserDetail, resetUsage } = useAdminUsers();
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [resettingUsage, setResettingUsage] = useState(false);
  const [payments, setPayments] = useState<any[]>([]);
  const [features, setFeatures] = useState<any[]>([]);
  const [togglingFeature, setTogglingFeature] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!userId || !open) return;
    setLoading(true);
    fetchUserDetail(userId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [userId, open, fetchUserDetail]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!userId || !open) return;
    adminFetch(`/api/admin/users/${userId}/payments`)
      .then((d) => setPayments(d.payments || []))
      .catch(() => setPayments([]));
    adminFetch(`/api/admin/users/${userId}/feature-overrides`)
      .then((d) => setFeatures(d.features || []))
      .catch(() => setFeatures([]));
  }, [userId, open]);

  const handleResetUsage = async () => {
    if (!userId) return;
    setResettingUsage(true);
    await resetUsage(userId);
    setResettingUsage(false);
    reload();
  };

  const handleToggleFeature = async (
    featureName: string,
    currentOverride: boolean | null,
  ) => {
    if (!userId) return;
    setTogglingFeature(featureName);
    try {
      if (currentOverride === null) {
        // Créer un override enabled
        await adminFetch(`/api/admin/users/${userId}/feature-overrides`, {
          method: "POST",
          body: JSON.stringify({ feature_name: featureName, enabled: true }),
        });
      } else if (currentOverride === true) {
        // Passer à disabled
        await adminFetch(`/api/admin/users/${userId}/feature-overrides`, {
          method: "POST",
          body: JSON.stringify({ feature_name: featureName, enabled: false }),
        });
      } else {
        // Supprimer l'override → retour aux droits du plan
        await adminFetch(
          `/api/admin/users/${userId}/feature-overrides/${featureName}`,
          {
            method: "DELETE",
          },
        );
      }
      const d = await adminFetch(
        `/api/admin/users/${userId}/feature-overrides`,
      );
      setFeatures(d.features || []);
    } catch (e: any) {
      toast.error(e.message || "Erreur");
    } finally {
      setTogglingFeature(null);
    }
  };

  if (!userId) return null;

  const profile = detail?.profile;
  const sub = detail?.subscription;
  const planInfo = sub?.subscription_plans;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center justify-between">
            <span>Fiche utilisateur</span>
            {profile && (
              <UserActionsMenu
                user={profile}
                plans={plans}
                onAction={async (a, id, e) => {
                  await onAction(a, id, e);
                  if (a !== "reset-password") onClose();
                }}
              />
            )}
          </SheetTitle>
        </SheetHeader>

        {loading && (
          <div className="py-12 text-center text-muted-foreground text-sm">
            Chargement...
          </div>
        )}

        {!loading && detail && (
          <div className="space-y-4">
            {/* Profile */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Identité
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="font-semibold text-base">
                  {profile?.full_name || "—"}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">
                    {profile?.email}
                  </span>
                  <button
                    onClick={() =>
                      copyToClipboard(profile?.email || "", "Email")
                    }
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Badge
                    variant={
                      profile?.status === "active" ? "default" : "destructive"
                    }
                  >
                    {profile?.status === "active"
                      ? "Actif"
                      : profile?.status === "suspended"
                        ? "Suspendu"
                        : "Supprimé"}
                  </Badge>
                  {profile?.is_admin && <Badge variant="outline">Admin</Badge>}
                </div>
                {profile?.suspended_reason && (
                  <div className="text-xs text-red-600 bg-red-50 rounded px-2 py-1.5">
                    Suspendu : {profile.suspended_reason}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground pt-1">
                  <div>
                    <span className="text-foreground/60">Inscrit :</span>
                    <br />
                    <span>{formatDate(profile?.created_at)}</span>
                  </div>
                  <div>
                    <span className="text-foreground/60">
                      Dernière connexion :
                    </span>
                    <br />
                    <span>{formatDate(detail.last_login_at)}</span>
                  </div>
                  <div>
                    <span className="text-foreground/60">LTV estimé :</span>
                    <br />
                    <span className="font-semibold text-foreground">
                      €{detail.total_paid.toFixed(0)}
                    </span>
                  </div>
                  <div>
                    <span className="text-foreground/60">ID :</span>
                    <br />
                    <button
                      className="font-mono text-[10px] truncate hover:text-foreground"
                      onClick={() => copyToClipboard(userId, "User ID")}
                    >
                      {userId.slice(0, 16)}…
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Subscription */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Abonnement
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1.5">
                {sub ? (
                  <>
                    <div className="font-semibold">
                      {planInfo?.display_name || sub.plan_id}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      €{planInfo?.price_monthly}/mois · Statut :{" "}
                      <span className="font-medium">{sub.status}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Renouvellement : {formatDate(sub.current_period_end)}
                    </div>
                    {detail.stripe_customer_id && (
                      <a
                        href={`https://dashboard.stripe.com/customers/${detail.stripe_customer_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary flex items-center gap-1 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Voir dans Stripe
                      </a>
                    )}
                  </>
                ) : (
                  <div className="text-muted-foreground">
                    Plan Free (aucun abonnement actif)
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Usage today + reset */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                  Usage — 30 derniers jours
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleResetUsage}
                    disabled={resettingUsage}
                  >
                    <RotateCcw
                      className={`h-3 w-3 mr-1 ${resettingUsage ? "animate-spin" : ""}`}
                    />
                    Reset aujourd'hui
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {detail.usage_30d.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Aucune activité enregistrée.
                  </p>
                ) : (
                  <div className="space-y-1 text-xs max-h-48 overflow-y-auto">
                    {detail.usage_30d.map((u: any) => (
                      <div
                        key={u.quota_date}
                        className="flex justify-between text-muted-foreground hover:text-foreground py-0.5"
                      >
                        <span className="font-mono">{u.quota_date}</span>
                        <span>
                          {u.cv_analyses_used > 0 &&
                            `${u.cv_analyses_used} CV · `}
                          {u.coach_seconds_used > 0 &&
                            `${Math.round(u.coach_seconds_used / 60)}min coach · `}
                          {u.job_searches_used > 0 &&
                            `${u.job_searches_used} recherches`}
                          {u.cv_analyses_used === 0 &&
                            u.coach_seconds_used === 0 &&
                            u.job_searches_used === 0 &&
                            "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Subscription history */}
            {detail.subscription_history.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Historique abonnements
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 text-xs">
                  {detail.subscription_history.map((h: any) => {
                    const planName =
                      h.subscription_plans?.display_name || h.plan_id || "—";
                    return (
                      <div
                        key={h.id}
                        className="flex items-center justify-between text-muted-foreground"
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] h-4">
                            {h.action_type || "changement"}
                          </Badge>
                          <span>{planName}</span>
                          {h.subscription_plans?.price_monthly && (
                            <span className="text-foreground/50">
                              €{h.subscription_plans.price_monthly}/mois
                            </span>
                          )}
                        </div>
                        <span>{formatDate(h.created_at)}</span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Security events */}
            {detail.security_events.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Événements sécurité ({detail.security_events.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 max-h-56 overflow-y-auto">
                  {detail.security_events.map((e: any) => (
                    <div key={e.id} className="text-xs space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] ${SEVERITY_COLORS[e.severity] || ""}`}
                        >
                          {e.severity}
                        </span>
                        <span className="font-mono text-muted-foreground">
                          {e.event_type}
                        </span>
                        {e.ip_address && (
                          <span className="text-muted-foreground/60 ml-auto">
                            {e.ip_address}
                          </span>
                        )}
                      </div>
                      <div className="text-muted-foreground pl-1">
                        {formatDate(e.created_at)}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Paiements Stripe */}
            {payments.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Receipt className="h-3.5 w-3.5" />
                    Paiements Stripe ({payments.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 text-xs max-h-48 overflow-y-auto">
                  {payments.map((p: any) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between py-0.5"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${p.status === "succeeded" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
                        >
                          {p.status}
                        </span>
                        <span className="font-semibold">
                          {p.currency} {p.amount.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                          {formatDate(p.created_at)}
                        </span>
                        {p.receipt_url && (
                          <a
                            href={p.receipt_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline flex items-center gap-0.5"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Feature Overrides */}
            {features.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Zap className="h-3.5 w-3.5" />
                    Features individuelles
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs max-h-64 overflow-y-auto">
                  <p className="text-muted-foreground text-[10px] pb-1">
                    Cliquez pour créer/modifier/supprimer les overrides (null =
                    droits du plan)
                  </p>
                  {features.map((f: any) => (
                    <div
                      key={f.name}
                      className="flex items-center justify-between py-0.5"
                    >
                      <div>
                        <span className="font-mono">{f.name}</span>
                        {f.has_override && (
                          <Badge
                            variant="outline"
                            className="ml-2 text-[10px] h-4"
                          >
                            override
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={f.override_enabled === true}
                          disabled={togglingFeature === f.name}
                          onCheckedChange={() =>
                            handleToggleFeature(f.name, f.override_enabled)
                          }
                          className="scale-75"
                        />
                        {f.has_override && (
                          <button
                            className="text-muted-foreground hover:text-destructive text-[10px]"
                            onClick={() => handleToggleFeature(f.name, false)}
                            title="Supprimer l'override"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
