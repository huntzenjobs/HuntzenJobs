"use client";

import { useRef, useState } from "react";
import { Loader2, Paperclip, RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  type AdminTicket,
  type AdminTicketMessage,
} from "@/hooks/admin/use-admin-support";

const TICKET_STATUSES = new Set(["open", "in_progress", "resolved", "closed"]);

function systemStatus(content: string): string | null {
  if (!content.startsWith("status:")) return null;
  const status = content.slice("status:".length);
  return TICKET_STATUSES.has(status) ? status : null;
}

interface TicketUpdate {
  request_id: string;
  status?: string;
  admin_reply?: string;
}

interface TicketDetailDrawerProps {
  ticket: AdminTicket;
  messages: AdminTicketMessage[];
  messagesLoading: boolean;
  messagesError?: string;
  onRetryMessages: () => void;
  onClose: () => void;
  onUpdate: (id: string, update: TicketUpdate) => Promise<void>;
}

export function TicketDetailDrawer({
  ticket,
  messages,
  messagesLoading,
  messagesError,
  onRetryMessages,
  onClose,
  onUpdate,
}: TicketDetailDrawerProps) {
  const t = useTranslations("adminSupport.drawer");
  const locale = useLocale();
  const [status, setStatus] = useState<string>(ticket.status);
  const [reply, setReply] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const requestIdRef = useRef<string | null>(null);
  const hasChanges = status !== ticket.status || reply.trim().length > 0;

  const handleSave = async () => {
    if (!hasChanges) return;
    requestIdRef.current ??= crypto.randomUUID();
    setIsSaving(true);
    try {
      await onUpdate(ticket.id, {
        request_id: requestIdRef.current,
        status: status !== ticket.status ? status : undefined,
        admin_reply: reply.trim() || undefined,
      });
      requestIdRef.current = null;
    } catch {
      // Le parent affiche l'erreur; conserver l'identifiant permet un retry sûr.
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        closeLabel={t("close")}
        className="w-full overflow-y-auto sm:max-w-[520px]"
      >
        <SheetHeader className="border-l-4 border-l-huntzen-turquoise">
          <SheetTitle>{t("ticketTitle", { id: ticket.short_id })}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6 text-sm">
          <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-xs">
            <p><span className="font-medium">{t("emailLabel")}</span> {ticket.user_email}</p>
            <p><span className="font-medium">{t("planLabel")}</span> {ticket.user_plan || t("notAvailable")}</p>
            <p><span className="font-medium">{t("pageLabel")}</span> {ticket.page_url || t("notAvailable")}</p>
            <p><span className="font-medium">{t("dateLabel")}</span> {new Date(ticket.created_at).toLocaleString(locale)}</p>
          </div>

          <div className="flex gap-2">
            <Badge variant="outline">{t(`categories.${ticket.category}`)}</Badge>
            <Badge
              variant="outline"
              className={
                ticket.priority === "urgent"
                  ? "border-red-500 text-red-600"
                  : ticket.priority === "low"
                    ? "border-green-500 text-green-600"
                    : ""
              }
            >
              {t(`priorities.${ticket.priority}`)}
            </Badge>
          </div>

          <div>
            <p className="font-semibold">{ticket.subject}</p>
            <p className="mt-1.5 whitespace-pre-wrap text-muted-foreground">
              {ticket.description}
            </p>
          </div>

          {ticket.attachment_signed_url && (
            <a
              href={ticket.attachment_signed_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-huntzen-blue hover:underline"
            >
              <Paperclip className="h-3.5 w-3.5" />
              {t("viewAttachment")}
            </a>
          )}

          <section aria-labelledby="support-history-title" className="space-y-2">
            <p id="support-history-title" className="text-xs font-medium">
              {t("historyTitle")}
            </p>
            {messagesLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("historyLoading")}
              </div>
            )}
            {messagesError && !messagesLoading && (
              <div className="rounded-lg border border-destructive/30 p-3 text-xs">
                <p className="text-destructive">{messagesError}</p>
                <Button variant="ghost" size="sm" className="mt-1 h-7 px-2" onClick={onRetryMessages}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t("retry")}
                </Button>
              </div>
            )}
            {!messagesLoading && !messagesError && messages.length === 0 && (
              <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                {t("historyEmpty")}
              </p>
            )}
            {!messagesLoading && messages.length > 0 && (
              <ol className="space-y-3 border-l border-huntzen-turquoise/50 pl-4">
                {messages.map((message) => {
                  const status =
                    message.author_role === "system"
                      ? systemStatus(message.content)
                      : null;
                  return (
                    <li key={message.id} className="relative text-xs">
                      <span className="absolute -left-[19px] top-1 h-1.5 w-1.5 rounded-full bg-huntzen-turquoise" />
                      <p className="font-medium">{t(`authors.${message.author_role}`)}</p>
                      <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">
                        {status
                          ? t("statusChanged", {
                              status: t(`statuses.${status}`),
                            })
                          : message.content}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <div className="space-y-1">
            <p className="text-xs font-medium">{t("statusLabel")}</p>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">{t("statuses.open")}</SelectItem>
                <SelectItem value="in_progress">{t("statuses.in_progress")}</SelectItem>
                <SelectItem value="resolved">{t("statuses.resolved")}</SelectItem>
                <SelectItem value="closed">{t("statuses.closed")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label htmlFor="admin-support-reply" className="text-xs font-medium">
              {t("replyLabel")}
            </label>
            <Textarea
              id="admin-support-reply"
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              placeholder={t("replyPlaceholder")}
              rows={5}
              className="text-xs"
            />
          </div>

          <Button
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            className="w-full"
          >
            {isSaving ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("sending")}</>
            ) : t("sendReply")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
