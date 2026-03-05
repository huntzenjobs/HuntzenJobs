"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  XCircle,
  UserX,
  Mail,
  RefreshCw,
} from "lucide-react";
import SendEmailDialog from "@/components/admin/users/send-email-dialog";

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

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

interface AtRiskUser {
  user_id: string;
  email: string;
  full_name: string | null;
  plan_name: string;
  last_usage_date: string | null;
  days_inactive: number | null;
  current_period_end: string | null;
}

interface ChurnUser {
  user_id: string;
  email: string;
  full_name: string | null;
  plan_name: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  days_remaining: number | null;
}

interface NeverConvertedUser {
  user_id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  days_since_signup: number;
  cv_analyses_total: number;
  coach_seconds_total: number;
}

type SegmentUser = AtRiskUser | ChurnUser | NeverConvertedUser;

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-12 text-center text-muted-foreground text-sm">
      {message}
    </div>
  );
}

function BulkEmailButton({
  segment,
  count,
  disabled,
}: {
  segment: string;
  count: number;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={disabled || count === 0}
      >
        <Mail className="h-4 w-4 mr-2" />
        Envoyer un email ({count})
      </Button>
      <SendEmailDialog
        open={open}
        onClose={() => setOpen(false)}
        mode="bulk"
        segment={segment}
      />
    </>
  );
}

export default function SegmentsPage() {
  const [atRisk, setAtRisk] = useState<AtRiskUser[]>([]);
  const [churn, setChurn] = useState<ChurnUser[]>([]);
  const [neverConverted, setNeverConverted] = useState<NeverConvertedUser[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [emailTarget, setEmailTarget] = useState<{ userId: string; email: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ar, ch, nc] = await Promise.all([
        adminFetch("/api/admin/segments/at-risk"),
        adminFetch("/api/admin/segments/about-to-churn"),
        adminFetch("/api/admin/segments/never-converted"),
      ]);
      setAtRisk(ar.users || []);
      setChurn(ch.users || []);
      setNeverConverted(nc.users || []);
    } catch {
      toast.error("Impossible de charger les segments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Rétention</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Segments utilisateurs à risque de churn ou non convertis.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw
            className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
          />
          Actualiser
        </Button>
      </div>

      <Tabs defaultValue="at-risk">
        <TabsList>
          <TabsTrigger value="at-risk" className="gap-2">
            <AlertTriangle className="h-3.5 w-3.5" />À risque
            {atRisk.length > 0 && (
              <Badge variant="destructive" className="text-[10px] h-4 ml-1">
                {atRisk.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="churn" className="gap-2">
            <XCircle className="h-3.5 w-3.5" />
            Bientôt perdus
            {churn.length > 0 && (
              <Badge variant="destructive" className="text-[10px] h-4 ml-1">
                {churn.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="never-converted" className="gap-2">
            <UserX className="h-3.5 w-3.5" />
            Jamais convertis
            {neverConverted.length > 0 && (
              <Badge variant="secondary" className="text-[10px] h-4 ml-1">
                {neverConverted.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* À RISQUE */}
        <TabsContent value="at-risk">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Abonnés actifs sans activité depuis 7+ jours ({atRisk.length})
                </span>
                <BulkEmailButton
                  segment="at-risk"
                  count={atRisk.length}
                  disabled={loading}
                />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <EmptyState message="Chargement..." />
              ) : atRisk.length === 0 ? (
                <EmptyState message="Aucun abonné à risque. Excellent !" />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                        Utilisateur
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                        Plan
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                        Dernière activité
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                        Fin abo
                      </th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {atRisk.map((u) => (
                      <tr
                        key={u.user_id}
                        className="border-b hover:bg-muted/20 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium">
                            {u.full_name || "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {u.email}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs">{u.plan_name}</td>
                        <td className="px-4 py-3 text-xs">
                          {u.last_usage_date ? (
                            <span className="text-amber-600 font-medium">
                              {formatDate(u.last_usage_date)}
                              {u.days_inactive != null &&
                                ` (${u.days_inactive}j)`}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              Jamais
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {formatDate(u.current_period_end)}
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setEmailTarget({
                                userId: u.user_id,
                                email: u.email,
                              })
                            }
                          >
                            <Mail className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* BIENTÔT PERDUS */}
        <TabsContent value="churn">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-destructive" />
                  Annulation prévue ou paiement en retard ({churn.length})
                </span>
                <BulkEmailButton
                  segment="about-to-churn"
                  count={churn.length}
                  disabled={loading}
                />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <EmptyState message="Chargement..." />
              ) : churn.length === 0 ? (
                <EmptyState message="Aucune annulation en cours." />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                        Utilisateur
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                        Plan
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                        Statut
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                        Expire dans
                      </th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {churn.map((u) => (
                      <tr
                        key={u.user_id}
                        className="border-b hover:bg-muted/20 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium">
                            {u.full_name || "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {u.email}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs">{u.plan_name}</td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              u.status === "past_due" ? "destructive" : "outline"
                            }
                            className="text-xs"
                          >
                            {u.status === "past_due"
                              ? "Retard paiement"
                              : "Annulation prévue"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {u.days_remaining != null ? (
                            <span
                              className={
                                u.days_remaining <= 3
                                  ? "text-destructive font-bold"
                                  : u.days_remaining <= 7
                                    ? "text-amber-600 font-medium"
                                    : "text-muted-foreground"
                              }
                            >
                              {u.days_remaining}j ({formatDate(u.current_period_end)})
                            </span>
                          ) : (
                            formatDate(u.current_period_end)
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setEmailTarget({
                                userId: u.user_id,
                                email: u.email,
                              })
                            }
                          >
                            <Mail className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* JAMAIS CONVERTIS */}
        <TabsContent value="never-converted">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <UserX className="h-4 w-4 text-muted-foreground" />
                  Inscrits 14j+ sans abonnement, avec activité ({neverConverted.length})
                </span>
                <BulkEmailButton
                  segment="never-converted"
                  count={neverConverted.length}
                  disabled={loading}
                />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <EmptyState message="Chargement..." />
              ) : neverConverted.length === 0 ? (
                <EmptyState message="Tous vos utilisateurs actifs ont souscrit !" />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                        Utilisateur
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                        Inscrit depuis
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                        Analyses CV
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                        Coach utilisé
                      </th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {neverConverted.map((u) => (
                      <tr
                        key={u.user_id}
                        className="border-b hover:bg-muted/20 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium">
                            {u.full_name || "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {u.email}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {u.days_since_signup}j
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <span className="font-semibold">
                            {u.cv_analyses_total}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {u.coach_seconds_total > 0
                            ? `${Math.round(u.coach_seconds_total / 60)}min`
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setEmailTarget({
                                userId: u.user_id,
                                email: u.email,
                              })
                            }
                          >
                            <Mail className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Email individuel dialog */}
      {emailTarget && (
        <SendEmailDialog
          open={true}
          onClose={() => setEmailTarget(null)}
          mode="single"
          userId={emailTarget.userId}
          userEmail={emailTarget.email}
        />
      )}
    </div>
  );
}
