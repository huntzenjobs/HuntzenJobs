"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Send } from "lucide-react";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "";

async function adminPost(path: string, body: object) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Erreur");
  }
  return res.json();
}

type SingleMode = {
  mode: "single";
  userId: string;
  userEmail: string;
  open: boolean;
  onClose: () => void;
};

type BulkMode = {
  mode: "bulk";
  segment: string;
  open: boolean;
  onClose: () => void;
};

type Props = SingleMode | BulkMode;

const SEGMENT_LABELS: Record<string, string> = {
  "at-risk": "À risque (inactifs 7j+)",
  "about-to-churn": "Bientôt perdus",
  "never-converted": "Jamais convertis",
  "all-paying": "Tous les abonnés",
};

export default function SendEmailDialog(props: Props) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const title =
    props.mode === "single"
      ? `Email à ${props.userEmail}`
      : `Email en masse — ${SEGMENT_LABELS[props.segment] || props.segment}`;

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      toast.error("Sujet et corps requis");
      return;
    }
    setSending(true);
    try {
      if (props.mode === "single") {
        await adminPost(`/api/admin/users/${props.userId}/send-email`, {
          subject,
          body,
        });
        toast.success("Email envoyé");
      } else {
        const result = await adminPost("/api/admin/users/bulk-email", {
          segment: props.segment,
          subject,
          body,
        });
        toast.success(`${result.sent} email(s) envoyé(s)`);
      }
      setSubject("");
      setBody("");
      props.onClose();
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de l'envoi");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="email-subject">Sujet</Label>
            <Input
              id="email-subject"
              placeholder="Ex : Profitez de votre abonnement Huntzen !"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email-body">Corps du message</Label>
            <Textarea
              id="email-body"
              placeholder="Bonjour,&#10;&#10;..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              HTML accepté. Les retours à la ligne simples sont convertis en{" "}
              <code>&lt;br&gt;</code>.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={props.onClose} disabled={sending}>
            Annuler
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            <Send className="h-4 w-4 mr-2" />
            {sending ? "Envoi..." : "Envoyer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
