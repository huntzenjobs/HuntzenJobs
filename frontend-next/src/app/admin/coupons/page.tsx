"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Tag, Plus, Trash2, RefreshCw, Gift } from "lucide-react";

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

interface Coupon {
  id: string;
  name: string | null;
  percent_off: number | null;
  amount_off: number | null;
  currency: string;
  duration: string;
  duration_in_months: number | null;
  max_redemptions: number | null;
  times_redeemed: number;
  valid: boolean;
  created_at: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function reductionLabel(c: Coupon) {
  if (c.percent_off) return `-${c.percent_off}%`;
  if (c.amount_off) return `-€${c.amount_off}`;
  return "—";
}

function durationLabel(c: Coupon) {
  if (c.duration === "forever") return "Permanent";
  if (c.duration === "repeating" && c.duration_in_months)
    return `${c.duration_in_months} mois`;
  return "1 fois";
}

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Coupon | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyEmail, setApplyEmail] = useState("");
  const [applyCouponId, setApplyCouponId] = useState("");
  const [applying, setApplying] = useState(false);

  // Form create
  const [form, setForm] = useState({
    name: "",
    type: "percent",
    percent_off: "",
    amount_off: "",
    duration: "once",
    duration_in_months: "",
    max_redemptions: "",
  });
  const [creating, setCreating] = useState(false);

  // Promo codes state
  const [promoCodes, setPromoCodes] = useState<any[]>([]);
  const [promoLoading, setPromoLoading] = useState(true);
  const [promoCreateOpen, setPromoCreateOpen] = useState(false);
  const [promoDeleteTarget, setPromoDeleteTarget] = useState<any>(null);
  const [promoCreating, setPromoCreating] = useState(false);
  const [promoForm, setPromoForm] = useState({
    code: "",
    description: "",
    discount_type: "percent",
    discount_value: "",
    plan: "",
    stripe_coupon_id: "",
    max_uses: "",
    expires_at: "",
    campaign: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetch("/api/admin/coupons");
      setCoupons(data.coupons || []);
    } catch {
      toast.error("Impossible de charger les coupons");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast.error("Nom requis");
      return;
    }
    setCreating(true);
    try {
      const body: Record<string, any> = {
        name: form.name,
        duration: form.duration,
      };
      if (form.type === "percent") {
        body.percent_off = parseFloat(form.percent_off);
      } else {
        body.amount_off = Math.round(parseFloat(form.amount_off) * 100);
      }
      if (form.duration === "repeating" && form.duration_in_months) {
        body.duration_in_months = parseInt(form.duration_in_months);
      }
      if (form.max_redemptions) {
        body.max_redemptions = parseInt(form.max_redemptions);
      }
      await adminFetch("/api/admin/coupons", {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast.success("Coupon créé");
      setCreateOpen(false);
      setForm({
        name: "",
        type: "percent",
        percent_off: "",
        amount_off: "",
        duration: "once",
        duration_in_months: "",
        max_redemptions: "",
      });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur création");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await adminFetch(`/api/admin/coupons/${deleteTarget.id}`, {
        method: "DELETE",
      });
      toast.success("Coupon supprimé");
      setDeleteTarget(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur suppression");
    }
  };

  const handleApply = async () => {
    if (!applyEmail || !applyCouponId) {
      toast.error("Email et coupon requis");
      return;
    }
    setApplying(true);
    try {
      // Trouver le user_id depuis l'email
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      const profilesRes = await fetch(
        `${BACKEND_URL}/api/admin/users?search=${encodeURIComponent(applyEmail)}&per_page=1`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const profiles = await profilesRes.json();
      const user = profiles.users?.[0];
      if (!user) {
        toast.error("Utilisateur introuvable");
        return;
      }
      await adminFetch(`/api/admin/users/${user.id}/apply-coupon`, {
        method: "POST",
        body: JSON.stringify({ coupon_id: applyCouponId }),
      });
      toast.success(`Coupon appliqué à ${user.email}`);
      setApplyOpen(false);
      setApplyEmail("");
      setApplyCouponId("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur application");
    } finally {
      setApplying(false);
    }
  };

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
      if (promoForm.stripe_coupon_id)
        body.stripe_coupon_id = promoForm.stripe_coupon_id;
      if (promoForm.max_uses) body.max_uses = parseInt(promoForm.max_uses);
      if (promoForm.expires_at)
        body.expires_at = new Date(promoForm.expires_at).toISOString();
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
        discount_type: "percent",
        discount_value: "",
        plan: "",
        stripe_coupon_id: "",
        max_uses: "",
        expires_at: "",
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
            Gérez les coupons Stripe et appliquez-les à vos utilisateurs.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setApplyOpen(true)}
          >
            <Gift className="h-4 w-4 mr-2" />
            Appliquer à un user
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            Actualiser
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Créer un coupon
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  ID / Nom
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Réduction
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Durée
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Utilisations
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Statut
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Créé le
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    Chargement...
                  </td>
                </tr>
              ) : coupons.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    Aucun coupon Stripe trouvé.
                  </td>
                </tr>
              ) : (
                coupons.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{c.name || c.id}</div>
                      <code className="text-[10px] text-muted-foreground">
                        {c.id}
                      </code>
                    </td>
                    <td className="px-4 py-3 font-semibold text-primary">
                      {reductionLabel(c)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {durationLabel(c)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {c.times_redeemed}
                      {c.max_redemptions ? ` / ${c.max_redemptions}` : ""}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={c.valid ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {c.valid ? "Actif" : "Expiré"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatDate(c.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(c)}
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
            Codes saisissables par les utilisateurs au signup. Lies aux coupons
            Stripe ci-dessus.
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
                  Statut
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {promoLoading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    Chargement...
                  </td>
                </tr>
              ) : promoCodes.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
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

      {/* Dialog Créer */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Créer un coupon Stripe</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nom</Label>
              <Input
                placeholder="Ex : BETA50, WELCOME20"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type de réduction</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Pourcentage (%)</SelectItem>
                    <SelectItem value="amount">Montant fixe (€)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>
                  {form.type === "percent" ? "Pourcentage" : "Montant (€)"}
                </Label>
                <Input
                  type="number"
                  placeholder={form.type === "percent" ? "20" : "10"}
                  value={
                    form.type === "percent" ? form.percent_off : form.amount_off
                  }
                  onChange={(e) =>
                    setForm((f) =>
                      form.type === "percent"
                        ? { ...f, percent_off: e.target.value }
                        : { ...f, amount_off: e.target.value },
                    )
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Durée</Label>
                <Select
                  value={form.duration}
                  onValueChange={(v) => setForm((f) => ({ ...f, duration: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">1 fois</SelectItem>
                    <SelectItem value="repeating">X mois</SelectItem>
                    <SelectItem value="forever">Permanent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.duration === "repeating" && (
                <div className="space-y-1.5">
                  <Label>Nombre de mois</Label>
                  <Input
                    type="number"
                    placeholder="3"
                    value={form.duration_in_months}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        duration_in_months: e.target.value,
                      }))
                    }
                  />
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Utilisations max (optionnel)</Label>
              <Input
                type="number"
                placeholder="Illimité"
                value={form.max_redemptions}
                onChange={(e) =>
                  setForm((f) => ({ ...f, max_redemptions: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Création..." : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Appliquer */}
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Appliquer un coupon à un utilisateur</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Email de l'utilisateur</Label>
              <Input
                placeholder="user@example.com"
                value={applyEmail}
                onChange={(e) => setApplyEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Coupon</Label>
              <Select value={applyCouponId} onValueChange={setApplyCouponId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un coupon" />
                </SelectTrigger>
                <SelectContent>
                  {coupons
                    .filter((c) => c.valid)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name || c.id} — {reductionLabel(c)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setApplyOpen(false)}
              disabled={applying}
            >
              Annuler
            </Button>
            <Button onClick={handleApply} disabled={applying}>
              {applying ? "Application..." : "Appliquer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation suppression */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce coupon ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le coupon{" "}
              <strong>{deleteTarget?.name || deleteTarget?.id}</strong> sera
              supprimé de Stripe. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                <Select
                  value={promoForm.discount_type}
                  onValueChange={(v) =>
                    setPromoForm((f) => ({ ...f, discount_type: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Pourcentage (%)</SelectItem>
                    <SelectItem value="free_days">Jours gratuits</SelectItem>
                    <SelectItem value="fixed_amount">Montant fixe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Valeur</Label>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Coupon Stripe (optionnel)</Label>
                <Select
                  value={promoForm.stripe_coupon_id}
                  onValueChange={(v) =>
                    setPromoForm((f) => ({ ...f, stripe_coupon_id: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Lier a un coupon" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Aucun</SelectItem>
                    {coupons
                      .filter((c) => c.valid)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name || c.id} — {reductionLabel(c)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
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
                <Label>Expiration</Label>
                <Input
                  type="date"
                  value={promoForm.expires_at}
                  onChange={(e) =>
                    setPromoForm((f) => ({ ...f, expires_at: e.target.value }))
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
