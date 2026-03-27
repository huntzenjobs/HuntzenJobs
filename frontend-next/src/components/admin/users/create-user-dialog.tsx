"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AdminPlan } from "@/types/admin";

interface Props {
  plans: AdminPlan[];
  onCreateUser: (data: {
    email: string;
    full_name: string;
    plan_name?: string;
    send_invite?: boolean;
  }) => Promise<unknown>;
  onCreated: () => void;
}

export default function CreateUserDialog({ plans, onCreateUser, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [planName, setPlanName] = useState("free");
  const [sendInvite, setSendInvite] = useState(true);
  const [creating, setCreating] = useState(false);

  const reset = () => {
    setEmail("");
    setFullName("");
    setPlanName("free");
    setSendInvite(true);
  };

  const handleSubmit = async () => {
    if (!email.trim() || !fullName.trim()) return;
    setCreating(true);
    const result = await onCreateUser({
      email: email.trim(),
      full_name: fullName.trim(),
      plan_name: planName === "free" ? undefined : planName,
      send_invite: sendInvite,
    });
    setCreating(false);
    if (result) {
      reset();
      setOpen(false);
      onCreated();
    }
  };

  const paidPlans = plans.filter((p) => p.name !== "free");

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); setOpen(o); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus className="h-4 w-4 mr-2" />
          Créer un compte
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Créer un nouveau compte</DialogTitle>
          <DialogDescription>
            Le compte sera créé et l&apos;utilisateur recevra un email d&apos;invitation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="create-email">Adresse email</Label>
            <Input
              id="create-email"
              type="email"
              placeholder="exemple@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-name">Nom complet</Label>
            <Input
              id="create-name"
              placeholder="Jean Dupont"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Plan à assigner</Label>
            <Select value={planName} onValueChange={setPlanName}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir un plan..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="free">Gratuit (aucun plan)</SelectItem>
                {paidPlans.map((plan) => (
                  <SelectItem key={plan.name} value={plan.name}>
                    {plan.display_name} ({plan.price_monthly}€/mois)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="send-invite"
              checked={sendInvite}
              onCheckedChange={(checked) => setSendInvite(checked === true)}
            />
            <Label htmlFor="send-invite" className="text-sm font-normal cursor-pointer">
              Envoyer une invitation par email (magic link)
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={creating}>
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={creating || !email.trim() || !fullName.trim()}
          >
            {creating ? "Création..." : "Créer le compte"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
