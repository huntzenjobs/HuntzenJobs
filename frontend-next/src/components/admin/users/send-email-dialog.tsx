"use client";

import { useEffect, useMemo, useState } from "react";
import { Send } from "lucide-react";
import { useTranslations } from "next-intl";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface CampaignPreview {
  campaign_type:
    "service-update" | "marketing-reactivation" | "marketing-reactivation-all";
  template_version: string;
  recipient_count: number;
  subject: string;
  main_text: string;
  html: string;
  html_template: string;
}

type EditorMode = "simple" | "html";

export function campaignFailureMessage(status: string): string {
  if (status === "running") {
    return "Un envoi est encore en cours. Gardez cet identifiant de campagne.";
  }
  if (status === "deferred") {
    return "Quota email atteint. La campagne est conservée et pourra reprendre avec le même identifiant.";
  }
  return "La campagne exige une vérification manuelle.";
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
  "all-active-marketing": "Tous les comptes actifs",
};

function campaignTypeForSegment(segment: string | undefined) {
  if (segment === "active-accounts") return "service-update";
  if (segment === "newsletter-subscribers") return "marketing-reactivation";
  if (segment === "all-active-marketing") return "marketing-reactivation-all";
  return null;
}

export default function SendEmailDialog(props: Props) {
  const t = useTranslations("adminEmailCampaign");
  const segment = props.mode === "bulk" ? props.segment : undefined;
  const campaignType = campaignTypeForSegment(segment);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [editorMode, setEditorMode] = useState<EditorMode>("simple");
  const [mainText, setMainText] = useState("");
  const [htmlTemplate, setHtmlTemplate] = useState("");
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
        setEditorMode("simple");
        setMainText(data.main_text);
        setHtmlTemplate(data.html_template);
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
    const campaignContent = editorMode === "simple" ? mainText : htmlTemplate;
    if (!subject.trim() || !(campaignType ? campaignContent : body).trim()) {
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
              editor_mode: editorMode,
              subject,
              ...(editorMode === "simple"
                ? { main_text: mainText }
                : { html_template: htmlTemplate }),
            }),
          },
        );
        if (!result.ok) {
          throw new Error(campaignFailureMessage(result.status));
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
      setMainText("");
      setHtmlTemplate("");
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
            />
          </div>

          {campaignType ? (
            <Tabs
              value={editorMode}
              onValueChange={(value) => setEditorMode(value as EditorMode)}
              className="space-y-4"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="simple">{t("simpleMode")}</TabsTrigger>
                <TabsTrigger value="html">{t("htmlMode")}</TabsTrigger>
              </TabsList>
              <TabsContent value="simple" className="space-y-1.5">
                <Label htmlFor="campaign-main-text">{t("mainText")}</Label>
                <Textarea
                  id="campaign-main-text"
                  value={mainText}
                  onChange={(event) => setMainText(event.target.value)}
                  rows={8}
                />
                <p className="text-xs text-muted-foreground">
                  {t("simpleHelp")}
                </p>
              </TabsContent>
              <TabsContent value="html" className="space-y-1.5">
                <Label htmlFor="campaign-html">{t("fullHtml")}</Label>
                <Textarea
                  id="campaign-html"
                  value={htmlTemplate}
                  onChange={(event) => setHtmlTemplate(event.target.value)}
                  rows={14}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  {t("htmlHelp", {
                    firstName: "{{first_name}}",
                    appUrl: "{{app_url}}",
                  })}
                </p>
              </TabsContent>
              <p className="text-xs text-muted-foreground">
                {t("frozenHelp", {
                  version: preview?.template_version || "…",
                })}
              </p>
            </Tabs>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="email-body">Corps du message</Label>
              <Textarea
                id="email-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={8}
                className="font-mono text-sm"
              />
            </div>
          )}

          {editorMode === "html" && htmlTemplate.trim().startsWith("<") && (
            <details
              className="rounded-lg border bg-muted/20 p-3"
              open
            >
              <summary className="cursor-pointer text-sm font-medium">
                Prévisualiser l&apos;email
              </summary>
              <iframe
                title="Aperçu de la campagne"
                srcDoc={htmlTemplate}
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
                Je confirme l&apos;envoi à {preview.recipient_count}{" "}
                destinataire(s). L&apos;audience sera figée et ne pourra pas
                être élargie lors d&apos;une reprise.
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
