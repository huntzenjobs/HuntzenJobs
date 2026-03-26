"use client";

import { useState } from "react";
import {
  MoreHorizontal,
  Ban,
  CheckCircle,
  Trash2,
  KeyRound,
  ArrowUpDown,
  Mail,
  LogIn,
  LogOut,
  Gift,
  StickyNote,
  AtSign,
  ShieldOff,
  Settings2,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { AdminUser } from "@/hooks/admin/use-admin-users";
import type { AdminPlan, AdminActionExtra } from "@/types/admin";
import ForcePlanDialog from "./force-plan-dialog";
import SendEmailDialog from "./send-email-dialog";
import { createClient } from "@/lib/supabase/client";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface Props {
  user: AdminUser;
  plans: AdminPlan[];
  onAction: (
    action: string,
    userId: string,
    extra?: AdminActionExtra,
  ) => Promise<void>;
}

async function adminPost(path: string, body?: object) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: path.endsWith("/email") ? "PUT" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function UserActionsMenu({ user, plans, onAction }: Props) {
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [forcePlanOpen, setForcePlanOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [impersonateOpen, setImpersonateOpen] = useState(false);
  const [banOpen, setBanOpen] = useState(false);
  const [forceSignoutOpen, setForceSignoutOpen] = useState(false);
  const [changeEmailOpen, setChangeEmailOpen] = useState(false);
  const [grantDaysOpen, setGrantDaysOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [customLimitsOpen, setCustomLimitsOpen] = useState(false);
  const [limitCV, setLimitCV] = useState("");
  const [limitCoach, setLimitCoach] = useState("");
  const [limitJobs, setLimitJobs] = useState("");

  const [suspendReason, setSuspendReason] = useState("");
  const [banReason, setBanReason] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [grantDays, setGrantDays] = useState("7");
  const [grantReason, setGrantReason] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [acting, setActing] = useState(false);

  const handleImpersonate = async () => {
    setImpersonateOpen(false);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(
        `${BACKEND_URL}/api/admin/users/${user.id}/impersonate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      window.open(data.magic_link, "_blank");
      toast.warning(`Connexion en tant que ${data.target_email}`);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Erreur lors de l'impersonation",
      );
    }
  };

  const handleSuspend = async () => {
    if (!suspendReason.trim()) return;
    setActing(true);
    await onAction("suspend", user.id, suspendReason);
    setActing(false);
    setSuspendOpen(false);
    setSuspendReason("");
  };

  const handleDelete = async () => {
    setActing(true);
    await onAction("delete", user.id);
    setActing(false);
    setDeleteOpen(false);
  };

  const handleBan = async () => {
    setActing(true);
    try {
      await adminPost(`/api/admin/users/${user.id}/ban`, { reason: banReason });
      toast.success(`${user.email} banni`);
      setBanOpen(false);
      setBanReason("");
      await onAction("reactivate", user.id); // refresh
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors du ban");
    } finally {
      setActing(false);
    }
  };

  const handleUnban = async () => {
    setActing(true);
    try {
      await adminPost(`/api/admin/users/${user.id}/unban`);
      toast.success(`${user.email} débanni`);
      await onAction("reactivate", user.id); // refresh
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors du unban");
    } finally {
      setActing(false);
    }
  };

  const handleForceSignout = async () => {
    setForceSignoutOpen(false);
    try {
      await adminPost(`/api/admin/users/${user.id}/force-signout`);
      toast.success(`Sessions révoquées pour ${user.email}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  const handleChangeEmail = async () => {
    if (!newEmail.trim()) return;
    setActing(true);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(
        `${BACKEND_URL}/api/admin/users/${user.id}/email`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ new_email: newEmail }),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      toast.success(`Email mis à jour : ${newEmail}`);
      setChangeEmailOpen(false);
      setNewEmail("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setActing(false);
    }
  };

  const handleGrantDays = async () => {
    const days = parseInt(grantDays, 10);
    if (!days || days < 1) return;
    setActing(true);
    try {
      await adminPost(`/api/admin/users/${user.id}/grant-days`, {
        days,
        reason: grantReason,
      });
      toast.success(`${days} jours offerts à ${user.email}`);
      setGrantDaysOpen(false);
      setGrantDays("7");
      setGrantReason("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setActing(false);
    }
  };

  const handleSetCustomLimits = async () => {
    setActing(true);
    try {
      const body: Record<string, number | null> = {};
      if (limitCV !== "")
        body.cv_analyses_daily = limitCV === "0" ? null : parseInt(limitCV, 10);
      if (limitCoach !== "")
        body.coach_seconds_daily =
          limitCoach === "0" ? null : parseInt(limitCoach, 10);
      if (limitJobs !== "")
        body.job_searches_daily =
          limitJobs === "0" ? null : parseInt(limitJobs, 10);
      await adminPost(`/api/admin/users/${user.id}/set-custom-limits`, body);
      toast.success("Limites personnalisées appliquées");
      setCustomLimitsOpen(false);
      setLimitCV("");
      setLimitCoach("");
      setLimitJobs("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setActing(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteContent.trim()) return;
    setActing(true);
    try {
      await adminPost(`/api/admin/users/${user.id}/add-note`, {
        content: noteContent,
      });
      toast.success("Note ajoutée");
      setNoteOpen(false);
      setNoteContent("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setActing(false);
    }
  };

  const handleResendInvoice = async () => {
    try {
      await adminPost(`/api/admin/users/${user.id}/resend-payment-email`);
      toast.success(`Facture renvoyée à ${user.email}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'envoi");
    }
  };

  const isBanned = user.is_banned === true;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEmailOpen(true)}>
            <Mail className="h-4 w-4 mr-2" />
            Envoyer un email
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleResendInvoice}>
            <Receipt className="h-4 w-4 mr-2" />
            Renvoyer la facture
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAction("reset-password", user.id)}>
            <KeyRound className="h-4 w-4 mr-2" />
            Réinitialiser MDP
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setForcePlanOpen(true)}>
            <ArrowUpDown className="h-4 w-4 mr-2" />
            Changer le plan
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setChangeEmailOpen(true)}>
            <AtSign className="h-4 w-4 mr-2" />
            Changer l'email
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setGrantDaysOpen(true)}>
            <Gift className="h-4 w-4 mr-2" />
            Offrir des jours
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setNoteOpen(true)}>
            <StickyNote className="h-4 w-4 mr-2" />
            Ajouter une note
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setCustomLimitsOpen(true)}>
            <Settings2 className="h-4 w-4 mr-2" />
            Limites personnalisées
          </DropdownMenuItem>
          {user.status === "active" && (
            <DropdownMenuItem onClick={() => setImpersonateOpen(true)}>
              <LogIn className="h-4 w-4 mr-2" />
              Impersonner
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setForceSignoutOpen(true)}>
            <LogOut className="h-4 w-4 mr-2" />
            Forcer déconnexion
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {isBanned ? (
            <DropdownMenuItem
              className="text-green-600"
              onClick={handleUnban}
              disabled={acting}
            >
              <ShieldOff className="h-4 w-4 mr-2" />
              Lever le ban
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              className="text-red-700"
              onClick={() => setBanOpen(true)}
            >
              <Ban className="h-4 w-4 mr-2" />
              Bannir (Auth)
            </DropdownMenuItem>
          )}
          {user.status === "active" ? (
            <DropdownMenuItem
              className="text-orange-600"
              onClick={() => setSuspendOpen(true)}
            >
              <Ban className="h-4 w-4 mr-2" />
              Suspendre
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              className="text-green-600"
              onClick={() => onAction("reactivate", user.id)}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Réactiver
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Supprimer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Suspend dialog */}
      <AlertDialog open={suspendOpen} onOpenChange={setSuspendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspendre {user.email} ?</AlertDialogTitle>
            <AlertDialogDescription>
              L'utilisateur ne pourra plus accéder à l'application.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="reason">Raison de la suspension *</Label>
            <Input
              id="reason"
              placeholder="Ex: violation des CGU, fraude..."
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSuspend}
              disabled={!suspendReason.trim() || acting}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {acting ? "Suspension..." : "Suspendre"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Ban dialog */}
      <AlertDialog open={banOpen} onOpenChange={setBanOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bannir {user.email} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le compte sera banni via Supabase Auth (876 600h) et marqué{" "}
              <code>is_banned=true</code>. La session sera révoquée
              immédiatement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="ban-reason">Raison (optionnel)</Label>
            <Input
              id="ban-reason"
              placeholder="Ex: abus, fraude, spam..."
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBan}
              disabled={acting}
              className="bg-red-700 hover:bg-red-800"
            >
              {acting ? "Bannissement..." : "Bannir définitivement"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Force signout dialog */}
      <AlertDialog open={forceSignoutOpen} onOpenChange={setForceSignoutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Forcer la déconnexion de {user.email} ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tous les tokens actifs seront révoqués. L'utilisateur devra se
              reconnecter sur tous ses appareils.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleForceSignout}>
              Déconnecter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Change email dialog */}
      <AlertDialog open={changeEmailOpen} onOpenChange={setChangeEmailOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Changer l'email de {user.email}</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="new-email">Nouvel email *</Label>
            <Input
              id="new-email"
              type="email"
              placeholder="nouveau@exemple.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleChangeEmail}
              disabled={!newEmail.trim() || acting}
            >
              {acting ? "Mise à jour..." : "Changer l'email"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Grant days dialog */}
      <AlertDialog open={grantDaysOpen} onOpenChange={setGrantDaysOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Offrir des jours à {user.email}</AlertDialogTitle>
            <AlertDialogDescription>
              Extension via Stripe trial si abonnement actif, sinon accès Pro
              temporaire.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="days">Nombre de jours *</Label>
              <Input
                id="days"
                type="number"
                min="1"
                max="365"
                value={grantDays}
                onChange={(e) => setGrantDays(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="grant-reason">Raison (optionnel)</Label>
              <Input
                id="grant-reason"
                placeholder="Ex: compensation bug, geste commercial..."
                value={grantReason}
                onChange={(e) => setGrantReason(e.target.value)}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleGrantDays}
              disabled={!grantDays || parseInt(grantDays) < 1 || acting}
            >
              {acting ? "En cours..." : `Offrir ${grantDays}j`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Note dialog */}
      <AlertDialog open={noteOpen} onOpenChange={setNoteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Ajouter une note sur {user.email}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="note-content">Note interne *</Label>
            <Textarea
              id="note-content"
              placeholder="Note visible uniquement par les admins..."
              rows={4}
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAddNote}
              disabled={!noteContent.trim() || acting}
            >
              {acting ? "Ajout..." : "Ajouter la note"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Custom limits dialog */}
      <AlertDialog open={customLimitsOpen} onOpenChange={setCustomLimitsOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limites personnalisées</AlertDialogTitle>
            <AlertDialogDescription>
              Laissez vide pour conserver la limite du plan. Entrez 0 pour
              revenir aux limites par défaut.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Analyses CV / jour</Label>
              <Input
                type="number"
                min="0"
                placeholder="Limite du plan"
                value={limitCV}
                onChange={(e) => setLimitCV(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Secondes coach / jour</Label>
              <Input
                type="number"
                min="0"
                placeholder="Limite du plan"
                value={limitCoach}
                onChange={(e) => setLimitCoach(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Recherches emploi / jour</Label>
              <Input
                type="number"
                min="0"
                placeholder="Limite du plan"
                value={limitJobs}
                onChange={(e) => setLimitJobs(e.target.value)}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSetCustomLimits}
              disabled={acting}
            >
              {acting ? "Enregistrement..." : "Appliquer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Supprimer définitivement {user.email} ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est <strong>irréversible</strong>. Le compte et
              toutes les données associées seront supprimés définitivement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={acting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {acting ? "Suppression..." : "Supprimer définitivement"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Email dialog */}
      <SendEmailDialog
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        mode="single"
        userId={user.id}
        userEmail={user.email}
      />

      {/* Impersonation confirmation */}
      <AlertDialog open={impersonateOpen} onOpenChange={setImpersonateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Impersonner {user.email} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Un magic link va être généré. Vous serez connecté en tant que cet
              utilisateur dans un nouvel onglet. Cette action est loggée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleImpersonate}>
              Continuer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Force plan dialog */}
      <ForcePlanDialog
        open={forcePlanOpen}
        onClose={() => setForcePlanOpen(false)}
        user={user}
        plans={plans}
        onConfirm={async (planId) => {
          await onAction("force-plan", user.id, planId);
          setForcePlanOpen(false);
        }}
      />
    </>
  );
}
