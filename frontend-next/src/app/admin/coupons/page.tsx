"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { Plus, RefreshCw, Tag, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

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
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Erreur");
  }
  return res.json();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function CouponsPage() {
  // Promo codes state
  const [promoCodes, setPromoCodes] = useState<any[]>([]);
  const [promoLoading, setPromoLoading] = useState(true);
  const [promoCreateOpen, setPromoCreateOpen] = useState(false);
  const [promoDeleteTarget, setPromoDeleteTarget] = useState<any>(null);
  const [promoCreating, setPromoCreating] = useState(false);
  const [promoForm, setPromoForm] = useState({
    code: "",
    description: "",
    discount_type: "free_days", // toujours jours gratuits
    discount_value: "",
    plan: "",
    max_uses: "",
    validity_days: "",
    campaign: "",
  });

  const loadPromos = useCallback(async () => {
    setPromoLoading(true);
    try {
      const data = await adminFetch("/api/admin/promo-codes");
      setPromoCodes(data || []);
    } catch {
      toast.error("Impossible de charger les codes promo");
    } finally {
      setPromoLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPromos();
  }, [loadPromos]);

  const handleCreatePromo = async () => {
    if (!promoForm.code.trim() || !promoForm.description.trim()) {
      toast.error("Code et description requis");
      return;
    }
    setPromoCreating(true);
    try {
      const body: Record<string, any> = {
        code: promoForm.code.toUpperCase(),
        description: promoForm.description,
        discount_type: promoForm.discount_type,
        discount_value: parseFloat(promoForm.discount_value) || 0,
      };
      if (promoForm.plan) body.plan = promoForm.plan;
      if (promoForm.max_uses) body.max_uses = parseInt(promoForm.max_uses);
      const validityDays = parseInt(promoForm.validity_days || "0", 10);
      if (!Number.isNaN(validityDays) && validityDays > 0) {
        const now = new Date();
        const expires = new Date(
          now.getTime() + validityDays * 24 * 60 * 60 * 1000,
        );
        body.expires_at = expires.toISOString();
      }
      if (promoForm.campaign) body.campaign = promoForm.campaign;

      await adminFetch("/api/admin/promo-codes", {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast.success("Code promo cree");
      setPromoCreateOpen(false);
      setPromoForm({
        code: "",
        description: "",
        discount_type: "free_days",
        discount_value: "",
        plan: "",
        max_uses: "",
        validity_days: "",
        campaign: "",
      });
      loadPromos();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setPromoCreating(false);
    }
  };

  const handleDeletePromo = async () => {
    if (!promoDeleteTarget) return;
    try {
      await adminFetch(`/api/admin/promo-codes/${promoDeleteTarget.id}`, {
        method: "DELETE",
      });
      toast.success("Code supprime");
      setPromoDeleteTarget(null);
      loadPromos();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  const handleTogglePromo = async (promo: any) => {
    try {
      await adminFetch(`/api/admin/promo-codes/${promo.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !promo.is_active }),
      });
      toast.success(promo.is_active ? "Code desactive" : "Code active");
      loadPromos();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Tag className="h-6 w-6" />
            Codes Promo
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gérez les codes promo (jours gratuits) utilisables par vos
            utilisateurs.
          </p>
        </div>
      </div>

      {/* ═══ CODES PROMO (DB) ═══ */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Codes Promo</CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadPromos}
                disabled={promoLoading}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${promoLoading ? "animate-spin" : ""}`}
                />
                Actualiser
              </Button>
              <Button size="sm" onClick={() => setPromoCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Creer un code
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Codes saisissables par les utilisateurs (signup, profil, etc.).
            Offrent des jours gratuits sur un plan.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Code
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Description
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Remise
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Utilisations
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Campagne
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Expire le
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Statut
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {promoLoading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    Chargement...
                  </td>
                </tr>
              ) : promoCodes.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    Aucun code promo.
                  </td>
                </tr>
              ) : (
                promoCodes.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <code className="font-mono font-bold text-primary">
                        {p.code}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">
                      {p.description}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {p.discount_type === "percent"
                        ? `-${p.discount_value}%`
                        : p.discount_type === "free_days"
                          ? `${p.discount_value}j gratuits`
                          : `-${p.discount_value}€`}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {p.current_uses}
                      {p.max_uses ? ` / ${p.max_uses}` : ""}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {p.campaign || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {p.expires_at ? formatDate(p.expires_at) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={p.is_active ? "default" : "secondary"}
                        className="text-xs cursor-pointer"
                        onClick={() => handleTogglePromo(p)}
                      >
                        {p.is_active ? "Actif" : "Inactif"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setPromoDeleteTarget(p)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Dialog Creer Code Promo */}
      <Dialog open={promoCreateOpen} onOpenChange={setPromoCreateOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Creer un code promo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Code</Label>
                <Input
                  placeholder="SUMMER2026"
                  value={promoForm.code}
                  onChange={(e) =>
                    setPromoForm((f) => ({ ...f, code: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Campagne</Label>
                <Input
                  placeholder="launch_mars"
                  value={promoForm.campaign}
                  onChange={(e) =>
                    setPromoForm((f) => ({ ...f, campaign: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input
                placeholder="20% de reduction sur le plan Pro"
                value={promoForm.description}
                onChange={(e) =>
                  setPromoForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Input value="Jours gratuits" disabled className="bg-muted" />
              </div>
              <div className="space-y-1.5">
                <Label>Nombre de jours offerts</Label>
                <Input
                  type="number"
                  placeholder="20"
                  value={promoForm.discount_value}
                  onChange={(e) =>
                    setPromoForm((f) => ({
                      ...f,
                      discount_value: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1.5">
                <Label>Plan cible</Label>
                <Select
                  value={promoForm.plan}
                  onValueChange={(v) =>
                    setPromoForm((f) => ({ ...f, plan: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Tous" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Tous les plans</SelectItem>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Max utilisations</Label>
                <Input
                  type="number"
                  placeholder="Illimite"
                  value={promoForm.max_uses}
                  onChange={(e) =>
                    setPromoForm((f) => ({ ...f, max_uses: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Validité du code (jours, optionnel)</Label>
                <Input
                  type="number"
                  placeholder="30"
                  value={promoForm.validity_days}
                  onChange={(e) =>
                    setPromoForm((f) => ({
                      ...f,
                      validity_days: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPromoCreateOpen(false)}
              disabled={promoCreating}
            >
              Annuler
            </Button>
            <Button onClick={handleCreatePromo} disabled={promoCreating}>
              {promoCreating ? "Creation..." : "Creer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation suppression promo */}
      <AlertDialog
        open={!!promoDeleteTarget}
        onOpenChange={(o) => !o && setPromoDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce code promo ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le code <strong>{promoDeleteTarget?.code}</strong> sera supprime.
              Les utilisateurs ne pourront plus l&apos;utiliser.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeletePromo}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
