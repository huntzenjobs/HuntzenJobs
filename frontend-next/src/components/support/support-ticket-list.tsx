"use client";

import { Badge } from "@/components/ui/badge";
import { useSupportTicket } from "@/hooks/use-support";

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  open: { label: "Ouvert", variant: "default" },
  in_progress: { label: "En cours", variant: "secondary" },
  resolved: { label: "Résolu ✓", variant: "outline" },
  closed: { label: "Fermé", variant: "outline" },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  return `Il y a ${days}j`;
}

export function SupportTicketList() {
  const { myTickets, isLoading } = useSupportTicket();

  if (isLoading) return null;
  if (myTickets.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Mes tickets récents</p>
      {myTickets.map((ticket) => {
        const status = STATUS_LABELS[ticket.status] || STATUS_LABELS.open;
        return (
          <div key={ticket.id} className="flex items-start justify-between gap-2 p-2.5 rounded-lg border border-border bg-muted/30 text-xs">
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">#{ticket.short_id} — {ticket.subject}</p>
              <p className="text-muted-foreground mt-0.5">{timeAgo(ticket.created_at)}</p>
            </div>
            <Badge variant={status.variant} className="text-[10px] shrink-0">{status.label}</Badge>
          </div>
        );
      })}
    </div>
  );
}
