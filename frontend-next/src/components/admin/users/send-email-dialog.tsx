"use client";

import { useEffect, useMemo, useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface CampaignPreview {
  campaign_type: "service-update" | "marketing-reactivation";
  template_version: string;
  recipient_count: number;
  subject: string;
  html: string;
}

async function adminRequest(path: string, init?: RequestInit) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");
  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || "Erreur");
  }
  return response.json();
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
  "active-accounts": "Comptes actifs",
  "newsletter-subscribers": "Communications acceptées",
};

function campaignTypeForSegment(segment: string | undefined) {
  if (segment === "active-accounts") return "service-update";
  if (segment === "newsletter-subscribers") return "marketing-reactivation";
  return null;
}

export default function SendEmailDialog(props: Props) {
  const segment = props.mode === "bulk" ? props.segment : undefined;
  const campaignType = campaignTypeForSegment(segment);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState<CampaignPreview | null>(null);
  const [campaignId, setCampaignId] = useState(() => crypto.randomUUID());
  const [confirmed, setConfirmed] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!props.open || !campaignType) return;
    let cancelled = false;
    setLoadingPreview(true);
    setConfirmed(false);
    adminRequest(`/api/admin/campaigns/${campaignType}/preview`)
      .then((data: CampaignPreview) => {
        if (cancelled) return;
        setPreview(data);
        setSubject(data.subject);
        setBody(data.html);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          toast.error(
            error instanceof Error ? error.message : "Aperçu indisponible",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignType, props.open]);

  const title = useMemo(
    () =>
      props.mode === "single"
        ? `Email à ${props.userEmail}`
        : `Email en masse : ${SEGMENT_LABELS[props.segment] || props.segment}`,
    [props],
  );

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      toast.error("Sujet et corps requis");
      return;
    }
    if (campaignType && (!preview || !confirmed)) {
      toast.error("Confirmez le nombre exact de destinataires");
      return;
    }
    setSending(true);
    try {
      if (props.mode === "single") {
        await adminRequest(`/api/admin/users/${props.userId}/send-email`, {
          method: "POST",
          body: JSON.stringify({ subject, body }),
        });
        toast.success("Email envoyé");
      } else if (campaignType && preview) {
        const result = await adminRequest(
          `/api/admin/campaigns/${campaignType}/send`,
          {
            method: "POST",
            body: JSON.stringify({
              campaign_id: campaignId,
              confirmed_recipient_count: preview.recipient_count,
            }),
          },
        );
        if (!result.ok) {
          throw new Error(
            result.status === "running"
              ? "Un envoi est encore en cours. Gardez cet identifiant de campagne."
              : "La campagne exige une vérification manuelle.",
          );
        }
        toast.success(
          `${result.sent} envoyé(s), ${result.skipped} ignoré(s), ${result.failed} en échec`,
        );
      } else {
        const result = await adminRequest("/api/admin/users/bulk-email", {
          method: "POST",
          body: JSON.stringify({ segment: props.segment, subject, body }),
        });
        toast.success(`${result.sent} email(s) envoyé(s)`);
      }
      setSubject("");
      setBody("");
      setPreview(null);
      setConfirmed(false);
      setCampaignId(crypto.randomUUID());
      props.onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erreur lors de l'envoi",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {loadingPreview && (
            <p className="text-sm text-muted-foreground">
              Chargement de l&apos;aperçu…
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email-subject">Sujet</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              readOnly={Boolean(campaignType)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email-body">Corps du message</Label>
            <Textarea
              id="email-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={8}
              readOnly={Boolean(campaignType)}
              className="font-mono text-sm"
            />
            {campaignType && (
              <p className="text-xs text-muted-foreground">
                Modèle verrouillé côté serveur, version{" "}
                {preview?.template_version || "…"}.
              </p>
            )}
          </div>

          {body.trim().startsWith("<") && (
            <details
              className="rounded-lg border bg-muted/20 p-3"
              open={Boolean(campaignType)}
            >
              <summary className="cursor-pointer text-sm font-medium">
                Prévisualiser l&apos;email
              </summary>
              <iframe
                title="Aperçu de la campagne"
                srcDoc={body}
                sandbox=""
                className="mt-3 h-[520px] w-full rounded-md border bg-white"
              />
            </details>
          )}

          {campaignType && preview && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-slate-900">
              <Checkbox
                id="confirm-recipient-count"
                checked={confirmed}
                onCheckedChange={(checked) => setConfirmed(checked === true)}
              />
              <Label
                htmlFor="confirm-recipient-count"
                className="font-normal leading-5"
              >
                Je confirme l&apos;envoi à {preview.recipient_count} destinataire(s).
                L&apos;audience sera figée et ne pourra pas être élargie lors
                d&apos;une reprise.
              </Label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={props.onClose} disabled={sending}>
            Annuler
          </Button>
          <Button
            onClick={handleSend}
            disabled={
              sending || loadingPreview || Boolean(campaignType && !confirmed)
            }
          >
            <Send className="mr-2 h-4 w-4" />
            {sending ? "Envoi…" : "Envoyer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
