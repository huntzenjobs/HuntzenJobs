"use client";

import { useState } from "react";
import { ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  type SupportTicket,
  type SupportTicketController,
} from "@/hooks/use-support";
import { cn } from "@/lib/utils";

const STATUS_VARIANTS: Record<
  SupportTicket["status"],
  "default" | "secondary" | "outline"
> = {
  open: "default",
  in_progress: "secondary",
  resolved: "outline",
  closed: "outline",
};

function systemStatus(content: string): SupportTicket["status"] | null {
  if (!content.startsWith("status:")) return null;
  const status = content.slice("status:".length);
  return Object.hasOwn(STATUS_VARIANTS, status)
    ? (status as SupportTicket["status"])
    : null;
}

interface SupportTicketListProps {
  controller: Pick<
    SupportTicketController,
    | "myTickets"
    | "isLoading"
    | "ticketsError"
    | "ticketMessages"
    | "messageLoading"
    | "messageErrors"
    | "fetchTicketMessages"
    | "refetch"
  >;
}

export function SupportTicketList({ controller }: SupportTicketListProps) {
  const t = useTranslations("support.ticketList");
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
  const {
    myTickets,
    isLoading,
    ticketsError,
    ticketMessages,
    messageLoading,
    messageErrors,
    fetchTicketMessages,
    refetch,
  } = controller;

  const toggleTicket = (ticketId: string) => {
    const isOpening = expandedTicketId !== ticketId;
    setExpandedTicketId(isOpening ? ticketId : null);
    if (isOpening) void fetchTicketMessages(ticketId);
  };

  const timeAgo = (dateStr: string) => {
    const days = Math.floor(
      (Date.now() - new Date(dateStr).getTime()) / 86400000,
    );
    if (days <= 0) return t("today");
    if (days === 1) return t("yesterday");
    return t("daysAgo", { days });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-5 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("loading")}
      </div>
    );
  }

  if (ticketsError) {
    return (
      <div className="rounded-lg border border-destructive/30 p-3 text-xs">
        <p className="text-destructive">{ticketsError}</p>
        <Button
          className="mt-2"
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t("retry")}
        </Button>
      </div>
    );
  }

  if (myTickets.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
        {t("empty")}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{t("title")}</p>
      {myTickets.map((ticket) => {
        const isExpanded = expandedTicketId === ticket.id;
        const messages = ticketMessages[ticket.id] || [];
        return (
          <div
            key={ticket.id}
            className="overflow-hidden rounded-lg border border-border bg-background"
          >
            <button
              type="button"
              aria-expanded={isExpanded}
              onClick={() => toggleTicket(ticket.id)}
              className="flex w-full items-start justify-between gap-2 p-3 text-left text-xs transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-huntzen-blue focus-visible:ring-inset"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  #{ticket.short_id} · {ticket.subject}
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  {timeAgo(ticket.created_at)}
                </p>
              </div>
              <Badge
                variant={STATUS_VARIANTS[ticket.status]}
                className="shrink-0 text-[10px]"
              >
                {t(`status.${ticket.status}`)}
              </Badge>
              <ChevronDown
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0 transition-transform",
                  isExpanded && "rotate-180",
                )}
              />
            </button>

            {isExpanded && (
              <div className="border-t border-border bg-muted/20 px-3 py-3">
                {messageLoading[ticket.id] && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("messagesLoading")}
                  </div>
                )}
                {messageErrors[ticket.id] && !messageLoading[ticket.id] && (
                  <div className="text-xs">
                    <p className="text-destructive">
                      {messageErrors[ticket.id]}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1 h-7 px-2"
                      onClick={() => void fetchTicketMessages(ticket.id)}
                    >
                      {t("retry")}
                    </Button>
                  </div>
                )}
                {!messageLoading[ticket.id] &&
                  !messageErrors[ticket.id] &&
                  messages.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t("messagesEmpty")}
                    </p>
                  )}
                {!messageLoading[ticket.id] && messages.length > 0 && (
                  <ol className="space-y-3 border-l border-huntzen-turquoise/50 pl-3">
                    {messages.map((message) => {
                      const status =
                        message.author_role === "system"
                          ? systemStatus(message.content)
                          : null;
                      return (
                        <li key={message.id} className="relative text-xs">
                          <span className="absolute -left-[15px] top-1 h-1.5 w-1.5 rounded-full bg-huntzen-turquoise" />
                          <p className="font-medium">
                            {t(`authors.${message.author_role}`)}
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">
                            {status
                              ? t("statusChanged", {
                                  status: t(`status.${status}`),
                                })
                              : message.content}
                          </p>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
