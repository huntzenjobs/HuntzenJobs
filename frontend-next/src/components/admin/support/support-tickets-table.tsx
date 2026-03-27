"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAdminSupport, type AdminTicket } from "@/hooks/admin/use-admin-support";
import { TicketDetailDrawer } from "./ticket-detail-drawer";

const PRIORITY_BADGE: Record<string, string> = {
  urgent: "🔴 Urgent",
  normal: "🟡 Normal",
  low: "🟢 Faible",
};
const STATUS_BADGE: Record<string, { label: string; class: string }> = {
  open: { label: "Ouvert", class: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  in_progress: { label: "En cours", class: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  resolved: { label: "Résolu", class: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  closed: { label: "Fermé", class: "bg-muted text-muted-foreground" },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  return `${days}j`;
}

export function SupportTicketsTable() {
  const { tickets, stats, isLoading, filters, setFilters, updateTicket } = useAdminSupport();
  const [selected, setSelected] = useState<AdminTicket | null>(null);

  const STATUS_TABS = [
    { value: "open", label: `Ouverts (${stats.open})` },
    { value: "in_progress", label: `En cours (${stats.in_progress})` },
    { value: "resolved", label: `Résolus` },
    { value: "all", label: "Tous" },
  ];

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Ouverts", value: stats.open, color: "text-blue-600" },
          { label: "En cours", value: stats.in_progress, color: "text-orange-500" },
          { label: "Résolus", value: stats.resolved, color: "text-green-600" },
          { label: "% Résolus", value: `${stats.resolved_pct}%`, color: "text-muted-foreground" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border p-3 text-center">
            <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-border">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilters((f) => ({ ...f, status: tab.value }))}
            className={cn(
              "px-3 py-2 text-sm transition-colors",
              filters.status === tab.value
                ? "border-b-2 border-huntzen-blue font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search + filters */}
      <div className="flex gap-2">
        <Input
          placeholder="Rechercher..."
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          className="max-w-xs h-8 text-sm"
        />
        <Select value={filters.category || "all"} onValueChange={(v) => setFilters((f) => ({ ...f, category: v === "all" ? "" : v }))}>
          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Catégorie" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes</SelectItem>
            <SelectItem value="bug">Bug</SelectItem>
            <SelectItem value="question">Question</SelectItem>
            <SelectItem value="suggestion">Suggestion</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.priority || "all"} onValueChange={(v) => setFilters((f) => ({ ...f, priority: v === "all" ? "" : v }))}>
          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Priorité" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="low">Faible</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">#</th>
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Utilisateur</th>
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Sujet</th>
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Priorité</th>
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Statut</th>
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Date</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">Chargement...</td></tr>
            )}
            {!isLoading && tickets.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">Aucun ticket</td></tr>
            )}
            {tickets.map((ticket) => {
              const st = STATUS_BADGE[ticket.status] || STATUS_BADGE.open;
              return (
                <tr
                  key={ticket.id}
                  onClick={() => setSelected(ticket)}
                  className="border-t border-border hover:bg-muted/30 cursor-pointer transition-colors"
                >
                  <td className="px-3 py-2.5 text-xs text-muted-foreground font-mono">{ticket.short_id}</td>
                  <td className="px-3 py-2.5">
                    <p className="text-xs font-medium truncate max-w-[120px]">{ticket.user_name || ticket.user_email}</p>
                    <p className="text-[10px] text-muted-foreground">{ticket.user_plan}</p>
                  </td>
                  <td className="px-3 py-2.5 text-xs max-w-[200px] truncate">{ticket.subject}</td>
                  <td className="px-3 py-2.5 text-xs">{PRIORITY_BADGE[ticket.priority]}</td>
                  <td className="px-3 py-2.5">
                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium", st.class)}>{st.label}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{timeAgo(ticket.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Detail drawer */}
      {selected && (
        <TicketDetailDrawer
          ticket={selected}
          onClose={() => setSelected(null)}
          onUpdate={async (id, update) => {
            try {
              await updateTicket(id, update);
              setSelected(null);
              toast.success("Ticket mis à jour");
            } catch {
              toast.error("Erreur lors de la mise à jour");
            }
          }}
        />
      )}
    </div>
  );
}
