"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type AdminTicket,
  useAdminSupport,
} from "@/hooks/admin/use-admin-support";
import { cn } from "@/lib/utils";
import { TicketDetailDrawer } from "./ticket-detail-drawer";

const STATUS_CLASS: Record<string, string> = {
  open: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  in_progress:
    "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  resolved:
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  closed: "bg-muted text-muted-foreground",
};

export function SupportTicketsTable() {
  const t = useTranslations("adminSupport.table");
  const {
    tickets,
    stats,
    isLoading,
    error,
    filters,
    setFilters,
    page,
    setPage,
    hasNextPage,
    ticketMessages,
    messageLoading,
    messageErrors,
    fetchTicketMessages,
    updateTicket,
    refetch,
  } = useAdminSupport();
  const [selected, setSelected] = useState<AdminTicket | null>(null);

  const statusTabs = [
    { value: "open", label: t("tabs.open", { count: stats.open }) },
    {
      value: "in_progress",
      label: t("tabs.inProgress", { count: stats.in_progress }),
    },
    { value: "resolved", label: t("tabs.resolved") },
    { value: "all", label: t("tabs.all") },
  ];

  const timeAgo = (dateStr: string) => {
    const days = Math.floor(
      (Date.now() - new Date(dateStr).getTime()) / 86400000,
    );
    if (days <= 0) return t("today");
    if (days === 1) return t("yesterday");
    return t("daysAgo", { days });
  };

  const openTicket = (ticket: AdminTicket) => {
    setSelected(ticket);
    void fetchTicketMessages(ticket.id);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: t("stats.open"), value: stats.open, color: "text-blue-600" },
          { label: t("stats.inProgress"), value: stats.in_progress, color: "text-orange-500" },
          { label: t("stats.resolved"), value: stats.resolved, color: "text-green-600" },
          { label: t("stats.resolvedPercent"), value: `${stats.resolved_pct}%`, color: "text-muted-foreground" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border p-3 text-center">
            <p className={cn("text-2xl font-bold", stat.color)}>{stat.value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {statusTabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setFilters((current) => ({ ...current, status: tab.value }))}
            className={cn(
              "shrink-0 px-3 py-2 text-sm transition-colors",
              filters.status === tab.value
                ? "border-b-2 border-huntzen-blue font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          aria-label={t("searchLabel")}
          placeholder={t("searchPlaceholder")}
          value={filters.search}
          onChange={(event) =>
            setFilters((current) => ({ ...current, search: event.target.value }))
          }
          className="h-8 w-full text-sm sm:max-w-xs"
        />
        <Select
          value={filters.category || "all"}
          onValueChange={(value) =>
            setFilters((current) => ({
              ...current,
              category: value === "all" ? "" : value,
            }))
          }
        >
          <SelectTrigger aria-label={t("categoryLabel")} className="h-8 w-full text-xs sm:w-36">
            <SelectValue placeholder={t("categoryLabel")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allCategories")}</SelectItem>
            <SelectItem value="bug">{t("categories.bug")}</SelectItem>
            <SelectItem value="question">{t("categories.question")}</SelectItem>
            <SelectItem value="suggestion">{t("categories.suggestion")}</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filters.priority || "all"}
          onValueChange={(value) =>
            setFilters((current) => ({
              ...current,
              priority: value === "all" ? "" : value,
            }))
          }
        >
          <SelectTrigger aria-label={t("priorityLabel")} className="h-8 w-full text-xs sm:w-36">
            <SelectValue placeholder={t("priorityLabel")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allPriorities")}</SelectItem>
            <SelectItem value="urgent">{t("priorities.urgent")}</SelectItem>
            <SelectItem value="normal">{t("priorities.normal")}</SelectItem>
            <SelectItem value="low">{t("priorities.low")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-destructive/30 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
            {t("retry")}
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="min-w-[720px] w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">#</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("columns.user")}</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("columns.subject")}</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("columns.priority")}</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("columns.status")}</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("columns.date")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />{t("loading")}
                  </span>
                </td>
              </tr>
            )}
            {!isLoading && tickets.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">{t("empty")}</td>
              </tr>
            )}
            {!isLoading && tickets.map((ticket) => (
              <tr
                key={ticket.id}
                tabIndex={0}
                aria-label={t("openTicket", { id: ticket.short_id })}
                onClick={() => openTicket(ticket)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openTicket(ticket);
                  }
                }}
                className="cursor-pointer border-t border-border transition-colors hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-huntzen-blue focus-visible:ring-inset"
              >
                <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{ticket.short_id}</td>
                <td className="px-3 py-2.5">
                  <p className="max-w-[120px] truncate text-xs font-medium">{ticket.user_name || ticket.user_email}</p>
                  <p className="text-[10px] text-muted-foreground">{ticket.user_plan}</p>
                </td>
                <td className="max-w-[200px] truncate px-3 py-2.5 text-xs">{ticket.subject}</td>
                <td className="px-3 py-2.5 text-xs">{t(`priorities.${ticket.priority}`)}</td>
                <td className="px-3 py-2.5">
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_CLASS[ticket.status] || STATUS_CLASS.open)}>
                    {t(`statuses.${ticket.status}`)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{timeAgo(ticket.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" aria-label={t("previousPage")} disabled={page <= 1 || isLoading} onClick={() => setPage(Math.max(1, page - 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-20 text-center text-xs text-muted-foreground">{t("pageLabel", { page })}</span>
        <Button variant="outline" size="sm" aria-label={t("nextPage")} disabled={!hasNextPage || isLoading} onClick={() => setPage(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {selected && (
        <TicketDetailDrawer
          ticket={selected}
          messages={ticketMessages[selected.id] || []}
          messagesLoading={Boolean(messageLoading[selected.id])}
          messagesError={messageErrors[selected.id]}
          onRetryMessages={() => void fetchTicketMessages(selected.id)}
          onClose={() => setSelected(null)}
          onUpdate={async (id, update) => {
            try {
              await updateTicket(id, update);
              setSelected(null);
              toast.success(t("updateSuccess"));
            } catch (updateError) {
              toast.error(t("updateError"));
              throw updateError;
            }
          }}
        />
      )}
    </div>
  );
}
