"use client";

import { useState } from "react";
import { Megaphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "";

const SEGMENTS = [
  { value: "all", label: "Tous les utilisateurs actifs" },
  { value: "paying", label: "Abonnés payants" },
  { value: "free", label: "Utilisateurs gratuits" },
  { value: "at-risk", label: "À risque (inactifs 7j+)" },
];

const NOTIF_TYPES = [
  { value: "job_alert", label: "Alerte emploi" },
  { value: "cv_feedback", label: "Retour CV" },
  { value: "referral_bonus", label: "Bonus parrainage" },
  { value: "promo_code", label: "Code promo" },
  { value: "career_progress", label: "Progression carrière" },
  { value: "interview_ready", label: "Prêt pour l'entretien" },
  { value: "win_back_7d", label: "Réactivation 7j" },
];

async function adminFetch(path: string, options?: RequestInit) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Non authentifié");
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

export default function BroadcastNotificationDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [segment, setSegment] = useState("all");
  const [type, setType] = useState("promo_code");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error("Titre et message requis");
      return;
    }
    setLoading(true);
    try {
      const data = await adminFetch("/api/admin/broadcast-notification", {
        method: "POST",
        body: JSON.stringify({ segment, type, title, body }),
      });
      toast.success(
        `Notification envoyée à ${data.sent} / ${data.total} utilisateurs`,
      );
      setOpen(false);
      setTitle("");
      setBody("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'envoi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Megaphone className="h-4 w-4 mr-2" />
          Broadcast
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Notification broadcast</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Segment</Label>
            <Select value={segment} onValueChange={setSegment}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEGMENTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Type de notification</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTIF_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Titre</Label>
            <Input
              placeholder="Ex : Nouvelle fonctionnalité disponible"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Message</Label>
            <Textarea
              placeholder="Contenu de la notification..."
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Annuler
            </Button>
            <Button
              onClick={handleSend}
              disabled={loading || !title.trim() || !body.trim()}
            >
              {loading ? "Envoi..." : "Envoyer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
